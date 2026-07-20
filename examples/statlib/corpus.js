/**
 * The deterministic recording corpus, shared by both recording modes
 * (API-driven record.js and register-driven workload.js). Everything is
 * fixed — constants and a seeded LCG — so any recording of this corpus
 * produces the same contract body hash.
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

export const datasets = {
  d1: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  d2: [3],
  d3: [],
  d4: [0.1, 0.2, 0.30000000000000004, 1.5, -2.25],
  d5: [-10, -4, 0, 4, 10, 22],
  d6: lcgSeries(42, 100),
};

export async function runCorpus(lib) {
  const { d1, d2, d3, d4, d5, d6 } = datasets;
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
}
