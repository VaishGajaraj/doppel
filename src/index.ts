export type {
  Contract,
  ContractHeader,
  ErrorShape,
  GraphNode,
  Interaction,
  JsonValue,
  Outcome,
  RedactionRule,
  TimingClass,
  ValueGraph,
} from './contract/types.ts';
export { FORMAT_VERSION } from './contract/types.ts';
export { canonicalize } from './contract/jcs.ts';
export { encodeCanonical } from './contract/cbor.ts';
export { hashCanonical, sha256Hex } from './contract/hash.ts';
export {
  buildHeader,
  computeBodyHash,
  readContract,
  serializeContract,
  verifyContract,
  writeContract,
} from './contract/io.ts';
export { materialize, snapshot, snapshotArgs } from './capture/snapshot.ts';
export { RecordSession, channels, toErrorShape } from './record/session.ts';
export { instrument, instrumentInPlace, wrapFunction } from './record/wrap.ts';
export { AdapterClient, AdapterError } from './replay/adapter.ts';
export { serveAdapter } from './replay/serve.ts';
export type { AdapterFrame, HostFrame } from './replay/protocol.ts';
export { diffGraphs, render } from './diff/graphdiff.ts';
export {
  checkContract,
  classify,
  compareOutcomes,
  type CheckResult,
  type Divergence,
  type Verdict,
} from './diff/differ.ts';
export { renderHtml, renderMarkdown, writeReports } from './diff/report.ts';
export { clusterDivergences, writeIssueFiles } from './diff/issues.ts';
