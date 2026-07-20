/**
 * The reference implementation: a small descriptive-statistics library that
 * stands in for "the codebase you are about to rewrite". The recorded corpus
 * in ../record.js drives this boundary; the port in ../port must match it.
 */

function assertNonEmpty(values: number[]): void {
  if (values.length === 0) throw new RangeError('statlib: input must not be empty');
}

function sorted(values: number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

export function mean(values: number[]): number {
  assertNonEmpty(values);
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export function median(values: number[]): number {
  assertNonEmpty(values);
  const s = sorted(values);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Linear interpolation between closest ranks (the R-7 / NumPy default). */
export function percentile(values: number[], p: number): number {
  assertNonEmpty(values);
  if (!(p >= 0 && p <= 100)) {
    throw new RangeError('statlib: percentile p must be within [0, 100]');
  }
  const s = sorted(values);
  const rank = (p / 100) * (s.length - 1);
  const lo = Math.floor(rank);
  const frac = rank - lo;
  if (frac === 0) return s[lo]!;
  return s[lo]! + frac * (s[lo + 1]! - s[lo]!);
}

/** Sample standard deviation (Bessel's correction). */
export function stddev(values: number[]): number {
  if (values.length < 2) throw new RangeError('statlib: stddev needs at least two values');
  const m = mean(values);
  let sq = 0;
  for (const v of values) sq += (v - m) * (v - m);
  return Math.sqrt(sq / (values.length - 1));
}

export interface Summary {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  stddev: number | null;
}

export function summarize(values: number[]): Summary {
  assertNonEmpty(values);
  const s = sorted(values);
  return {
    count: values.length,
    min: s[0]!,
    max: s[s.length - 1]!,
    mean: mean(values),
    median: median(values),
    p95: percentile(values, 95),
    stddev: values.length >= 2 ? stddev(values) : null,
  };
}

/** Z-score normalization. Async to exercise the async timing class. */
export async function normalize(values: number[]): Promise<number[]> {
  const m = mean(values);
  const sd = stddev(values);
  await Promise.resolve();
  return values.map((v) => (v - m) / sd);
}
