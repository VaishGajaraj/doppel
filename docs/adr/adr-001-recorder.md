# ADR-001: Recorder — import-in-the-middle + require-in-the-middle, Proxy innermost wrap

## Choice

Intercept the module export boundary with
[`import-in-the-middle`](https://github.com/nodejs/import-in-the-middle) (ESM)
and `require-in-the-middle` (CJS) — the OpenTelemetry instrumentation stack —
with a `Proxy` `apply` trap as the innermost wrap on each exported function.
Loaded via `--import doppel/register`, targeting `module.registerHooks()`
(synchronous, on-thread, TypeScript-aware) as it stabilizes.

## Rationale

Battle-tested transparent wrapping across ESM+CJS with near-zero app change —
reuse OTel's plumbing without its span pipeline. `registerHooks()` avoids the
worker-thread message-port dance of `module.register()`.

## Rejected

- **Hand-rolled `Proxy` wrappers as the load mechanism** — can't intercept
  exports before user code binds them, and misses re-exports. Fine only as
  the innermost wrap (which is exactly how doppel uses them; the direct
  `instrument()` API exists for explicit drivers and tests).
- **Full OTel auto-instrumentation as the recorder** — heavy dependency tree,
  built to emit spans to a collector, fiddly ESM setup.
