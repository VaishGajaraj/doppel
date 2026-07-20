import { fileURLToPath } from 'node:url';
import { RecordSession, instrument, writeContract } from '../../src/index.ts';
import * as reference from './reference/statlib.ts';

/**
 * Deterministic recording corpus. Everything here is fixed — datasets come
 * from constants and a seeded LCG — so re-recording always produces the same
 * contract body hash.
 */

function lcgSeries(seed, count) {
  let x = seed >>> 0;
  const out = [];
  for (let i = 0; i < count; i++) {
    x = (Math.imul(1664525, x) + 1013904223) >>> 0;
    out.push(x / 2 ** 32);
  }
  return out;
}

const d1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const d2 = [3];
const d3 = [];
const d4 = [0.1, 0.2, 0.30000000000000004, 1.5, -2.25];
const d5 = [-10, -4, 0, 4, 10, 22];
const d6 = lcgSeries(42, 100);

const session = new RecordSession({ library: 'statlib' });
session.start();
const lib = instrument(reference, { module: 'statlib' });

const attempt = (fn) => {
  try {
    fn();
  } catch {
    // Recorded as a throw outcome — that's the point.
  }
};

for (const data of [d1, d2, d4, d6]) attempt(() => lib.mean(data));
attempt(() => lib.mean(d3));
for (const data of [d1, d5, d6]) attempt(() => lib.median(data));
for (const p of [0, 25, 50, 90, 95, 100]) attempt(() => lib.percentile(d1, p));
attempt(() => lib.percentile(d1, 120));
attempt(() => lib.percentile(d1, -5));
for (const data of [d1, d4, d6]) attempt(() => lib.stddev(data));
attempt(() => lib.stddev(d2));
for (const data of [d1, d6]) attempt(() => lib.summarize(data));
await lib.normalize(d1).catch(() => {});
await lib.normalize(d2).catch(() => {});

session.stop();
const contract = session.finalize();
const out = fileURLToPath(new URL('./contracts/statlib.dopl.jsonl', import.meta.url));
writeContract(out, contract);
console.log(
  `recorded ${contract.header.interaction_count} interactions -> ${out}\n` +
    `body hash ${contract.header.body_hash}`,
);
