import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { encodeCanonical, halfBitsToNumber, numberToHalfBits } from '../src/contract/cbor.ts';
import type { JsonValue } from '../src/contract/types.ts';

function hex(value: JsonValue): string {
  return Buffer.from(encodeCanonical(value)).toString('hex');
}

test('RFC 8949 integer vectors, shortest form', () => {
  assert.equal(hex(0), '00');
  assert.equal(hex(23), '17');
  assert.equal(hex(24), '1818');
  assert.equal(hex(500), '1901f4');
  assert.equal(hex(1000000), '1a000f4240');
  assert.equal(hex(9007199254740991), '1b001fffffffffffff');
  assert.equal(hex(-1), '20');
  assert.equal(hex(-500), '3901f3');
  assert.equal(hex(-9007199254740991), '3b001ffffffffffffe');
});

test('RFC 8949 float vectors, shortest form (f16/f32/f64)', () => {
  assert.equal(hex(1.5), 'f93e00');
  assert.equal(hex(0.00006103515625), 'f90400');
  assert.equal(hex(5.960464477539063e-8), 'f90001');
  assert.equal(hex(3.4028234663852886e38), 'fa7f7fffff');
  assert.equal(hex(1.1), 'fb3ff199999999999a');
  assert.equal(hex(-4.1), 'fbc010666666666666');
  assert.equal(hex(Infinity), 'f97c00');
  assert.equal(hex(-Infinity), 'f9fc00');
  assert.equal(hex(NaN), 'f97e00');
});

test('dCBOR numeric reduction: integral floats and -0 encode as integers', () => {
  assert.equal(hex(100000.0), '1a000186a0');
  assert.equal(hex(-0), '00');
  assert.equal(hex(2 ** 53), 'fa5a000000');
});

test('strings, arrays, simple values', () => {
  assert.equal(hex(''), '60');
  assert.equal(hex('a'), '6161');
  assert.equal(hex('ü'), '62c3bc');
  assert.equal(hex([1, 2, 3]), '83010203');
  assert.equal(hex(true), 'f5');
  assert.equal(hex(false), 'f4');
  assert.equal(hex(null), 'f6');
});

test('map keys sort bytewise by encoded form (length-first)', () => {
  assert.equal(hex({}), 'a0');
  assert.equal(hex({ aa: 1, b: 2 }), 'a261620262616101');
});

test('equal values encode to equal bytes regardless of insertion order', () => {
  const a = hex({ x: [1, { b: 2, a: 3 }], y: 'z' });
  const b = hex({ y: 'z', x: [1, { a: 3, b: 2 }] });
  assert.equal(a, b);
});

test('half-precision round-trip is exact for every encodable value', () => {
  for (const v of [0, -0, 0.5, 1, 1.5, -2, 65504, -65504, 2 ** -24, 2 ** -14, 6.109476089477539e-5]) {
    const bits = numberToHalfBits(v);
    assert.notEqual(bits, null, `expected ${v} to be half-encodable`);
    assert.ok(Object.is(halfBitsToNumber(bits!), v), `round-trip failed for ${v}`);
  }
  for (const v of [1.1, 65505, 2 ** -25, 3.4028234663852886e38]) {
    assert.equal(numberToHalfBits(v), null, `expected ${v} to NOT be half-encodable`);
  }
});
