# ADR-008: Input generation — first-class fast-check

## Choice

Use [fast-check](https://fast-check.dev/) property/model-based generation to
**drive the reference implementation** and widen coverage before recording.
Its model-based harness (real vs. model) is itself the differential-testing
pattern (original vs. port), one level down.

## Rationale

Doppel records *observed* calls; property generation systematically expands
what gets observed — boundary values, adversarial sizes, unicode, aliased
structures — without anyone hand-writing a corpus. Generated drives are still
recorded deterministically (fixed seed), so the resulting contract stays
reproducible.

## Rejected

- **Diffblue/EvoSuite-style test generation** — Java-centric, and generates
  assertions rather than cross-language contracts.
