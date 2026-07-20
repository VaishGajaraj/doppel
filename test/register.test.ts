import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
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
