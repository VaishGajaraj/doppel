# The doppel conformance contract — format v0.1

The contract is the product: a language-independent, diffable, versioned
record of a library's observable behavior at its export boundary. A port of
the library is correct exactly when it satisfies the contract.

## File layout

A contract is a JSONL file (conventionally `*.dopl.jsonl`). Line 1 is the
header; each following line is one interaction. Every line is [RFC 8785
(JCS)](https://datatracker.ietf.org/doc/html/rfc8785) canonical JSON — sorted
keys, ECMAScript number formatting, no insignificant whitespace — so the file
is greppable, and PR diffs show exactly the behavior that changed.

```json
{"body_hash":"53a2b96…","doppel":"0.1","interaction_count":24,"kind":"doppel-contract","language":"javascript","library":"statlib","redactions":[]}
{"args":{"n":[["arr",[1]],["arr",[2,3,…]],["prim",1],…],"r":0},"boundary":"statlib#mean","outcome":{"kind":"return","value":{"n":[["prim",5.5]],"r":0}},"seq":0,"timing":"sync"}
```

## Dual encoding: authoritative CBOR, diffable text

Two canonical encodings back every contract, per
[ADR-003](adr/adr-003-canonical-format.md):

- **Authoritative identity** — `body_hash` is SHA-256 over the
  [RFC 8949 §4.2.1](https://www.rfc-editor.org/rfc/rfc8949.html) deterministic
  CBOR encoding of the interaction list (shortest-form integer heads,
  shortest-form floats across f16/f32/f64, map keys sorted bytewise by encoded
  form, dCBOR numeric reduction: `-0` → `0`, integral floats → integers).
  Same recorded behavior ⇒ same bytes ⇒ same hash, in every language.
- **Checked-in mirror** — the JCS text you actually read and review.

`doppel hash --contract <file>` recomputes the hash and fails on any mismatch
between mirror and identity, including truncation and hand-edits.

## Header fields

| field | meaning |
|---|---|
| `kind` | always `"doppel-contract"` |
| `doppel` | contract format version (`"0.1"`) |
| `library` | logical name of the recorded library |
| `language` | language of the reference implementation |
| `interaction_count` | number of interaction lines that must follow |
| `body_hash` | SHA-256 hex over deterministic-CBOR of the interaction list |
| `redactions` | non-determinism normalization rules (applied on both sides) |

## Interactions

| field | meaning |
|---|---|
| `seq` | global call-start order (monotonic) |
| `boundary` | `"<module>#<export>"` |
| `args` | value graph of the argument list, captured at call time (pre-mutation) |
| `outcome` | `{kind:"return", value:<graph>}` or `{kind:"throw", error:{name, message, code?}}` |
| `timing` | `"sync"` or `"async"` (settled via promise) |
| `settle_seq` | async only — position in the global settlement order |
| `parent` | causality — `seq` of the boundary call this call was made under |

## Value graphs

Values are captured as a flat node table (`n`) plus root index (`r`). Nodes
are tagged tuples. Object identity is preserved — two references to the same
object are two references to the same node index — and cycles are
back-references, so aliasing behavior survives the round trip.

| node | meaning |
|---|---|
| `["prim", v]` | string / finite number / boolean / null |
| `["num", "NaN" \| "Infinity" \| "-Infinity" \| "-0"]` | non-JSON numerics |
| `["undef"]` | `undefined` |
| `["bigint", "…"]`, `["date", iso]`, `["bytes", base64]` | extended scalars |
| `["regexp", src, flags]`, `["symbol", desc]`, `["fn", name]` | opaque-ish JS values |
| `["err", {name, message, code?}]` | Error objects |
| `["arr", [i…]]` | array, element node indices |
| `["obj", [[key, i]…], ctor?]` | object; entries sorted by key; optional constructor name |
| `["map", [[ki, vi]…]]` | Map; entries sorted by canonical key encoding |
| `["set", [i…]]` | Set; members sorted by canonical encoding |
| `["redacted", action]` | value removed by a redaction rule |
| `["opaque", tag]` | anything else (also truncation and throwing getters) |

Canonical traversal — object keys sorted, Map/Set members sorted by a
deterministic key — means two semantically equal values always capture to the
same graph, regardless of insertion order. That property is what makes the
hash stable.

## Redaction rules

Non-determinism (timestamps, RNG, UUIDs, handles) is quarantined at record
time, per [ADR-005](adr/adr-005-nondeterminism.md):

```json
{"boundary": "api#*", "path": "return.elapsed_ms", "action": "bucket", "n": 100}
```

- `path` is a dot path over the logical value (`args.0.token`,
  `return.items.*.id`); `*` matches one segment, `**` any suffix.
- Actions: `blank` (remove the value), `round` (to `n` digits), `bucket`
  (floor to width `n`).
- Rules live in the header and are applied by **both** the recorder and the
  adapter, so both sides normalize identically. The deeper pattern is still
  to inject a fixed clock/seed at record time; redaction is the fallback.

## Adapter wire protocol v0

`doppel check` spawns the port's adapter as a subprocess and speaks
newline-delimited JSON over stdio, one request in flight at a time:

```
→ {"op":"init","doppel":"0.1","header":<header>}
← {"op":"ready","adapter":"statlib-rust-port","language":"rust"}
→ {"op":"invoke","seq":0,"boundary":"statlib#mean","args":<graph>}
← {"op":"result","seq":0,"outcome":{"kind":"return","value":<graph>}}
→ {"op":"end"}
```

Subprocess-over-stdio is the language-neutrality mechanism
([ADR-006](adr/adr-006-rust-harness.md)): supporting another target language
is a new binary, not a new binding layer. Deterministic-CBOR framing of the
same frames is planned; NDJSON keeps v0 adapters a screenful of code.

## Divergence classification

For each interaction the differ compares recorded vs. actual outcome and
classifies:

- **identical** — canonical encodings match exactly.
- **benign** — every diff path matches a benign pattern declared on the
  command line (e.g. `--benign error.message`). There are no built-in benign
  paths: silence is a decision someone made, visibly, in a PR.
- **breaking** — anything else. `doppel check` exits non-zero.
- **failed** — the adapter crashed, answered out of order, or timed out.

## Versioning

`doppel` (format version) gates parsing; contracts are re-recorded — never
edited — when behavior intentionally changes, and the diff of the mirror file
is the review artifact ([ADR-007](adr/adr-007-storage-ci-gate.md)).
