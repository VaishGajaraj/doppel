import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalize } from '../src/contract/jcs.ts';

test('sorts object keys by UTF-16 code units', () => {
  assert.equal(canonicalize({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(canonicalize({ aa: 1, b: 2 }), '{"aa":1,"b":2}');
});

test('uses ECMAScript number serialization', () => {
  assert.equal(canonicalize(1e21), '1e+21');
  assert.equal(canonicalize(0.000001), '0.000001');
  assert.equal(canonicalize(1e-7), '1e-7');
  assert.equal(canonicalize(-0), '0');
  assert.equal(canonicalize(10.0), '10');
});

test('rejects non-finite numbers', () => {
  assert.throws(() => canonicalize(NaN));
  assert.throws(() => canonicalize(Infinity));
});

test('skips undefined-valued properties like JSON.stringify', () => {
  assert.equal(
    canonicalize({ a: 1, b: undefined as unknown as null }),
    '{"a":1}',
  );
});

test('nested structures and string escaping', () => {
  assert.equal(
    canonicalize({ z: [1, 'two', null, true], a: { '\n': 'newline key' } }),
    '{"a":{"\\n":"newline key"},"z":[1,"two",null,true]}',
  );
});

test('output is stable regardless of insertion order', () => {
  const a = canonicalize({ x: 1, y: { b: 2, a: 3 } });
  const b = canonicalize({ y: { a: 3, b: 2 }, x: 1 });
  assert.equal(a, b);
});
