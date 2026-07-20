# ADR-007: Storage & CI gate — insta-style review, never auto-update in CI

## Choice

Commit the canonical-text mirror + CBOR hash to the repo. Review contract
changes with the [insta](https://github.com/mitsuhiko/insta) accept/reject
model: a changed boundary must be **re-recorded and re-approved in a PR**.
Ship `doppel check` (non-zero exit on new breaking divergences) as a CI gate
job behind branch protection. **Contracts are never auto-written in CI.**

## Rationale

Intended behavioral change vs. regression is a human decision;
auto-accepting snapshots in CI (Vitest's default) destroys the golden-master
guarantee. The PR diff of the JCS mirror is the review artifact — you see
exactly which recorded behavior changed, per interaction, per path.
