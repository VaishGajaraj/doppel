import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Contract, ContractHeader, Interaction, JsonValue, RedactionRule } from './types.ts';
import { FORMAT_VERSION } from './types.ts';
import { canonicalize } from './jcs.ts';
import { hashCanonical } from './hash.ts';

/**
 * Contract files are JSONL: line 1 is the header, every following line is one
 * interaction. Each line is RFC 8785 canonical text — the greppable,
 * PR-diffable mirror. The authoritative identity is `body_hash`, computed over
 * the deterministic-CBOR encoding of the interaction list, so the same
 * recorded behavior yields the same hash regardless of which language wrote
 * the file.
 */

export function computeBodyHash(interactions: Interaction[]): string {
  return hashCanonical(interactions as unknown as JsonValue);
}

export function buildHeader(opts: {
  library: string;
  language?: string;
  redactions?: RedactionRule[];
  interactions: Interaction[];
}): ContractHeader {
  return {
    kind: 'doppel-contract',
    doppel: FORMAT_VERSION,
    library: opts.library,
    language: opts.language ?? 'typescript',
    interaction_count: opts.interactions.length,
    body_hash: computeBodyHash(opts.interactions),
    redactions: opts.redactions ?? [],
  };
}

export function serializeContract(contract: Contract): string {
  const lines = [canonicalize(contract.header as unknown as JsonValue)];
  for (const interaction of contract.interactions) {
    lines.push(canonicalize(interaction as unknown as JsonValue));
  }
  return lines.join('\n') + '\n';
}

export function writeContract(path: string, contract: Contract): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeContract(contract), 'utf8');
}

export function readContract(path: string): Contract {
  const raw = readFileSync(path, 'utf8');
  const lines = raw.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length === 0) throw new Error(`empty contract file: ${path}`);
  const header = JSON.parse(lines[0]!) as ContractHeader;
  if (header.kind !== 'doppel-contract') {
    throw new Error(`not a doppel contract (missing header): ${path}`);
  }
  const interactions = lines.slice(1).map((line) => JSON.parse(line) as Interaction);
  return { header, interactions };
}

/** Returns null when intact, otherwise a description of the mismatch. */
export function verifyContract(contract: Contract): string | null {
  const { header, interactions } = contract;
  if (interactions.length !== header.interaction_count) {
    return `interaction count mismatch: header says ${header.interaction_count}, file has ${interactions.length}`;
  }
  const actual = computeBodyHash(interactions);
  if (actual !== header.body_hash) {
    return `body hash mismatch: header says ${header.body_hash}, recomputed ${actual}`;
  }
  return null;
}
