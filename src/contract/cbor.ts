import type { JsonValue } from './types.ts';

/**
 * Deterministic CBOR encoder per RFC 8949 §4.2.1 (core deterministic
 * encoding): shortest-form integer heads, shortest-form floats (f16/f32/f64),
 * map keys sorted bytewise by their encoded form. Negative zero encodes as
 * integer 0 and integral floats encode as integers, following the dCBOR
 * numeric reduction so that equal values hash equally across languages.
 */

const textEncoder = new TextEncoder();

function encodeHead(major: number, arg: number | bigint): Uint8Array {
  const m = major << 5;
  const n = typeof arg === 'bigint' ? arg : BigInt(arg);
  if (n < 24n) return Uint8Array.of(m | Number(n));
  if (n < 256n) return Uint8Array.of(m | 24, Number(n));
  if (n < 65536n) return Uint8Array.of(m | 25, Number(n >> 8n), Number(n & 0xffn));
  if (n < 4294967296n) {
    const b = new Uint8Array(5);
    b[0] = m | 26;
    new DataView(b.buffer).setUint32(1, Number(n));
    return b;
  }
  const b = new Uint8Array(9);
  b[0] = m | 27;
  new DataView(b.buffer).setBigUint64(1, n);
  return b;
}

const f32buf = new Float32Array(1);
const u32buf = new Uint32Array(f32buf.buffer);

export function halfBitsToNumber(h: number): number {
  const sign = h & 0x8000 ? -1 : 1;
  const exp = (h >> 10) & 0x1f;
  const frac = h & 0x3ff;
  if (exp === 0) return sign * frac * 2 ** -24;
  if (exp === 31) return frac ? NaN : sign * Infinity;
  return sign * (1024 + frac) * 2 ** (exp - 25);
}

export function numberToHalfBits(v: number): number | null {
  f32buf[0] = v;
  if (!Object.is(f32buf[0], v)) return null;
  const x = u32buf[0]!;
  const sign = (x >>> 16) & 0x8000;
  const exp = (x >>> 23) & 0xff;
  const frac = x & 0x7fffff;
  let h: number | null = null;
  if (exp === 0 && frac === 0) h = sign;
  else if (exp === 0xff) h = frac ? null : sign | 0x7c00;
  else {
    const e = exp - 127;
    if (e >= -14 && e <= 15) {
      if ((frac & 0x1fff) === 0) h = sign | ((e + 15) << 10) | (frac >> 13);
    } else if (e >= -24 && e < -14) {
      const totalFrac = 0x800000 | frac;
      const shift = 13 + (-14 - e);
      if ((totalFrac & ((1 << shift) - 1)) === 0) h = sign | (totalFrac >> shift);
    }
  }
  if (h === null) return null;
  return Object.is(halfBitsToNumber(h), v) ? h : null;
}

function encodeFloat(v: number): Uint8Array {
  if (Number.isNaN(v)) return Uint8Array.of(0xf9, 0x7e, 0x00);
  const half = numberToHalfBits(v);
  if (half !== null) return Uint8Array.of(0xf9, half >> 8, half & 0xff);
  if (Object.is(Math.fround(v), v)) {
    const b = new Uint8Array(5);
    b[0] = 0xfa;
    new DataView(b.buffer).setFloat32(1, v);
    return b;
  }
  const b = new Uint8Array(9);
  b[0] = 0xfb;
  new DataView(b.buffer).setFloat64(1, v);
  return b;
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i]! !== b[i]!) return a[i]! - b[i]!;
  }
  return a.length - b.length;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function encodeValue(value: JsonValue | Uint8Array): Uint8Array {
  if (value === null) return Uint8Array.of(0xf6);
  if (value === false) return Uint8Array.of(0xf4);
  if (value === true) return Uint8Array.of(0xf5);
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value)) {
      return value >= 0 ? encodeHead(0, value) : encodeHead(1, -value - 1);
    }
    return encodeFloat(value);
  }
  if (typeof value === 'string') {
    const bytes = textEncoder.encode(value);
    return concat([encodeHead(3, bytes.length), bytes]);
  }
  if (value instanceof Uint8Array) {
    return concat([encodeHead(2, value.length), value]);
  }
  if (Array.isArray(value)) {
    return concat([encodeHead(4, value.length), ...value.map((v) => encodeValue(v ?? null))]);
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [encodeValue(k), encodeValue(v)] as const)
      .sort((a, b) => compareBytes(a[0], b[0]));
    return concat([encodeHead(5, entries.length), ...entries.flatMap(([k, v]) => [k, v])]);
  }
  throw new TypeError(`cannot CBOR-encode value of type ${typeof value}`);
}

export function encodeCanonical(value: JsonValue): Uint8Array {
  return encodeValue(value);
}
