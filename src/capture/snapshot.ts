import { Buffer } from 'node:buffer';
import type { GraphNode, RedactionRule, ValueGraph } from '../contract/types.ts';
import { applyNumericRule, compileRules, findRule, type CompiledRule } from './redact.ts';

export interface SnapshotOptions {
  boundary?: string;
  /** Root path segment, e.g. "args" or "return", used for redaction matching. */
  root?: string;
  redactions?: RedactionRule[];
  maxNodes?: number;
}

/**
 * Deterministic sort key for Map keys and Set members, so that structures
 * with different insertion orders capture to identical graphs.
 */
function sortKey(v: unknown, seen: Set<object>): string {
  if (v === null) return 'null';
  const t = typeof v;
  if (t === 'string') return 's:' + v;
  if (t === 'number') return 'n:' + (Object.is(v, -0) ? '-0' : String(v));
  if (t === 'boolean' || t === 'bigint' || t === 'undefined' || t === 'symbol') {
    return t[0] + ':' + String(v);
  }
  if (t === 'function') return 'f:' + ((v as Function).name || 'anonymous');
  const obj = v as object;
  if (seen.has(obj)) return '~cycle';
  seen.add(obj);
  try {
    if (obj instanceof Date) return 'd:' + obj.getTime();
    if (obj instanceof RegExp) return 'r:' + obj.source + '/' + obj.flags;
    if (Array.isArray(obj)) return 'A[' + obj.map((x) => sortKey(x, seen)).join(',') + ']';
    if (obj instanceof Map) {
      const entries = [...obj.entries()].map(
        ([k, val]) => sortKey(k, seen) + '=>' + sortKey(val, seen),
      );
      return 'M{' + entries.sort().join(',') + '}';
    }
    if (obj instanceof Set) {
      return 'S{' + [...obj].map((x) => sortKey(x, seen)).sort().join(',') + '}';
    }
    const keys = Object.keys(obj).sort();
    return (
      'O{' +
      keys.map((k) => k + ':' + sortKey((obj as Record<string, unknown>)[k], seen)).join(',') +
      '}'
    );
  } finally {
    seen.delete(obj);
  }
}

function isTypedArrayLike(v: unknown): v is ArrayBufferView | ArrayBuffer {
  return ArrayBuffer.isView(v) || v instanceof ArrayBuffer;
}

function toBase64(v: ArrayBufferView | ArrayBuffer): string {
  const buf =
    v instanceof ArrayBuffer
      ? Buffer.from(v)
      : Buffer.from(v.buffer, v.byteOffset, v.byteLength);
  return buf.toString('base64');
}

class Snapshotter {
  nodes: GraphNode[] = [];
  ids = new Map<object, number>();
  rules: CompiledRule[];
  boundary: string;
  maxNodes: number;

  constructor(opts: SnapshotOptions) {
    this.rules = compileRules(opts.redactions ?? []);
    this.boundary = opts.boundary ?? '';
    this.maxNodes = opts.maxNodes ?? 50_000;
  }

  private alloc(node: GraphNode): number {
    this.nodes.push(node);
    return this.nodes.length - 1;
  }

