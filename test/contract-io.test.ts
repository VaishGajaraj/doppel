import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildHeader, readContract, verifyContract, writeContract } from '../src/contract/io.ts';
import { snapshot, snapshotArgs } from '../src/capture/snapshot.ts';
import type { Interaction } from '../src/contract/types.ts';

function sampleInteractions(): Interaction[] {
  return [
    {
      seq: 0,
      boundary: 'lib#add',
      args: snapshotArgs([2, 3]),
      outcome: { kind: 'return', value: snapshot(5, { root: 'return' }) },
      timing: 'sync',
    },
    {
      seq: 1,
      boundary: 'lib#fail',
      args: snapshotArgs([]),
      outcome: { kind: 'throw', error: { name: 'RangeError', message: 'nope' } },
      timing: 'sync',
    },
  ];
}

test('write -> read -> verify round trip', () => {
  const dir = mkdtempSync(join(tmpdir(), 'doppel-'));
  const path = join(dir, 'lib.dopl.jsonl');
  const interactions = sampleInteractions();
  const header = buildHeader({ library: 'lib', interactions });
  writeContract(path, { header, interactions });

  const contract = readContract(path);
  assert.equal(contract.header.library, 'lib');
  assert.equal(contract.header.interaction_count, 2);
  assert.equal(verifyContract(contract), null);
});

test('contract files are canonical text — same behavior, same bytes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'doppel-'));
  const a = join(dir, 'a.jsonl');
  const b = join(dir, 'b.jsonl');
  const interactions = sampleInteractions();
  writeContract(a, { header: buildHeader({ library: 'lib', interactions }), interactions });
  writeContract(b, { header: buildHeader({ library: 'lib', interactions }), interactions });
  assert.equal(readFileSync(a, 'utf8'), readFileSync(b, 'utf8'));
});

test('tampering with an interaction fails integrity verification', () => {
  const dir = mkdtempSync(join(tmpdir(), 'doppel-'));
  const path = join(dir, 'lib.dopl.jsonl');
  const interactions = sampleInteractions();
  writeContract(path, { header: buildHeader({ library: 'lib', interactions }), interactions });

  const lines = readFileSync(path, 'utf8').trimEnd().split('\n');
  lines[1] = lines[1]!.replace('"lib#add"', '"lib#sub"');
  writeFileSync(path, lines.join('\n') + '\n');

  const problem = verifyContract(readContract(path));
  assert.match(problem ?? '', /body hash mismatch/);
});

test('truncating the file fails the count check', () => {
  const dir = mkdtempSync(join(tmpdir(), 'doppel-'));
  const path = join(dir, 'lib.dopl.jsonl');
  const interactions = sampleInteractions();
  writeContract(path, { header: buildHeader({ library: 'lib', interactions }), interactions });

  const lines = readFileSync(path, 'utf8').trimEnd().split('\n');
  writeFileSync(path, lines.slice(0, 2).join('\n') + '\n');

  const problem = verifyContract(readContract(path));
  assert.match(problem ?? '', /interaction count mismatch/);
});
