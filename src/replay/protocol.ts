import type { ContractHeader, Outcome, ValueGraph } from '../contract/types.ts';

/**
 * Adapter wire protocol v0: newline-delimited JSON over stdio. One request in
 * flight at a time. Deterministic-CBOR framing is planned (the contract's
 * authoritative hash is already CBOR); NDJSON keeps v0 adapters trivial to
 * write in any language.
 */

export type HostFrame =
  | { op: 'init'; doppel: string; header: ContractHeader }
  | { op: 'invoke'; seq: number; boundary: string; args: ValueGraph }
  | { op: 'end' };

export type AdapterFrame =
  | { op: 'ready'; adapter: string; language?: string }
  | { op: 'result'; seq: number; outcome: Outcome }
  | { op: 'error'; seq?: number; message: string };
