import type { Contract, Interaction, Outcome } from '../contract/types.ts';
import { readContract, verifyContract } from '../contract/io.ts';
import { pathMatches } from '../capture/redact.ts';
import { AdapterClient, AdapterError } from '../replay/adapter.ts';
import { diffGraphs, render, type DiffEntry } from './graphdiff.ts';

export type Verdict = 'identical' | 'benign' | 'breaking' | 'failed';

export interface Divergence {
  seq: number;
  boundary: string;
  verdict: Verdict;
  args: string;
  diffs: DiffEntry[];
}

export interface CheckSummary {
  interactions: number;
  identical: number;
  benign: number;
  breaking: number;
  failed: number;
}

export interface CheckResult {
  library: string;
  contractPath: string;
  adapter: string;
  adapterCommand: string;
  bodyHash: string;
  summary: CheckSummary;
  divergences: Divergence[];
}

export function compareOutcomes(expected: Outcome, actual: Outcome): DiffEntry[] {
  if (expected.kind !== actual.kind) {
    return [
      {
        path: 'outcome',
        expected: expected.kind === 'return' ? 'return' : `throw ${expected.error.name}`,
        actual: actual.kind === 'return' ? 'return' : `throw ${actual.error.name}`,
        note: 'outcome kind changed',
      },
    ];
  }
  if (expected.kind === 'return' && actual.kind === 'return') {
    return diffGraphs(expected.value, actual.value, 'return');
  }
  if (expected.kind === 'throw' && actual.kind === 'throw') {
    const diffs: DiffEntry[] = [];
    if (expected.error.name !== actual.error.name) {
      diffs.push({ path: 'error.name', expected: expected.error.name, actual: actual.error.name });
    }
    if (expected.error.message !== actual.error.message) {
      diffs.push({ path: 'error.message', expected: expected.error.message, actual: actual.error.message });
    }
    if ((expected.error.code ?? null) !== (actual.error.code ?? null)) {
      diffs.push({
        path: 'error.code',
        expected: expected.error.code ?? '(none)',
        actual: actual.error.code ?? '(none)',
      });
    }
    return diffs;
  }
  return [];
}

/**
 * Benign classification is explicit: a divergence is benign only when every
 * one of its diff paths matches a declared benign pattern. There are no
 * built-in benign paths — silence is a decision someone made in a PR.
 */
export function classify(diffs: DiffEntry[], benign: string[]): Verdict {
  if (diffs.length === 0) return 'identical';
  const patterns = benign.map((p) => p.split('.'));
  const allBenign = diffs.every((d) =>
    patterns.some((pattern) => pathMatches(pattern, d.path.split('.'))),
  );
  return allBenign ? 'benign' : 'breaking';
}

export interface CheckOptions {
  contractPath: string;
  adapterCommand: string;
  benign?: string[];
  timeoutMs?: number;
  onProgress?: (done: number, total: number) => void;
}

export async function checkContract(opts: CheckOptions): Promise<CheckResult> {
  const contract: Contract = readContract(opts.contractPath);
  const integrity = verifyContract(contract);
  if (integrity) {
    throw new Error(`contract failed integrity check: ${integrity}`);
  }

  const client = new AdapterClient(opts.adapterCommand, {
    ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
  });
  const benign = opts.benign ?? [];
  const divergences: Divergence[] = [];
  const summary: CheckSummary = {
    interactions: contract.interactions.length,
    identical: 0,
    benign: 0,
    breaking: 0,
    failed: 0,
  };

  try {
    await client.init(contract.header);
    let done = 0;
    for (const interaction of contract.interactions) {
      const divergence = await checkOne(client, interaction, benign);
      summary[divergence.verdict === 'identical' ? 'identical' : divergence.verdict]++;
      if (divergence.verdict !== 'identical') divergences.push(divergence);
      opts.onProgress?.(++done, contract.interactions.length);
    }
  } finally {
    client.end();
  }

  return {
    library: contract.header.library,
    contractPath: opts.contractPath,
    adapter: client.adapterName,
    adapterCommand: opts.adapterCommand,
    bodyHash: contract.header.body_hash,
    summary,
    divergences,
  };
}

async function checkOne(
  client: AdapterClient,
  interaction: Interaction,
  benign: string[],
): Promise<Divergence> {
  const args = render(interaction.args, interaction.args.r, 160);
  try {
    const actual = await client.invoke(interaction);
    const diffs = compareOutcomes(interaction.outcome, actual);
    return {
      seq: interaction.seq,
      boundary: interaction.boundary,
      verdict: classify(diffs, benign),
      args,
      diffs,
    };
  } catch (err) {
    if (err instanceof AdapterError) {
      return {
        seq: interaction.seq,
        boundary: interaction.boundary,
        verdict: 'failed',
        args,
        diffs: [{ path: 'adapter', expected: 'a result frame', actual: err.message }],
      };
    }
    throw err;
  }
}
