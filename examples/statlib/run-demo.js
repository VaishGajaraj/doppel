import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * End-to-end demo: record the reference boundary, then verify the injected-
 * regression port against it. Exits 0 when doppel catches the regressions
 * (that is the expected outcome), 1 otherwise.
 */

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

console.log('▸ 1/2 recording the reference boundary\n');
const rec = spawnSync('node', [here('./record.js')], { stdio: 'inherit' });
if (rec.status !== 0) process.exit(1);

console.log('\n▸ 2/2 checking the port against the recorded contract\n');
const check = spawnSync(
  'node',
  [
    here('../../bin/doppel.js'),
    'check',
    '--contract',
    here('./contracts/statlib.dopl.jsonl'),
    '--adapter',
    `node ${here('./port/adapter.js')}`,
    '--benign',
    'error.message',
    '--report-dir',
    here('./.doppel'),
  ],
  { stdio: 'inherit' },
);

if (check.status === 1) {
  console.log('✓ demo passed: doppel flagged the injected regressions as breaking');
  process.exit(0);
}
console.error(`✗ demo failed: expected breaking divergences, doppel check exited ${check.status}`);
process.exit(1);
