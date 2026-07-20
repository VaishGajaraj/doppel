import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readContract, verifyContract } from '../src/contract/io.ts';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

test('doppel/register auto-instruments a module and writes the contract on exit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'doppel-register-'));
  const out = join(dir, 'mathy.dopl.jsonl');
  const config = {
    library: 'mathy',
    out,
    record: { include: [{ specifier: 'mathy.mjs', label: 'mathy' }] },
  };

  const res = spawnSync(
    'node',
    [
      '--import',
      pathToFileURL(here('../src/record/register.ts')).href,
      here('./fixtures/register-driver.mjs'),
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, DOPPEL_CONFIG_JSON: JSON.stringify(config) },
    },
  );
  assert.equal(res.status, 0, `driver failed:\n${res.stderr}`);
  assert.match(res.stderr, /recorded 2 interactions/);

  const contract = readContract(out);
  assert.equal(verifyContract(contract), null);
  assert.deepEqual(
    contract.interactions.map((i) => i.boundary).sort(),
    ['mathy#add', 'mathy#mul'],
  );
  assert.equal(contract.header.library, 'mathy');
});

test('doppel record CLI reproduces the committed contract body hash exactly', () => {
  const dir = mkdtempSync(join(tmpdir(), 'doppel-record-'));
  const out = join(dir, 'statlib.dopl.jsonl');
  const configPath = join(dir, 'doppel.config.json');
  writeFileSync(
    configPath,
    JSON.stringify({
      library: 'statlib',
      out,
      record: { include: [{ specifier: 'reference/statlib.js', label: 'statlib' }] },
      redactions: [],
    }),
  );

  const res = spawnSync(
    'node',
    [
      here('../bin/doppel.js'),
      'record',
      '--config',
      configPath,
      '--',
      'node',
      here('../examples/statlib/workload.js'),
    ],
    { encoding: 'utf8' },
  );
  assert.equal(res.status, 0, `record failed:\n${res.stderr}`);

  const recorded = readContract(out);
  assert.equal(verifyContract(recorded), null);
  const committed = readContract(here('../examples/statlib/contracts/statlib.dopl.jsonl'));
  assert.equal(recorded.header.body_hash, committed.header.body_hash);
  assert.equal(recorded.header.interaction_count, committed.header.interaction_count);
});
