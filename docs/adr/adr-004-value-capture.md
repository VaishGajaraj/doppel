# ADR-004: Value capture — canonical value-graph capturer

## Choice

Capture rich JS values as a **flat reference-graph node table** (the pattern
proven by Rich Harris's [devalue](https://github.com/Rich-Harris/devalue),
which powers SvelteKit): shared objects dedupe to one node, cycles become
back-references, and the extended type set (Map, Set, BigInt, Date,
`undefined`, typed arrays, NaN/±Infinity/−0) survives. Traversal is
**canonical** — object keys sorted, Map entries and Set members sorted by a
deterministic key — with `Set` → sorted members and `Map` → sorted entries
normalized at this layer.

## Rationale

`JSON.stringify` drops Map/Set/BigInt/Date/undefined and throws on cycles;
pointer-identity aliasing in recorded args must survive the round trip — a
port that returns two references to one object is behaviorally different from
one that returns two copies.

The capturer is doppel's own (~200 lines) rather than devalue itself: devalue
serializes in traversal-encounter order, which follows object insertion
order, so two semantically equal values could capture to different graphs and
different hashes. Canonical traversal is the property the whole format rests
on, so it lives in the capturer, not in a post-pass. (See
[implementation notes](implementation-notes.md).)

## Rejected

- **devalue as-is** — reference graph and cycles, but traversal order isn't
  canonical, which destabilizes the content hash.
- **superjson** — doesn't preserve shared object identity (re-emits
  duplicates).
- **flatted** — cycles but not the extended type set.
