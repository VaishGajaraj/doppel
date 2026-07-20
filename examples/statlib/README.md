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
   ([`reference/statlib.ts`](reference/statlib.ts)) through a deterministic
   corpus (fixed datasets + seeded LCG) with the boundary instrumented. The
   24 recorded interactions land in
   [`contracts/statlib.dopl.jsonl`](contracts/statlib.dopl.jsonl) — which is
   committed, because contracts are review artifacts. Recording is
   deterministic: re-run it and the body hash is identical.

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
