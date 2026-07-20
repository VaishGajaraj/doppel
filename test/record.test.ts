import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RecordSession } from '../src/record/session.ts';
import { instrument, wrapFunction } from '../src/record/wrap.ts';

test('records sync calls, returns, and throws', () => {
  const session = new RecordSession({ library: 't' });
  session.start();
  const add = wrapFunction((a: number, b: number) => a + b, 't#add');
  const boom = wrapFunction(() => {
    throw new RangeError('bad input');
  }, 't#boom');

  assert.equal(add(2, 3), 5);
  assert.throws(() => boom());

  const contract = session.finalize();
  assert.equal(contract.interactions.length, 2);
  const [first, second] = contract.interactions;
  assert.equal(first!.boundary, 't#add');
  assert.equal(first!.timing, 'sync');
  assert.equal(first!.outcome.kind, 'return');
  assert.equal(second!.outcome.kind, 'throw');
  if (second!.outcome.kind === 'throw') {
    assert.equal(second!.outcome.error.name, 'RangeError');
    assert.equal(second!.outcome.error.message, 'bad input');
  }
});

test('async calls settle with a settle_seq and async timing', async () => {
  const session = new RecordSession({ library: 't' });
  session.start();
  const slow = wrapFunction(async (x: number) => {
    await Promise.resolve();
    return x * 2;
  }, 't#slow');

  assert.equal(await slow(21), 42);

  const contract = session.finalize();
  const [call] = contract.interactions;
  assert.equal(call!.timing, 'async');
  assert.equal(typeof call!.settle_seq, 'number');
  assert.ok(call!.settle_seq! > call!.seq);
});

test('async rejections are recorded and re-thrown', async () => {
  const session = new RecordSession({ library: 't' });
  session.start();
  const fail = wrapFunction(async () => {
    throw new Error('async nope');
  }, 't#fail');

  await assert.rejects(fail());

  const contract = session.finalize();
  assert.equal(contract.interactions[0]!.outcome.kind, 'throw');
});

test('causality: nested boundary calls record their parent seq', () => {
  const session = new RecordSession({ library: 't' });
  session.start();
  const inner = wrapFunction((x: number) => x * 2, 't#inner');
  const outer = wrapFunction((x: number) => inner(x) + 1, 't#outer');

  assert.equal(outer(5), 11);

  const contract = session.finalize();
  const outerCall = contract.interactions.find((i) => i.boundary === 't#outer')!;
  const innerCall = contract.interactions.find((i) => i.boundary === 't#inner')!;
  assert.equal(outerCall.parent, undefined);
  assert.equal(innerCall.parent, outerCall.seq);
});

test('arguments are captured at call time, before mutation', () => {
  const session = new RecordSession({ library: 't' });
  session.start();
  const mutate = wrapFunction((arr: number[]) => {
    arr.push(999);
    return arr.length;
  }, 't#mutate');

  mutate([1, 2]);

  const contract = session.finalize();
  const args = JSON.stringify(contract.interactions[0]!.args.n);
  assert.ok(!args.includes('999'));
});

test('without a session, wrapped functions pass through untouched', () => {
  const double = wrapFunction((x: number) => x * 2, 't#double');
  assert.equal(double(4), 8);
});

test('instrument wraps function exports and leaves the rest', () => {
  const session = new RecordSession({ library: 't' });
  session.start();
  const mod = instrument(
    { greet: (name: string) => `hi ${name}`, VERSION: '1.0' },
    { module: 'm' },
  );
  assert.equal(mod.greet('v'), 'hi v');
  assert.equal(mod.VERSION, '1.0');

  const contract = session.finalize();
  assert.equal(contract.interactions.length, 1);
  assert.equal(contract.interactions[0]!.boundary, 'm#greet');
});

test('recording is deterministic: same workload, same body hash', () => {
  const run = () => {
    const session = new RecordSession({ library: 't' });
    session.start();
    const fn = wrapFunction((x: { b: number; a: number }) => new Set([x.a, x.b]), 't#fn');
    fn({ b: 2, a: 1 });
    fn({ a: 1, b: 2 });
    return session.finalize().header.body_hash;
  };
  assert.equal(run(), run());
});
