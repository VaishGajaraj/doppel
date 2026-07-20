# statlib — the end-to-end example

A small descriptive-statistics library standing in for "the codebase you are
about to rewrite", plus a deliberately buggy "port" of it — the kind of port
an agent produces when its only oracle is a test suite written from the code
instead of the behavior.

Run the whole loop:

```console
$ npm run demo
```

## What happens

1. **Record** — [`record.js`](record.js) drives the reference implementation
   ([`reference/statlib.js`](reference/statlib.js)) through a deterministic
   corpus ([`corpus.js`](corpus.js): fixed datasets + seeded LCG) with the
   boundary instrumented. The 24 recorded interactions land in
   [`contracts/statlib.dopl.jsonl`](contracts/statlib.dopl.jsonl) — which is
   committed, because contracts are review artifacts. Recording is
   deterministic: re-run it and the body hash is identical.

   The same corpus recorded the other way — [`workload.js`](workload.js) is a
   plain script with no doppel imports, run under
   `doppel record --config doppel.config.json` — produces a **byte-identical**
   contract. The test suite pins that equivalence.

2. **Check** — the "port" ([`port/statlib.js`](port/statlib.js)) carries two
   injected regressions and one harmless drift:

   | injected change | doppel verdict |
   |---|---|
   | `percentile` uses nearest-rank instead of linear interpolation | **breaking** ×4 (plus `summarize.p95`) — correct at p=0/100, wrong between |
   | `stddev` divides by *n* instead of *n−1* | **breaking** ×3 (plus `summarize.stddev`, `normalize`) |
   | reworded `RangeError` message | **benign** ×2 under `--benign error.message` |

   `doppel check` replays all 24 interactions against the port through its
   [adapter](port/adapter.js) and reports 12 identical, 2 benign, 10
   breaking — exit code 1.

Both regressions are invisible to a test suite that asserts what the port
*does*; they are only visible against a record of what the original *did*.
That is the entire pitch, in one directory.

## The mutation sweep

`npm run mutants` goes further than two hand-picked bugs: it applies eleven
single-fault mutants ([`port/mutants.js`](port/mutants.js)) — off-by-one
divisors, skipped averaging, nearest-rank substitution, dropped range checks,
a forgotten square root — and measures the catch rate against the contract:

- **10/10 core mutants caught** (each with the breaking-divergence count),
  machine-checked in CI. The venture kill criterion is ≥ 8/10.
- **1 blind-spot mutant missed, by design**: its fault only fires on inputs
  (non-finite values) the corpus never recorded. The oracle is exactly as
  wide as the corpus — that miss is the honest demonstration of the limit,
  and the reason input generation ([ADR-008](../../docs/adr/adr-008-input-generation.md))
  is on the roadmap.

## The same check, against Rust

[`adapters/rust/examples/statlib.rs`](../../adapters/rust/examples/statlib.rs)
is a *correct* Rust port of the same reference, mirroring its floating-point
operation order. CI builds it and verifies it against the same committed
contract — all 24 interactions identical, across languages:

```console
$ cargo build --manifest-path adapters/rust/Cargo.toml --example statlib
$ node bin/doppel.js check \
    --contract examples/statlib/contracts/statlib.dopl.jsonl \
    --adapter "./adapters/rust/target/debug/examples/statlib"
```

The first run of this check in CI reported 23/24 identical — the divergence
was serde_json's default float parsing rounding a recorded value to its
1-ULP neighbor (fixed with the `float_roundtrip` feature). The gate caught a
toolchain infidelity before it could masquerade as port correctness.
