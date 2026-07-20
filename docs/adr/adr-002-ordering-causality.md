# ADR-002: Ordering & causality — diagnostics_channel TracingChannel events + AsyncLocalStorage

## Choice

Emit record events on `node:diagnostics_channel` channels following the
`TracingChannel` event shape (start / end / error / async settle), with
`AsyncLocalStorage` propagating a per-invocation id through async
continuations so each boundary call records the `seq` of the boundary call it
was made under (`parent`).

## Rationale

`publish()` collapses to a boolean check when no subscriber is attached —
instrumented code costs approximately nothing when not recording. ALS
reconstructs side-effect ordering that a flat event log can't: correct
parenting of concurrent and interleaved calls. This is the same
channel+context combination OpenTelemetry uses.

Async calls additionally record `settle_seq` — their position in the global
settlement order — so a port can be checked against both the call order and
the completion order of the original.

## References

- [diagnostics_channel](https://nodejs.org/api/diagnostics_channel.html)
