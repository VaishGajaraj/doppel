# Implementation notes — where v0 deviates, and why

Honest ledger of the gaps between the ADRs and what v0.1 ships. Each is a
conscious sequencing call, not a silent drop.

## Wire protocol is NDJSON, not CBOR (ADR-006)

The contract's *authoritative identity* is already deterministic CBOR — the
hash is computed over CBOR bytes on every write and verify. The *adapter
wire* speaks canonical-JSON NDJSON for v0 because it makes an adapter ~50
lines in any language with a JSON parser, and debuggable with `cat`. CBOR
framing of the same frames (serde + ciborium on the Rust side) is the planned
upgrade; the frame schema doesn't change.

## Custom capturer instead of devalue (ADR-004)

ADR-004 originally named devalue for capture. Implementation surfaced a
conflict: devalue serializes in traversal-encounter order (object insertion
order), so two semantically equal values can produce different flat graphs —
and therefore different content hashes. Hash stability under insertion order
is load-bearing for the whole format, so v0 ships its own capturer
implementing devalue's flat-graph pattern with canonical traversal (sorted
keys, sorted Map/Set members). The ADR text now records this.

## registerHooks() migration pending (ADR-001)

v0 loads import-in-the-middle via `module.register()` (the battle-tested
path OTel uses) with a catch-all hook filtered in the callback, so bare
package names, relative files, and file URLs all match identically.
Moving to synchronous `module.registerHooks()` happens once iitm's support
for it settles.

## TracingChannel shape, not tracingChannel() object (ADR-002)

v0 publishes on four named `diagnostics_channel` channels following the
TracingChannel event vocabulary (start/end/error/asyncSettle) rather than a
`dc.tracingChannel()` instance, keeping seq assignment in the subscriber. The
zero-cost-when-unsubscribed property is identical.

## fast-check integration not yet shipped (ADR-008)

The statlib example records a hand-written deterministic corpus. `doppel
generate` (fast-check drivers with fixed seeds) is milestone M2 scope.

## Rust adapter does not re-apply redactions

Contracts whose redaction rules must transform *port* outputs should verify
through an adapter that applies them (the bundled JS adapter does). The Rust
reference crate documents this limitation; contract-header rules travel in
`init` so adapters can implement them.
