import { createHash } from 'node:crypto';
import type { JsonValue } from './types.ts';
import { encodeCanonical } from './cbor.ts';

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The authoritative content hash: SHA-256 over the deterministic-CBOR bytes. */
export function hashCanonical(value: JsonValue): string {
  return sha256Hex(encodeCanonical(value));
}
