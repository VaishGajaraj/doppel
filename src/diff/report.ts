import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CheckResult, Divergence } from './differ.ts';

function mdEscape(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

export function renderMarkdown(result: CheckResult): string {
  const { summary } = result;
  const lines: string[] = [];
  lines.push(`# doppel report — ${result.library}`);
  lines.push('');
  lines.push(`- Contract: \`${result.contractPath}\` (\`${result.bodyHash.slice(0, 12)}…\`)`);
  lines.push(`- Adapter: \`${result.adapter}\` via \`${result.adapterCommand}\``);
  lines.push('');
  lines.push('| interactions | identical | benign | breaking | failed |');
  lines.push('|---:|---:|---:|---:|---:|');
  lines.push(
    `| ${summary.interactions} | ${summary.identical} | ${summary.benign} | ${summary.breaking} | ${summary.failed} |`,
  );
  lines.push('');
  const verdictOrder: Divergence['verdict'][] = ['breaking', 'failed', 'benign'];
  for (const verdict of verdictOrder) {
    const items = result.divergences.filter((d) => d.verdict === verdict);
    if (!items.length) continue;
    lines.push(`## ${verdict} (${items.length})`);
    lines.push('');
    for (const d of items) {
      lines.push(`### #${d.seq} \`${d.boundary}\``);
      lines.push('');
      lines.push(`Recorded args: \`${mdEscape(d.args)}\``);
      lines.push('');
      lines.push('| path | recorded | port | note |');
      lines.push('|---|---|---|---|');
      for (const diff of d.diffs) {
        lines.push(
          `| \`${mdEscape(diff.path)}\` | \`${mdEscape(diff.expected)}\` | \`${mdEscape(diff.actual)}\` | ${mdEscape(diff.note ?? '')} |`,
        );
      }
      lines.push('');
    }
  }
  if (!result.divergences.length) {
    lines.push('No divergences. The port matches the recorded boundary.');
    lines.push('');
  }
  return lines.join('\n');
}

function htmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderHtml(result: CheckResult): string {
  const { summary } = result;
  const badge = (label: string, value: number, color: string) =>
    `<span class="badge" style="--c:${color}">${label} <b>${value}</b></span>`;
  const rows = result.divergences
    .map(
      (d) => `
    <details class="d ${d.verdict}">
      <summary><code>#${d.seq}</code> <code>${htmlEscape(d.boundary)}</code> <em>${d.verdict}</em></summary>
      <p>Recorded args: <code>${htmlEscape(d.args)}</code></p>
      <table><tr><th>path</th><th>recorded</th><th>port</th><th>note</th></tr>
      ${d.diffs
        .map(
          (x) =>
            `<tr><td><code>${htmlEscape(x.path)}</code></td><td><code>${htmlEscape(x.expected)}</code></td><td><code>${htmlEscape(x.actual)}</code></td><td>${htmlEscape(x.note ?? '')}</td></tr>`,
        )
        .join('')}
      </table>
    </details>`,
    )
    .join('\n');
  return `<!doctype html>
<meta charset="utf-8">
<title>doppel report — ${htmlEscape(result.library)}</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; max-width: 60rem; margin: 2rem auto; padding: 0 1rem; color: #1a1a2e; }
  code { background: #f0f0f5; padding: .1em .35em; border-radius: 4px; font-size: .9em; }
  .badge { display: inline-block; margin-right: .5rem; padding: .2em .6em; border-radius: 999px; background: color-mix(in srgb, var(--c) 15%, white); border: 1px solid var(--c); }
  table { border-collapse: collapse; width: 100%; margin: .5rem 0 1rem; }
  th, td { border: 1px solid #ddd; padding: .35em .6em; text-align: left; vertical-align: top; }
  details.d { border-left: 4px solid #ccc; padding: .25rem .75rem; margin: .5rem 0; background: #fafafa; }
  details.breaking { border-color: #d33; }
  details.failed { border-color: #a3a; }
  details.benign { border-color: #e9a13b; }
  summary { cursor: pointer; }
</style>
<h1>doppel report — ${htmlEscape(result.library)}</h1>
<p>Contract <code>${htmlEscape(result.contractPath)}</code> (<code>${result.bodyHash.slice(0, 12)}…</code>)
   · adapter <code>${htmlEscape(result.adapter)}</code></p>
<p>
  ${badge('interactions', summary.interactions, '#888')}
  ${badge('identical', summary.identical, '#2a7')}
  ${badge('benign', summary.benign, '#e9a13b')}
  ${badge('breaking', summary.breaking, '#d33')}
  ${badge('failed', summary.failed, '#a3a')}
</p>
${rows || '<p>No divergences. The port matches the recorded boundary.</p>'}
`;
}

export function writeReports(dir: string, result: CheckResult): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'report.json'), JSON.stringify(result, null, 2) + '\n', 'utf8');
  writeFileSync(join(dir, 'report.md'), renderMarkdown(result), 'utf8');
  writeFileSync(join(dir, 'report.html'), renderHtml(result), 'utf8');
}
