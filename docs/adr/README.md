# Architecture Decision Records

Library and design choices for the port-verification kit, July 2026. Each ADR
states the choice, the rationale, and what was rejected. The overriding
principle: **determinism, language-neutrality, genuinely diffable in PRs.**

Two load-bearing calls:

1. The authoritative contract is deterministic CBOR bytes + hash, with a
   canonical-text mirror checked in ([ADR-003](adr-003-canonical-format.md)).
2. The target-language adapter runs as a subprocess over the serialized
   contract, not FFI ([ADR-006](adr-006-rust-harness.md)).

| # | Decision | Choice |
|---|---|---|
| [001](adr-001-recorder.md) | Recorder | import-in-the-middle + require-in-the-middle, Proxy innermost wrap |
| [002](adr-002-ordering-causality.md) | Ordering & causality | diagnostics_channel (TracingChannel events) + AsyncLocalStorage |
| [003](adr-003-canonical-format.md) | Canonical format | deterministic CBOR (authoritative + hash) + JCS text mirror (diffable) |
| [004](adr-004-value-capture.md) | Value capture | canonical value-graph capturer (devalue's flat-graph pattern, canonical traversal) |
| [005](adr-005-nondeterminism.md) | Non-determinism | declared redaction rules; prefer controlling sources over scrubbing |
| [006](adr-006-rust-harness.md) | Target harness | stdio subprocess adapters; Rust reference crate |
| [007](adr-007-storage-ci-gate.md) | Storage & CI gate | in-repo contracts, insta-style review, never auto-update in CI |
| [008](adr-008-input-generation.md) | Input generation | fast-check property generation to widen recorded coverage |

[Implementation notes](implementation-notes.md) record where v0 consciously
deviates from an ADR and why.

## Prior art (reuse vs. distinct)

Approval/characterization testing is the closest ancestor — doppel reuses the
record-once / diff-on-change / human-approve loop, but generalizes the
artifact to a language-neutral contract. Antithesis, Temporal replay, `rr`,
and replay.io solve deterministic capture for *one* system (mineable for
non-determinism control, orthogonal to cross-implementation diffing).
Polly.js/VCR proved the checked-in-cassette model (HTTP-only). None of them do
**cross-implementation differential replay** — that is doppel's distinct core.
