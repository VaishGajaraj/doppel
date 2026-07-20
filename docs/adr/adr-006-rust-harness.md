# ADR-006: Target harness — stdio subprocess adapters; Rust reference crate

## Choice

`doppel check` spawns the target-language adapter as a **standalone binary
over stdio** — contract frames in, results out — with a reference Rust crate
([`adapters/rust`](../../adapters/rust)) implementing the protocol. Each
contract file can become a real `cargo test` case via
[datatest-stable](https://github.com/nextest-rs/datatest-stable) (parallel
under `cargo nextest`); CBOR deserialization on the Rust side lands with
serde + [ciborium](https://docs.rs/ciborium) (maintained, unlike the archived
`serde_cbor`) when the wire moves from NDJSON to CBOR framing.

## Rationale

Subprocess-over-stdio maximizes language-neutrality: "add Python next" is a
new binary, not a new binding layer. Comparison logic stays in the TypeScript
core so every adapter stays a screenful of code.

## Rejected

- **FFI / napi-rs as the default** — tighter ABI coupling; acceptable only as
  a fallback for in-process calls.
- The eventual truly-neutral shim is the **WASM Component Model + WIT** once
  WASI 0.3 lands — tracked, not blocked on.
