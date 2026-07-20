import { fileURLToPath } from 'node:url';
import { checkContract } from '../../src/index.ts';
import { mutants } from './port/mutants.js';

/**
 * The miniature of milestone M4's exit criterion: inject single-fault mutants
 * into a port and measure how many the contract catches. Exits non-zero if
 * any core mutant slips through, or if the deliberate blind-spot mutant is
 * NOT missed (its miss is what proves the oracle's width equals the corpus).
 */

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const contractPath = here('./contracts/statlib.dopl.jsonl');
const adapterCommand = `node ${here('./port/mutant-adapter.js')}`;

const results = [];
for (const [name, mutant] of Object.entries(mutants)) {
  const result = await checkContract({
    contractPath,
    adapterCommand,
    benign: ['error.message'],
    env: { DOPPEL_MUTANT: name },
  });
  const caught = result.summary.breaking > 0;
  results.push({ name, expect: mutant.expect, caught, breaking: result.summary.breaking });
}

const width = Math.max(...results.map((r) => r.name.length)) + 2;
console.log('\nmutation sweep — 24-interaction statlib contract\n');
for (const r of results) {
  const verdict = r.caught ? 'caught' : 'missed';
  const ok = (r.expect === 'caught') === r.caught;
  console.log(
    `  ${ok ? '✓' : '✗'} ${r.name.padEnd(width)} ${verdict.padEnd(8)} ${
      r.caught ? `${r.breaking} breaking divergence(s)` : ''
    }${r.expect === 'missed' ? ' (expected miss: fault is outside the recorded corpus)' : ''}`,
  );
}

const core = results.filter((r) => r.expect === 'caught');
const caughtCount = core.filter((r) => r.caught).length;
const blind = results.find((r) => r.expect === 'missed');
console.log(`\n  core mutants caught: ${caughtCount}/${core.length}`);
console.log(
  `  blind-spot mutant ${blind.caught ? 'CAUGHT (unexpected!)' : 'missed as designed'} — the oracle is exactly as wide as the corpus\n`,
);

const pass = caughtCount === core.length && !blind.caught;
process.exit(pass ? 0 : 1);
