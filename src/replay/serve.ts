import { createInterface } from 'node:readline';
import process from 'node:process';
import type { ContractHeader } from '../contract/types.ts';
import { materialize, snapshot } from '../capture/snapshot.ts';
import { toErrorShape } from '../record/session.ts';
import type { AdapterFrame, HostFrame } from './protocol.ts';

export interface AdapterImpl {
  name?: string;
  language?: string;
  /** Map a boundary name like "statlib#mean" to the port's implementation. */
  resolve(boundary: string): ((...args: unknown[]) => unknown) | undefined;
}

/**
 * Runs a JavaScript/TypeScript port as a doppel adapter over stdio. Results
 * are re-captured with the same redaction rules the contract was recorded
 * with, so both sides normalize non-determinism identically.
 */
export function serveAdapter(impl: AdapterImpl): void {
  let header: ContractHeader | null = null;
  const lines = createInterface({ input: process.stdin });

  const reply = (frame: AdapterFrame) => {
    process.stdout.write(JSON.stringify(frame) + '\n');
  };

  lines.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    void (async () => {
      let frame: HostFrame;
      try {
        frame = JSON.parse(trimmed) as HostFrame;
      } catch {
        reply({ op: 'error', message: `invalid frame: ${trimmed.slice(0, 200)}` });
        return;
      }
      if (frame.op === 'init') {
        header = frame.header;
        reply({ op: 'ready', adapter: impl.name ?? 'js-adapter', language: impl.language ?? 'javascript' });
        return;
      }
      if (frame.op === 'end') {
        process.exit(0);
      }
      if (frame.op === 'invoke') {
        const fn = impl.resolve(frame.boundary);
        if (!fn) {
          reply({ op: 'error', seq: frame.seq, message: `no implementation for boundary ${frame.boundary}` });
          return;
        }
        const args = materialize(frame.args) as unknown[];
        try {
          const value = await fn(...args);
          reply({
            op: 'result',
            seq: frame.seq,
            outcome: {
              kind: 'return',
              value: snapshot(value, {
                boundary: frame.boundary,
                root: 'return',
                redactions: header?.redactions ?? [],
              }),
            },
          });
        } catch (error) {
          reply({ op: 'result', seq: frame.seq, outcome: { kind: 'throw', error: toErrorShape(error) } });
        }
      }
    })();
  });
}
