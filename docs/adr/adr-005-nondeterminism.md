# ADR-005: Non-determinism — declared redaction rules; prefer control over scrub

## Choice

The contract carries explicit **redaction rules** (boundary glob + dot-path
pattern) that blank or bucket timestamps, RNG, UUIDs, and handle-like values
before hashing; floats always serialize shortest-round-trip. Rules are stored
in the contract header and applied identically by the recorder and by
adapters, so both sides normalize the same way.

The deeper pattern is to **inject a fixed clock/seed at record time** rather
than scrubbing after — redaction is the declared, reviewable fallback for
sources you can't control.

## Rationale

Without this, every replay diverges on incidental values and the signal
drowns. The lesson from insta's redactions and the Antithesis/Temporal
clock-discipline school is that controlling non-determinism sources beats
post-hoc scrubbing; when you must scrub, the scrub should be a visible,
versioned part of the contract — not an ad-hoc test helper.

## References

- [insta redactions](https://insta.rs/docs/redactions/)
