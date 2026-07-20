import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import process from 'node:process';
import type { RedactionRule } from '../contract/types.ts';
import { writeContract } from '../contract/io.ts';
import { RecordSession } from './session.ts';
import { instrumentInPlace } from './wrap.ts';

/**
 * Auto-instrumentation entry point. Load with:
 *
 *   DOPPEL_CONFIG=doppel.config.json node --import doppel/register your-tests.js
 *
 * Hooks the module export boundary for every configured specifier
 * (import-in-the-middle for ESM, require-in-the-middle for CJS), records all
 * boundary crossings, and writes the contract file on process exit.
 */

export interface RecordTarget {
  specifier: string;
  /** Label used in boundary names; defaults to the specifier. */
  label?: string;
  exports?: string[];
}

export interface RecordConfig {
  library: string;
  out: string;
  /** Language of the reference implementation (header metadata). */
  language?: string;
  record: { include: Array<string | RecordTarget> };
  redactions?: RedactionRule[];
}

function loadConfig(): RecordConfig | null {
  const inline = process.env.DOPPEL_CONFIG_JSON;
  if (inline) return JSON.parse(inline) as RecordConfig;
  const path = process.env.DOPPEL_CONFIG;
  if (path) return JSON.parse(readFileSync(path, 'utf8')) as RecordConfig;
  return null;
}

function normalizeTargets(config: RecordConfig): RecordTarget[] {
  return config.record.include.map((entry) =>
    typeof entry === 'string' ? { specifier: entry } : entry,
  );
}

function matchTarget(targets: RecordTarget[], name: string): RecordTarget | null {
  for (const t of targets) {
    if (
      name === t.specifier ||
      name.endsWith('/' + t.specifier) ||
      name.endsWith(t.specifier) ||
      name.includes(`/node_modules/${t.specifier}/`)
    ) {
      return t;
    }
  }
  return null;
}

const config = loadConfig();

if (config) {
  const targets = normalizeTargets(config);
  const session = new RecordSession({
    library: config.library,
    ...(config.language ? { language: config.language } : {}),
    ...(config.redactions ? { redactions: config.redactions } : {}),
  });
  session.start();

  const onModule = (exports: unknown, name: string): unknown => {
    const target = matchTarget(targets, name);
    if (target && exports && typeof exports === 'object') {
      instrumentInPlace(exports as Record<string, unknown>, {
        module: target.label ?? target.specifier,
        ...(target.exports ? { include: target.exports } : {}),
      });
    }
    return exports;
  };

  // Hook every module and filter in the callback: specifier matching then
  // behaves identically for bare package names, relative files, and file URLs.
  try {
    register('import-in-the-middle/hook.mjs', import.meta.url);
    const { Hook } = await import('import-in-the-middle');
    new Hook((exports: unknown, name: string) => void onModule(exports, name));
  } catch (err) {
    process.stderr.write(`doppel: ESM hook unavailable (${(err as Error).message}); CJS only\n`);
  }

  try {
    const ritm = await import('require-in-the-middle');
    new ritm.Hook((exports, name) => onModule(exports, name) as typeof exports);
  } catch {
    // require-in-the-middle missing is fine for pure-ESM hosts.
  }

  process.on('exit', () => {
    const contract = session.finalize();
    writeContract(config.out, contract);
    process.stderr.write(
      `doppel: recorded ${contract.header.interaction_count} interactions -> ${config.out}\n`,
    );
  });
} else {
  process.stderr.write('doppel: no DOPPEL_CONFIG/DOPPEL_CONFIG_JSON set; recorder idle\n');
}
