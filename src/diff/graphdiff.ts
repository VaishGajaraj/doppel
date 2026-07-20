import type { GraphNode, JsonValue, ValueGraph } from '../contract/types.ts';
import { canonicalize } from '../contract/jcs.ts';

export interface DiffEntry {
  path: string;
  expected: string;
  actual: string;
  note?: string;
}

/** Resolve a subgraph into a plain JSON tree (cycles become "~cycle"). */
function resolveNode(g: ValueGraph, idx: number, visited: Set<number>): JsonValue {
  if (visited.has(idx)) return '~cycle';
  const node = g.n[idx];
  if (!node) return '~dangling';
  visited.add(idx);
  try {
    switch (node[0]) {
      case 'prim':
        return node[1];
      case 'arr':
        return node[1].map((i) => resolveNode(g, i, visited));
      case 'set':
        return ['set', node[1].map((i) => resolveNode(g, i, visited))];
      case 'map':
        return [
          'map',
          node[1].map(([k, v]) => [resolveNode(g, k, visited), resolveNode(g, v, visited)]),
        ];
      case 'obj': {
        const out: Record<string, JsonValue> = {};
        for (const [key, child] of node[1]) out[key] = resolveNode(g, child, visited);
        if (node[2]) out['@class'] = node[2];
        return out;
      }
      case 'err':
        return { '@error': node[1].name, message: node[1].message, ...(node[1].code ? { code: node[1].code } : {}) };
      default:
        return node as unknown as JsonValue;
    }
  } finally {
    visited.delete(idx);
  }
}

/** Canonical string for a subgraph — used for Map-key alignment and Set comparison. */
export function canonKey(g: ValueGraph, idx: number): string {
  return canonicalize(resolveNode(g, idx, new Set()));
}

/** Short human rendering of a subgraph for reports. */
export function render(g: ValueGraph, idx: number, maxLen = 120): string {
  const s = canonKey(g, idx);
  return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
}

function nodeKindLabel(node: GraphNode): string {
  if (node[0] === 'prim') return node[1] === null ? 'null' : typeof node[1];
  return node[0];
}

/**
 * Structural diff of two value graphs. Walks both graphs from the roots with
 * pair memoization, so shared references and cycles terminate. Produces
 * report-ready path-level entries.
 */
export function diffGraphs(expected: ValueGraph, actual: ValueGraph, rootPath: string): DiffEntry[] {
  const out: DiffEntry[] = [];
  const seen = new Set<string>();

  function emit(path: string, ie: number, ia: number, note?: string): void {
    out.push({
      path,
      expected: render(expected, ie),
      actual: render(actual, ia),
      ...(note ? { note } : {}),
    });
  }

  function cmp(ie: number, ia: number, path: string): void {
    const pairKey = ie + ':' + ia;
    if (seen.has(pairKey)) return;
    seen.add(pairKey);

    const ne = expected.n[ie];
    const na = actual.n[ia];
    if (!ne || !na) {
      if (ne !== na) emit(path, ie, ia, 'dangling reference');
      return;
    }
    if (ne[0] !== na[0]) {
      emit(path, ie, ia, `kind changed: ${nodeKindLabel(ne)} -> ${nodeKindLabel(na)}`);
      return;
    }

    switch (ne[0]) {
      case 'prim': {
        const va = (na as typeof ne)[1];
        if (ne[1] !== va) {
          const te = ne[1] === null ? 'null' : typeof ne[1];
          const ta = va === null ? 'null' : typeof va;
          emit(path, ie, ia, te !== ta ? `kind changed: ${te} -> ${ta}` : undefined);
        }
        return;
      }
      case 'num':
      case 'bigint':
      case 'date':
      case 'bytes':
      case 'symbol':
      case 'fn':
      case 'redacted':
      case 'opaque': {
        const va = (na as typeof ne)[1];
        if (ne[1] !== va) emit(path, ie, ia);
        return;
      }
      case 'undef':
        return;
      case 'regexp': {
        const ra = na as typeof ne;
        if (ne[1] !== ra[1] || ne[2] !== ra[2]) emit(path, ie, ia);
        return;
      }
      case 'err': {
        const ea = (na as typeof ne)[1];
        if (ne[1].name !== ea.name) emit(path + '.name', ie, ia);
        if (ne[1].message !== ea.message) emit(path + '.message', ie, ia);
        if ((ne[1].code ?? null) !== (ea.code ?? null)) emit(path + '.code', ie, ia);
        return;
      }
      case 'arr': {
        const aa = na as typeof ne;
        if (ne[1].length !== aa[1].length) {
          emit(path, ie, ia, `length ${ne[1].length} -> ${aa[1].length}`);
        }
        const len = Math.min(ne[1].length, aa[1].length);
        for (let i = 0; i < len; i++) cmp(ne[1][i]!, aa[1][i]!, `${path}.${i}`);
        return;
      }
      case 'set': {
        const sa = na as typeof ne;
        const keysE = ne[1].map((i) => canonKey(expected, i));
        const keysA = sa[1].map((i) => canonKey(actual, i));
        const countA = new Map<string, number>();
        for (const k of keysA) countA.set(k, (countA.get(k) ?? 0) + 1);
        for (const k of keysE) {
          const c = countA.get(k) ?? 0;
          if (c === 0) out.push({ path, expected: trim(k), actual: '(absent)', note: 'set member missing' });
          else countA.set(k, c - 1);
        }
        for (const [k, c] of countA) {
          if (c > 0) out.push({ path, expected: '(absent)', actual: trim(k), note: 'unexpected set member' });
        }
        return;
      }
      case 'map': {
        const ma = na as typeof ne;
        const byKeyE = new Map(ne[1].map(([k, v]) => [canonKey(expected, k), v] as const));
        const byKeyA = new Map(ma[1].map(([k, v]) => [canonKey(actual, k), v] as const));
        for (const [k, ve] of byKeyE) {
          const va = byKeyA.get(k);
          if (va === undefined) {
            out.push({ path: `${path}.${trim(k, 40)}`, expected: render(expected, ve), actual: '(absent)', note: 'map key missing' });
          } else {
            cmp(ve, va, `${path}.${trim(k, 40)}`);
          }
        }
        for (const [k, va] of byKeyA) {
          if (!byKeyE.has(k)) {
            out.push({ path: `${path}.${trim(k, 40)}`, expected: '(absent)', actual: render(actual, va), note: 'unexpected map key' });
          }
        }
        return;
      }
      case 'obj': {
        const oa = na as typeof ne;
        if ((ne[2] ?? null) !== (oa[2] ?? null)) {
          out.push({
            path: `${path}.@class`,
            expected: ne[2] ?? '(plain object)',
            actual: oa[2] ?? '(plain object)',
          });
        }
        const entriesE = new Map(ne[1]);
        const entriesA = new Map(oa[1]);
        for (const [key, ve] of entriesE) {
          const va = entriesA.get(key);
          if (va === undefined) {
            out.push({ path: `${path}.${key}`, expected: render(expected, ve), actual: '(absent)', note: 'property missing' });
          } else {
            cmp(ve, va, `${path}.${key}`);
          }
        }
        for (const [key, va] of entriesA) {
          if (!entriesE.has(key)) {
            out.push({ path: `${path}.${key}`, expected: '(absent)', actual: render(actual, va), note: 'unexpected property' });
          }
        }
        return;
      }
    }
  }

  function trim(s: string, maxLen = 120): string {
    return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
  }

  cmp(expected.r, actual.r, rootPath);
  return out;
}
