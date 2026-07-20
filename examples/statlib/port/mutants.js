/**
 * The mutation benchmark: eleven single-fault "ports" of the reference,
 * each a realistic porting error. Mutants 1–10 alter behavior the recorded
 * corpus exercises — the contract must catch every one. The final
 * "blind-spot" mutant only changes behavior on inputs the corpus never
 * recorded (arrays containing non-finite values), so the contract MUST miss
 * it: the oracle is exactly as wide as the corpus. Widening the corpus is
 * ADR-008's job, not the differ's.
 *
 * Overrides are self-contained reimplementations (mutating a shared helper
 * would leak the fault into boundaries it shouldn't touch).
 */

const sorted = (values) => [...values].sort((a, b) => a - b);

const assertNonEmpty = (values) => {
  if (values.length === 0) throw new RangeError('statlib: input must not be empty');
};

const refMean = (values) => {
  assertNonEmpty(values);
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
};

const refMedian = (values) => {
  assertNonEmpty(values);
  const s = sorted(values);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const refPercentile = (values, p) => {
  assertNonEmpty(values);
  if (!(p >= 0 && p <= 100)) {
    throw new RangeError('statlib: percentile p must be within [0, 100]');
  }
  const s = sorted(values);
  const rank = (p / 100) * (s.length - 1);
  const lo = Math.floor(rank);
  const frac = rank - lo;
  return frac === 0 ? s[lo] : s[lo] + frac * (s[lo + 1] - s[lo]);
};

const refStddev = (values) => {
  if (values.length < 2) throw new RangeError('statlib: stddev needs at least two values');
  const m = refMean(values);
  let sq = 0;
  for (const v of values) sq += (v - m) * (v - m);
  return Math.sqrt(sq / (values.length - 1));
};

export const mutants = {
  'mean-divides-by-n-plus-1': {
    expect: 'caught',
    overrides: {
      mean(values) {
        assertNonEmpty(values);
        let sum = 0;
        for (const v of values) sum += v;
        return sum / (values.length + 1);
      },
    },
  },
  'mean-double-counts-first': {
    expect: 'caught',
    overrides: {
      mean(values) {
        assertNonEmpty(values);
        let sum = values[0];
        for (const v of values) sum += v;
        return sum / values.length;
      },
    },
  },
  'median-even-skips-average': {
    expect: 'caught',
    overrides: {
      median(values) {
        assertNonEmpty(values);
        const s = sorted(values);
        return s[Math.floor(s.length / 2)];
      },
    },
  },
  'percentile-nearest-rank': {
    expect: 'caught',
    overrides: {
      percentile(values, p) {
        assertNonEmpty(values);
        if (!(p >= 0 && p <= 100)) {
          throw new RangeError('statlib: percentile p must be within [0, 100]');
        }
        const s = sorted(values);
        return s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)];
      },
    },
  },
  'percentile-rank-scale-off-by-one': {
    expect: 'caught',
    overrides: {
      percentile(values, p) {
        assertNonEmpty(values);
        if (!(p >= 0 && p <= 100)) {
          throw new RangeError('statlib: percentile p must be within [0, 100]');
        }
        const s = sorted(values);
        const rank = (p / 100) * s.length;
        const lo = Math.min(Math.floor(rank), s.length - 1);
        const frac = rank - Math.floor(rank);
        if (frac === 0 || lo >= s.length - 1) return s[lo];
        return s[lo] + frac * (s[lo + 1] - s[lo]);
      },
    },
  },
  'percentile-skips-range-check': {
    expect: 'caught',
    overrides: {
      percentile(values, p) {
        return refPercentile(values, Math.min(100, Math.max(0, p)));
      },
    },
  },
  'stddev-population-divisor': {
    expect: 'caught',
    overrides: {
      stddev(values) {
        if (values.length < 2) throw new RangeError('statlib: stddev needs at least two values');
        const m = refMean(values);
        let sq = 0;
        for (const v of values) sq += (v - m) * (v - m);
        return Math.sqrt(sq / values.length);
      },
    },
  },
  'stddev-returns-variance': {
    expect: 'caught',
    overrides: {
      stddev(values) {
        if (values.length < 2) throw new RangeError('statlib: stddev needs at least two values');
        const m = refMean(values);
        let sq = 0;
        for (const v of values) sq += (v - m) * (v - m);
        return sq / (values.length - 1);
      },
    },
  },
  'summarize-p95-uses-p90': {
    expect: 'caught',
    overrides: {
      summarize(values) {
        assertNonEmpty(values);
        const s = sorted(values);
        return {
          count: values.length,
          min: s[0],
          max: s[s.length - 1],
          mean: refMean(values),
          median: refMedian(values),
          p95: refPercentile(values, 90),
          stddev: values.length >= 2 ? refStddev(values) : null,
        };
      },
    },
  },
  'normalize-divides-by-mean': {
    expect: 'caught',
    overrides: {
      async normalize(values) {
        const m = refMean(values);
        refStddev(values);
        await Promise.resolve();
        return values.map((v) => (v - m) / m);
      },
    },
  },
  'blind-spot-mean-skips-non-finite': {
    expect: 'missed',
    overrides: {
      mean(values) {
        const finite = values.filter((v) => Number.isFinite(v));
        assertNonEmpty(finite);
        let sum = 0;
        for (const v of finite) sum += v;
        return sum / finite.length;
      },
    },
  },
};
