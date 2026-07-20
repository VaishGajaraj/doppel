import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkContract } from '../src/diff/differ.ts';
import { clusterDivergences } from '../src/diff/issues.ts';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const contractPath = here('../examples/statlib/contracts/statlib.dopl.jsonl');
const adapterCommand = `node ${here('../examples/statlib/port/adapter.js')}`;

function record(): void {
  const res = spawnSync('node', [here('../examples/statlib/record.js')], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
}

test('e2e: the contract catches both injected regressions in the port', async () => {
  record();
  const result = await checkContract({
    contractPath,
    adapterCommand,
    benign: ['error.message'],
  });

  assert.equal(result.summary.interactions, 24);
  assert.equal(result.summary.failed, 0);
  assert.equal(result.summary.benign, 2);
  assert.equal(result.summary.breaking, 10);
  assert.equal(
    result.summary.identical + result.summary.benign + result.summary.breaking,
    result.summary.interactions,
  );

  const breakingBoundaries = new Set(
    result.divergences.filter((d) => d.verdict === 'breaking').map((d) => d.boundary),
  );
  assert.deepEqual(
    [...breakingBoundaries].sort(),
    ['statlib#normalize', 'statlib#percentile', 'statlib#stddev', 'statlib#summarize'],
  );

  const clusters = clusterDivergences(result);
  assert.equal(clusters.length, 4);
});

test('e2e: without the benign rule the reworded error is breaking', async () => {
  const result = await checkContract({ contractPath, adapterCommand });
  assert.equal(result.summary.benign, 0);
  assert.equal(result.summary.breaking, 12);
});

test('e2e: the reference verifies clean against itself', async () => {
  const referenceAdapter = `node ${here('./fixtures/reference-adapter.js')}`;
  const result = await checkContract({ contractPath, adapterCommand: referenceAdapter });
  assert.equal(result.summary.breaking, 0);
  assert.equal(result.summary.benign, 0);
  assert.equal(result.summary.failed, 0);
  assert.equal(result.summary.identical, 24);
});
