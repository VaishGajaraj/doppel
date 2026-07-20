import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

test('mutation sweep: 10/10 core mutants caught, blind-spot mutant missed', () => {
  const res = spawnSync('node', [here('../examples/statlib/mutation-run.js')], {
    encoding: 'utf8',
    timeout: 120_000,
  });
  assert.equal(res.status, 0, `mutation sweep failed:\n${res.stdout}\n${res.stderr}`);
  assert.match(res.stdout, /core mutants caught: 10\/10/);
  assert.match(res.stdout, /blind-spot mutant missed as designed/);
});
