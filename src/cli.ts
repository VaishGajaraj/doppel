import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { readContract, verifyContract } from './contract/io.ts';
import { checkContract, type CheckResult } from './diff/differ.ts';
import { writeReports } from './diff/report.ts';
import { writeIssueFiles } from './diff/issues.ts';

const HELP = `doppel — port verification kit

Usage:
  doppel record --config <doppel.config.json> -- <command...>
      Run a command (usually your test suite or a workload driver) with the
      recorder attached; writes the contract configured in the config file.

  doppel check --contract <file> --adapter "<command>"
      Replay every recorded interaction against a port via its adapter and
      classify divergences. Exits 1 on breaking/failed divergences.
      Options:
        --benign <path-glob>     declare a diff path benign (repeatable),
                                 e.g. --benign error.message
        --report-dir <dir>       write report.json / report.md / report.html
        --timeout <ms>           per-interaction adapter timeout (default 30000)

  doppel issues --report <report.json> [--out <dir>]
      Turn breaking divergences into a work queue of markdown issue files,
      clustered by probable root cause. (default out: .doppel/issues)

  doppel hash --contract <file>
      Verify contract integrity and print the authoritative body hash.

  doppel help
`;

function fail(message: string): never {
  process.stderr.write(`doppel: ${message}\n`);
  process.exit(2);
}

function color(code: number, s: string): string {
  return process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s;
}

function registerEntry(): string {
  const distUrl = new URL('./record/register.js', import.meta.url);
  const srcUrl = new URL('./record/register.ts', import.meta.url);
  if (existsSync(fileURLToPath(distUrl))) return fileURLToPath(distUrl);
  return fileURLToPath(srcUrl);
}

async function cmdRecord(args: string[], childArgs: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: { config: { type: 'string' } },
    allowPositionals: false,
  });
  if (!values.config) fail('record requires --config <path>');
  if (!childArgs.length) fail('record requires a command after --');
  const config = JSON.parse(readFileSync(values.config, 'utf8')) as { out?: string };
  if (!config.out) fail(`config ${values.config} is missing "out"`);

  const nodeOptions = [process.env.NODE_OPTIONS, `--import ${JSON.stringify(registerEntry())}`]
    .filter(Boolean)
    .join(' ');
  const child = spawn(childArgs[0]!, childArgs.slice(1), {
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: nodeOptions, DOPPEL_CONFIG: values.config },
  });
  return await new Promise<number>((resolve) => {
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', (err) => {
      process.stderr.write(`doppel: failed to start command: ${err.message}\n`);
      resolve(1);
    });
  });
}

function printSummary(result: CheckResult): void {
  const s = result.summary;
  process.stdout.write(
    [
      '',
      `  contract    ${result.contractPath}`,
      `  body hash   ${result.bodyHash.slice(0, 16)}…`,
      `  adapter     ${result.adapter} (${result.adapterCommand})`,
      '',
      `  interactions  ${s.interactions}`,
      `  ${color(32, 'identical')}     ${s.identical}`,
      `  ${color(33, 'benign')}        ${s.benign}`,
      `  ${color(31, 'breaking')}      ${s.breaking}`,
      `  ${color(35, 'failed')}        ${s.failed}`,
      '',
    ].join('\n') + '\n',
  );
  for (const d of result.divergences) {
    if (d.verdict === 'benign') continue;
    process.stdout.write(`  ${color(31, '✗')} #${d.seq} ${d.boundary}\n`);
    for (const diff of d.diffs.slice(0, 4)) {
      process.stdout.write(`      ${diff.path}: recorded ${diff.expected} → port ${diff.actual}\n`);
    }
    if (d.diffs.length > 4) {
      process.stdout.write(`      … ${d.diffs.length - 4} more diff(s)\n`);
    }
  }
  if (result.divergences.some((d) => d.verdict !== 'benign')) process.stdout.write('\n');
}

async function cmdCheck(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      contract: { type: 'string' },
      adapter: { type: 'string' },
      benign: { type: 'string', multiple: true },
      'report-dir': { type: 'string' },
      timeout: { type: 'string' },
    },
    allowPositionals: false,
  });
  if (!values.contract) fail('check requires --contract <file>');
  if (!values.adapter) fail('check requires --adapter "<command>"');

  const result = await checkContract({
    contractPath: values.contract,
    adapterCommand: values.adapter,
    benign: values.benign ?? [],
    ...(values.timeout ? { timeoutMs: Number(values.timeout) } : {}),
  });
  printSummary(result);
  if (values['report-dir']) {
    writeReports(values['report-dir'], result);
    process.stdout.write(`  report written to ${values['report-dir']}/report.{json,md,html}\n\n`);
  }
  return result.summary.breaking + result.summary.failed > 0 ? 1 : 0;
}

async function cmdIssues(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: { report: { type: 'string' }, out: { type: 'string' } },
    allowPositionals: false,
  });
  if (!values.report) fail('issues requires --report <report.json>');
  const result = JSON.parse(readFileSync(values.report, 'utf8')) as CheckResult;
  const written = writeIssueFiles(values.out ?? '.doppel/issues', result);
  process.stdout.write(
    written.length
      ? `wrote ${written.length} issue file(s):\n${written.map((p) => `  ${p}`).join('\n')}\n`
      : 'no breaking divergences — nothing to file\n',
  );
  return 0;
}

function cmdHash(args: string[]): number {
  const { values } = parseArgs({
    args,
    options: { contract: { type: 'string' } },
    allowPositionals: false,
  });
  if (!values.contract) fail('hash requires --contract <file>');
  const contract = readContract(values.contract);
  const problem = verifyContract(contract);
  if (problem) {
    process.stderr.write(`INTEGRITY FAILURE: ${problem}\n`);
    return 1;
  }
  process.stdout.write(`${contract.header.body_hash}  ${values.contract}\n`);
  return 0;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const splitAt = argv.indexOf('--');
  const own = splitAt === -1 ? argv : argv.slice(0, splitAt);
  const childArgs = splitAt === -1 ? [] : argv.slice(splitAt + 1);
  const [command, ...rest] = own;

  switch (command) {
    case 'record':
      process.exit(await cmdRecord(rest, childArgs));
      break;
    case 'check':
    case 'diff':
      process.exit(await cmdCheck(rest));
      break;
    case 'issues':
      process.exit(await cmdIssues(rest));
      break;
    case 'hash':
      process.exit(cmdHash(rest));
      break;
    case 'help':
    case '--help':
    case undefined:
      process.stdout.write(HELP);
      process.exit(command === undefined ? 2 : 0);
      break;
    default:
      fail(`unknown command "${command}" — try doppel help`);
  }
}

await main();