  visit(v: unknown, path: string[]): number {
    if (this.nodes.length >= this.maxNodes) return this.alloc(['opaque', 'truncated']);

    const rule = this.rules.length ? findRule(this.rules, this.boundary, path) : null;
    if (rule) {
      if (rule.action === 'blank') return this.alloc(['redacted', 'blank']);
      if (typeof v === 'number' && Number.isFinite(v)) {
        v = applyNumericRule(rule, v);
      }
    }

    if (v === null) return this.alloc(['prim', null]);
    switch (typeof v) {
      case 'string':
      case 'boolean':
        return this.alloc(['prim', v]);
      case 'number':
        if (Number.isNaN(v)) return this.alloc(['num', 'NaN']);
        if (v === Infinity) return this.alloc(['num', 'Infinity']);
        if (v === -Infinity) return this.alloc(['num', '-Infinity']);
        if (Object.is(v, -0)) return this.alloc(['num', '-0']);
        return this.alloc(['prim', v]);
      case 'undefined':
        return this.alloc(['undef']);
      case 'bigint':
        return this.alloc(['bigint', v.toString()]);
      case 'symbol':
        return this.alloc(['symbol', v.description ?? '']);
      case 'function':
        return this.alloc(['fn', v.name || 'anonymous']);
    }

    const obj = v as object;
    const existing = this.ids.get(obj);
    if (existing !== undefined) return existing;

    if (obj instanceof Date) {
      const t = obj.getTime();
      const node: GraphNode = Number.isNaN(t)
        ? ['opaque', 'Date:invalid']
        : ['date', obj.toISOString()];
      const idx = this.alloc(node);
      this.ids.set(obj, idx);
      return idx;
    }
    if (obj instanceof RegExp) {
      const idx = this.alloc(['regexp', obj.source, obj.flags]);
      this.ids.set(obj, idx);
      return idx;
    }
    if (isTypedArrayLike(obj)) {
      const idx = this.alloc(['bytes', toBase64(obj)]);
      this.ids.set(obj, idx);
      return idx;
    }
    if (obj instanceof Error) {
      const code = (obj as { code?: unknown }).code;
      const idx = this.alloc([
        'err',
        {
          name: obj.name,
          message: obj.message,
          ...(code !== undefined ? { code: String(code) } : {}),
        },
      ]);
      this.ids.set(obj, idx);
      return idx;
    }

    if (Array.isArray(obj)) {
      const idx = this.alloc(['arr', []]);
      this.ids.set(obj, idx);
      const items = obj.map((item, i) => this.visit(item, [...path, String(i)]));
      this.nodes[idx] = ['arr', items];
      return idx;
    }

    if (obj instanceof Map) {
      const idx = this.alloc(['map', []]);
      this.ids.set(obj, idx);
      const sorted = [...obj.entries()].sort((a, b) => {
        const ka = sortKey(a[0], new Set());
        const kb = sortKey(b[0], new Set());
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });
      const entries = sorted.map(([k, val]) => {
        const keyIdx = this.visit(k, [...path, '«key»']);
        const valIdx = this.visit(val, [...path, sortKey(k, new Set())]);
        return [keyIdx, valIdx] as [number, number];
      });
      this.nodes[idx] = ['map', entries];
      return idx;
    }

    if (obj instanceof Set) {
      const idx = this.alloc(['set', []]);
      this.ids.set(obj, idx);
      const sorted = [...obj].sort((a, b) => {
        const ka = sortKey(a, new Set());
        const kb = sortKey(b, new Set());
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });
      const items = sorted.map((item, i) => this.visit(item, [...path, String(i)]));
      this.nodes[idx] = ['set', items];
      return idx;
    }

    const proto = Object.getPrototypeOf(obj);
    const ctorName =
      proto === null || proto === Object.prototype
        ? null
        : ((proto.constructor?.name as string | undefined) ?? null);
    const idx = this.alloc(ctorName ? ['obj', [], ctorName] : ['obj', []]);
    this.ids.set(obj, idx);
    const keys = Object.keys(obj).sort();
    const entries: Array<[string, number]> = [];
    for (const key of keys) {
      let child: number;
      try {
        child = this.visit((obj as Record<string, unknown>)[key], [...path, key]);
      } catch {
        child = this.alloc(['opaque', 'getter-threw']);
      }
      entries.push([key, child]);
    }
    this.nodes[idx] = ctorName ? ['obj', entries, ctorName] : ['obj', entries];
    return idx;
  }
}

/** Capture a live value as a canonical, language-neutral value graph. */
export function snapshot(value: unknown, opts: SnapshotOptions = {}): ValueGraph {
  const s = new Snapshotter(opts);
  const r = s.visit(value, opts.root ? [opts.root] : []);
  return { r, n: s.nodes };
}

/** Capture an argument list, redaction paths rooted at "args". */
export function snapshotArgs(args: unknown[], opts: SnapshotOptions = {}): ValueGraph {
  return snapshot(args, { ...opts, root: 'args' });
}

/**
 * Rebuild a plain JavaScript value from a graph (used by adapters to invoke
 * the port with recorded arguments). Shared references and cycles are
 * restored. Non-data nodes come back as tagged sentinels.
 */
export function materialize(graph: ValueGraph): unknown {
  const memo = new Map<number, unknown>();

  function build(idx: number): unknown {
    if (memo.has(idx)) return memo.get(idx);
    const node = graph.n[idx];
    if (!node) throw new Error(`dangling graph reference: ${idx}`);
    switch (node[0]) {
      case 'prim':
        return node[1];
      case 'num':
        return node[1] === 'NaN'
          ? NaN
          : node[1] === 'Infinity'
            ? Infinity
            : node[1] === '-Infinity'
              ? -Infinity
              : -0;
      case 'undef':
        return undefined;
      case 'bigint':
        return BigInt(node[1]);
      case 'date':
        return new Date(node[1]);
      case 'bytes':
        return new Uint8Array(Buffer.from(node[1], 'base64'));
      case 'regexp':
        return new RegExp(node[1], node[2]);
      case 'symbol':
        return Symbol(node[1]);
      case 'fn':
        return { $doppel: 'fn', name: node[1] };
      case 'err': {
        const err = new Error(node[1].message);
        err.name = node[1].name;
        if (node[1].code !== undefined) (err as { code?: string }).code = node[1].code;
        return err;
      }
      case 'redacted':
        return { $doppel: 'redacted', action: node[1] };
      case 'opaque':
        return { $doppel: 'opaque', tag: node[1] };
      case 'arr': {
        const arr: unknown[] = [];
        memo.set(idx, arr);
        for (const child of node[1]) arr.push(build(child));
        return arr;
      }
      case 'map': {
        const map = new Map<unknown, unknown>();
        memo.set(idx, map);
        for (const [k, val] of node[1]) map.set(build(k), build(val));
        return map;
      }
      case 'set': {
        const set = new Set<unknown>();
        memo.set(idx, set);
        for (const child of node[1]) set.add(build(child));
        return set;
      }
      case 'obj': {
        const obj: Record<string, unknown> = {};
        memo.set(idx, obj);
        for (const [key, child] of node[1]) obj[key] = build(child);
        return obj;
      }
    }
  }

  return build(graph.r);
}
