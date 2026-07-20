import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CheckResult, Divergence } from './differ.ts';

export interface IssueCluster {
  key: string;
  title: string;
  divergences: Divergence[];
}

/**
 * The agent work queue: breaking divergences grouped by probable root cause
 * (same boundary + same first diff path), so one underlying bug that fires on
 * forty recorded inputs becomes one work item with forty repro records.
 */
export function clusterDivergences(result: CheckResult): IssueCluster[] {
  const clusters = new Map<string, IssueCluster>();
  for (const d of result.divergences) {
    if (d.verdict !== 'breaking' && d.verdict !== 'failed') continue;
    const signature = d.diffs[0]?.path ?? 'unknown';
    const key = `${d.boundary} :: ${signature}`;
    let cluster = clusters.get(key);
    if (!cluster) {
      cluster = {
        key,
        title: `${d.boundary} diverges at ${signature}`,
        divergences: [],
      };
      clusters.set(key, cluster);
    }
    cluster.divergences.push(d);
  }
  return [...clusters.values()].sort((a, b) => b.divergences.length - a.divergences.length);
}

export function renderIssue(cluster: IssueCluster, result: CheckResult): string {
  const sample = cluster.divergences[0]!;
  const lines: string[] = [];
  lines.push(`# ${cluster.title}`);
  lines.push('');
  lines.push(
    `The port diverges from the recorded contract for \`${result.library}\` on ` +
      `**${cluster.divergences.length}** recorded interaction(s).`,
  );
  lines.push('');
  lines.push(`- Contract: \`${result.contractPath}\` (\`${result.bodyHash.slice(0, 12)}…\`)`);
  lines.push(`- Adapter: \`${result.adapterCommand}\``);
  lines.push(`- Affected seqs: ${cluster.divergences.map((d) => d.seq).join(', ')}`);
  lines.push('');
  lines.push('## Minimal repro (first recorded interaction)');
  lines.push('');
  lines.push(`Boundary: \`${sample.boundary}\` — recorded interaction \`#${sample.seq}\``);
  lines.push('');
  lines.push('```');
  lines.push(`args: ${sample.args}`);
  lines.push('```');
  lines.push('');
  lines.push('| path | recorded | port |');
  lines.push('|---|---|---|');
  for (const diff of sample.diffs) {
    lines.push(`| \`${diff.path}\` | \`${diff.expected}\` | \`${diff.actual}\` |`);
  }
  lines.push('');
  lines.push(
    `To reproduce: \`doppel check --contract ${result.contractPath} --adapter "${result.adapterCommand}"\``,
  );
  lines.push('');
  return lines.join('\n');
}

export function writeIssueFiles(dir: string, result: CheckResult): string[] {
  const clusters = clusterDivergences(result);
  mkdirSync(dir, { recursive: true });
  const written: string[] = [];
  clusters.forEach((cluster, i) => {
    const slug = cluster.key.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
    const path = join(dir, `${String(i + 1).padStart(3, '0')}-${slug}.md`);
    writeFileSync(path, renderIssue(cluster, result), 'utf8');
    written.push(path);
  });
  return written;
}
