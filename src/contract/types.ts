/** A JSON-representable value (the only thing allowed inside a contract). */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * One node of a captured value graph. Nodes are tagged tuples so the encoding
 * stays language-neutral and greppable. Object identity is preserved: two
 * references to the same object resolve to the same node index, and cycles are
 * back-references to an already-allocated index.
 */
export type GraphNode =
  | ['prim', string | number | boolean | null]
  | ['num', 'NaN' | 'Infinity' | '-Infinity' | '-0']
  | ['undef']
  | ['bigint', string]
  | ['date', string]
  | ['bytes', string]
  | ['regexp', string, string]
  | ['symbol', string]
  | ['fn', string]
  | ['err', ErrorShape]
  | ['arr', number[]]
  | ['obj', Array<[string, number]>]
  | ['obj', Array<[string, number]>, string]
  | ['map', Array<[number, number]>]
  | ['set', number[]]
  | ['redacted', string]
  | ['opaque', string];

/** A captured value: node table plus root index. */
export interface ValueGraph {
  r: number;
  n: GraphNode[];
}

export interface ErrorShape {
  name: string;
  message: string;
  code?: string;
}

export type Outcome =
  | { kind: 'return'; value: ValueGraph }
  | { kind: 'throw'; error: ErrorShape };

export type TimingClass = 'sync' | 'async';

/** One recorded boundary crossing. */
export interface Interaction {
  seq: number;
  boundary: string;
  args: ValueGraph;
  outcome: Outcome;
  timing: TimingClass;
  /** Async only: position in the global settlement order. */
  settle_seq?: number;
  /** Causality: seq of the boundary call this one was made under, if any. */
  parent?: number;
}

export interface RedactionRule {
  /** Optional boundary glob, e.g. "statlib#*". Absent = all boundaries. */
  boundary?: string;
  /** Dot path over the logical value, e.g. "args.0.timestamp". `*` matches one segment, `**` any suffix. */
  path: string;
  action: 'blank' | 'round' | 'bucket';
  /** Digits for round, bucket width for bucket. */
  n?: number;
}

export interface ContractHeader {
  kind: 'doppel-contract';
  doppel: string;
  library: string;
  language: string;
  interaction_count: number;
  /** SHA-256 (hex) over the deterministic-CBOR encoding of the interaction list. */
  body_hash: string;
  redactions: RedactionRule[];
}

export interface Contract {
  header: ContractHeader;
  interactions: Interaction[];
}

export const FORMAT_VERSION = '0.1';
