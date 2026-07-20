import type { JsonValue } from './types.ts';

/**
 * RFC 8785 (JCS) canonical JSON serialization: sorted keys (UTF-16 code unit
 * order), ECMAScript number formatting, no insignificant whitespace.
 * Properties with `undefined` values are skipped, matching JSON.stringify.
 */
export function canonicalize(value: JsonValue): string {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('non-finite number is not representable in canonical JSON');
    }
    if (Object.is(value, -0)) return '0';
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canonicalize(v === undefined ? null : v)).join(',') + ']';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort();
    const parts = keys.map(
      (k) => JSON.stringify(k) + ':' + canonicalize((value as Record<string, JsonValue>)[k]!),
    );
    return '{' + parts.join(',') + '}';
  }
  throw new TypeError(`cannot canonicalize value of type ${typeof value}`);
}
