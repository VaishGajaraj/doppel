import type { RedactionRule } from '../contract/types.ts';

export interface CompiledRule {
  rule: RedactionRule;
  boundary: RegExp | null;
  segments: string[];
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

export function compileRules(rules: RedactionRule[]): CompiledRule[] {
  return rules.map((rule) => ({
    rule,
    boundary: rule.boundary ? globToRegExp(rule.boundary) : null,
    segments: rule.path.split('.'),
  }));
}

export function pathMatches(pattern: string[], path: string[]): boolean {
  let pi = 0;
  for (let i = 0; i < pattern.length; i++) {
    const seg = pattern[i]!;
    if (seg === '**') return true;
    if (pi >= path.length) return false;
    if (seg !== '*' && seg !== path[pi]) return false;
    pi++;
  }
  return pi === path.length;
}

export function findRule(
  compiled: CompiledRule[],
  boundary: string,
  path: string[],
): RedactionRule | null {
  for (const c of compiled) {
    if (c.boundary && !c.boundary.test(boundary)) continue;
    if (pathMatches(c.segments, path)) return c.rule;
  }
  return null;
}

export function applyNumericRule(rule: RedactionRule, value: number): number {
  if (rule.action === 'round') {
    const digits = rule.n ?? 0;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }
  if (rule.action === 'bucket') {
    const width = rule.n ?? 1;
    return Math.floor(value / width) * width;
  }
  return value;
}
