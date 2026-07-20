import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot } from '../src/capture/snapshot.ts';
import { diffGraphs } from '../src/diff/graphdiff.ts';
import { classify, compareOutcomes } from '../src/diff/differ.ts';

function diffValues(expected: unknown, actual: unknown) {
  return diffGraphs(
    snapshot(expected, { root: 'return' }),
    snapshot(actual, { root: 'return' }),
    'return',
  );
}

test('identical values produce no diffs', () => {
  assert.deepEqual(diffValues({ a: [1, 2, { b: 'x' }] }, { a: [1, 2, { b: 'x' }] }), []);
});

test('nested change reports the exact path', () => {
  const diffs = diffValues({ stats: { p95: 9.5, mean: 3 } }, { stats: { p95: 10, mean: 3 } });
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0]!.path, 'return.stats.p95');
  assert.equal(diffs[0]!.expected, '9.5');
  assert.equal(diffs[0]!.actual, '10');
});

test('array length change is reported', () => {
  const diffs = diffValues([1, 2, 3], [1, 2]);
  assert.ok(diffs.some((d) => d.note?.includes('length')));
});

test('missing and unexpected properties are reported', () => {
  const diffs = diffValues({ a: 1, b: 2 }, { a: 1, c: 3 });
  const notes = diffs.map((d) => d.note);
  assert.ok(notes.includes('property missing'));
  assert.ok(notes.includes('unexpected property'));
});

test('map differences align by key, not position', () => {
  const expected = new Map([
    ['a', 1],
    ['b', 2],
  ]);
  const actual = new Map([
    ['b', 2],
    ['c', 3],
  ]);
  const diffs = diffValues(expected, actual);
  assert.ok(diffs.some((d) => d.note === 'map key missing'));
  assert.ok(diffs.some((d) => d.note === 'unexpected map key'));
  assert.ok(!diffs.some((d) => d.path.includes('"b"') && !d.note));
});

test('set comparison is membership-based', () => {
  assert.deepEqual(diffValues(new Set([1, 2]), new Set([2, 1])), []);
  const diffs = diffValues(new Set([1, 2]), new Set([1, 3]));
  assert.equal(diffs.length, 2);
});

test('cyclic structures diff without hanging', () => {
  const a: Record<string, unknown> = { v: 1 };
  a.self = a;
  const b: Record<string, unknown> = { v: 2 };
  b.self = b;
  const diffs = diffValues(a, b);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0]!.path, 'return.v');
});

test('kind changes are called out', () => {
  const diffs = diffValues('5', 5);
  assert.match(diffs[0]!.note ?? '', /kind changed/);
});

test('outcome kind mismatch and error field diffs', () => {
  const throwOutcome = {
    kind: 'throw' as const,
    error: { name: 'RangeError', message: 'p must be within [0, 100]' },
  };
  const returnOutcome = {
    kind: 'return' as const,
    value: snapshot(1, { root: 'return' }),
  };
  assert.equal(compareOutcomes(throwOutcome, returnOutcome)[0]!.path, 'outcome');

  const reworded = {
    kind: 'throw' as const,
    error: { name: 'RangeError', message: 'p out of range' },
  };
  const diffs = compareOutcomes(throwOutcome, reworded);
  assert.deepEqual(
    diffs.map((d) => d.path),
    ['error.message'],
  );
});

test('classification: benign only when every diff path is declared benign', () => {
  const messageOnly = [{ path: 'error.message', expected: 'a', actual: 'b' }];
  assert.equal(classify(messageOnly, ['error.message']), 'benign');
  assert.equal(classify(messageOnly, []), 'breaking');
  const mixed = [
    { path: 'error.message', expected: 'a', actual: 'b' },
    { path: 'error.name', expected: 'A', actual: 'B' },
  ];
  assert.equal(classify(mixed, ['error.message']), 'breaking');
  assert.equal(classify([], ['error.message']), 'identical');
  assert.equal(classify(messageOnly, ['error.*']), 'benign');
});
