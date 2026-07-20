# ADR-003: Canonical format — deterministic CBOR (authoritative) + JCS text mirror (diffable)

## Choice

The authoritative contract identity is **deterministic CBOR**
([RFC 8949 §4.2.1](https://www.rfc-editor.org/rfc/rfc8949.html) core
deterministic encoding with dCBOR numeric reduction — sorted keys by encoded
bytes, shortest-form heads, shortest-form floats, `-0` → `0`, integral floats
→ integers) with a SHA-256 content hash. The **checked-in file is an
[RFC 8785 (JCS)](https://datatracker.ietf.org/doc/html/rfc8785)
canonical-text mirror** for greppable PR review, with the CBOR hash embedded
in the header.

## Rationale

Same value → same bytes → same hash in every language, with native types JSON
can't hold (byte strings, bignums beyond 2^53). JCS gives the human-diffable
projection. No single format gives both, hence the pairing.

## Rejected

- **Protobuf** — explicitly non-canonical (map wire order undefined).
- **MessagePack** — no determinism specification.
