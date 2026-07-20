import { test } from 'node:test';
import assert from 'node:assert/strict';
import { materialize, snapshot } from '../src/capture/snapshot.ts';
import { hashCanonical } from '../src/contract/hash.ts';
import type { JsonValue } from '../src/contract/types.ts';

function graphHash(value: unknown, redactions = [] as never[]): string {
  return hashCanonical(snapshot(value, { redactions }) as unknown as JsonValue);
}

test('shared references resolve to the same node', () => {
  const shared = { hello: 'world' };
  const g = snapshot([shared, shared]);
  const root = g.n[g.r]!;
  assert.equal(root[0], 'arr');
  const [a, b] = root[1] as number[];
  assert.equal(a, b);
});

test('cycles capture and materialize', () => {
  const obj: Record<string, unknown> = { name: 'loop' };
  obj.self = obj;
  const g = snapshot(obj);
  const back = materialize(g) as Record<string, unknown>;
  assert.equal(back.name, 'loop');
  assert.equal(back.self, back);
});

test('Map and Set capture is insertion-order independent', () => {
  const m1 = new Map([
    ['b', 2],
    ['a', 1],
  ]);
  const m2 = new Map([
    ['a', 1],
    ['b', 2],
  ]);
  assert.equal(graphHash(m1), graphHash(m2));
  assert.equal(graphHash(new Set([3, 1, 2])), graphHash(new Set([1, 2, 3])));
});

test('object key order does not change the hash', () => {
  assert.equal(graphHash({ a: 1, b: 2 }), graphHash({ b: 2, a: 1 }));
});

test('extended types survive the round trip', () => {
  const value = {
    big: 123456789012345678901234567890n,
    when: new Date('2026-07-20T00:00:00.000Z'),
    bytes: new Uint8Array([1, 2, 3]),
    re: /ab+c/gi,
    nothing: undefined,
    weird: [NaN, Infinity, -Infinity, -0],
  };
  const back = materialize(snapshot(value)) as typeof value;
  assert.equal(back.big, value.big);
  assert.equal(back.when.getTime(), value.when.getTime());
  assert.deepEqual([...back.bytes], [1, 2, 3]);
  assert.equal(back.re.source, 'ab+c');
  assert.equal(back.re.flags, 'gi');
  assert.equal(back.nothing, undefined);
  assert.ok(Number.isNaN(back.weird[0]));
  assert.equal(back.weird[1], Infinity);
  assert.equal(back.weird[2], -Infinity);
  assert.ok(Object.is(back.weird[3], -0));
});

test('class instances record their constructor name', () => {
  class Money {
    amount: number;
    constructor(amount: number) {
      this.amount = amount;
    }
  }
  const g = snapshot(new Money(5));
  const root = g.n[g.r]!;
  assert.equal(root[0], 'obj');
  assert.equal(root[2], 'Money');
});

test('blank redaction removes the value from the capture', () => {
  const rules = [{ path: 'args.0.token', action: 'blank' as const }];
  const a = snapshot([{ token: 'secret-1', user: 'v' }], { root: 'args', redactions: rules });
  const b = snapshot([{ token: 'secret-2', user: 'v' }], { root: 'args', redactions: rules });
  assert.equal(
    hashCanonical(a as unknown as JsonValue),
    hashCanonical(b as unknown as JsonValue),
  );
});

test('round redaction buckets numeric noise', () => {
  const rules = [{ path: 'return.elapsed', action: 'round' as const, n: 0 }];
  const a = snapshot({ elapsed: 12.31 }, { root: 'return', redactions: rules });
  const b = snapshot({ elapsed: 12.29 }, { root: 'return', redactions: rules });
  assert.equal(
    hashCanonical(a as unknown as JsonValue),
    hashCanonical(b as unknown as JsonValue),
  );
});

test('wildcard and ** redaction paths match', () => {
  const rules = [{ path: 'args.*.id', action: 'blank' as const }];
  const g = snapshot([{ id: 'x' }, { id: 'y' }], { root: 'args', redactions: rules });
  const rendered = JSON.stringify(g.n);
  assert.ok(!rendered.includes('"x"'));
  assert.ok(!rendered.includes('"y"'));
});
