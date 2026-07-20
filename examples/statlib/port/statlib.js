/**
 * The "port" of reference/statlib.js — imagine an agent translated it to
 * another language. Two regressions are injected on purpose, the kind a
 * target-language test suite written from the code (not the behavior) tends
 * to bless:
 *
 *   1. percentile() uses nearest-rank instead of linear interpolation —
 *      correct at p=0 and p=100, wrong in between.
 *   2. stddev() uses the population formula (divide by n) instead of the
 *      sample formula (divide by n-1).
 *
 * There is also one harmless drift: the percentile range error is reworded.
 * `doppel check --benign error.message` classifies that one benign.
 */

function assertNonEmpty(values) {
  if (values.length === 0) throw new RangeError('statlib: input must not be empty');
}

function sorted(values) {
  return [...values].sort((a, b) => a - b);
}

export function mean(values) {
  assertNonEmpty(values);
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export function median(values) {
  assertNonEmpty(values);
  const s = sorted(values);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function percentile(values, p) {
  assertNonEmpty(values);
  if (!(p >= 0 && p <= 100)) {
    throw new RangeError('statlib: p out of range [0, 100]');
  }
  const s = sorted(values);
  const idx = Math.max(0, Math.ceil((p / 100) * s.length) - 1);
  return s[idx];
}

export function stddev(values) {
  if (values.length < 2) throw new RangeError('statlib: stddev needs at least two values');
  const m = mean(values);
  let sq = 0;
  for (const v of values) sq += (v - m) * (v - m);
  return Math.sqrt(sq / values.length);
}

export function summarize(values) {
  assertNonEmpty(values);
  const s = sorted(values);
  return {
    count: values.length,
    min: s[0],
    max: s[s.length - 1],
    mean: mean(values),
    median: median(values),
    p95: percentile(values, 95),
    stddev: values.length >= 2 ? stddev(values) : null,
  };
}

export async function normalize(values) {
  const m = mean(values);
  const sd = stddev(values);
  await Promise.resolve();
  return values.map((v) => (v - m) / sd);
}
