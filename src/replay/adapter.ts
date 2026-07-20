import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import type { ContractHeader, Interaction, Outcome } from '../contract/types.ts';
import { FORMAT_VERSION } from '../contract/types.ts';
import type { AdapterFrame, HostFrame } from './protocol.ts';

export class AdapterError extends Error {}

/**
 * Client side of the adapter protocol: spawns the port's adapter command and
 * replays recorded interactions against it, one at a time.
 */
export class AdapterClient {
  private child: ChildProcess;
  private lines: Interface;
  private queue: Array<{ resolve: (f: AdapterFrame) => void; reject: (e: Error) => void }> = [];
  private exited: string | null = null;
  readonly timeoutMs: number;
  adapterName = '(unknown)';

  constructor(command: string, opts: { timeoutMs?: number; env?: Record<string, string> } = {}) {
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.child = spawn(command, {
      shell: true,
      stdio: ['pipe', 'pipe', 'inherit'],
      env: opts.env ? { ...process.env, ...opts.env } : process.env,
    });
    this.lines = createInterface({ input: this.child.stdout! });
    this.lines.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const waiter = this.queue.shift();
      if (!waiter) return;
      try {
        waiter.resolve(JSON.parse(trimmed) as AdapterFrame);
      } catch (err) {
        waiter.reject(new AdapterError(`adapter sent invalid JSON: ${trimmed.slice(0, 200)}`));
      }
    });
    this.child.on('exit', (code, signal) => {
      this.exited = `adapter exited (code ${code}, signal ${signal})`;
      for (const waiter of this.queue.splice(0)) {
        waiter.reject(new AdapterError(this.exited));
      }
    });
    this.child.on('error', (err) => {
      this.exited = `adapter failed to start: ${err.message}`;
      for (const waiter of this.queue.splice(0)) {
        waiter.reject(new AdapterError(this.exited));
      }
    });
  }

  private send(frame: HostFrame): void {
    if (this.exited) throw new AdapterError(this.exited);
    this.child.stdin!.write(JSON.stringify(frame) + '\n');
  }

  private nextFrame(): Promise<AdapterFrame> {
    if (this.exited) return Promise.reject(new AdapterError(this.exited));
    return new Promise<AdapterFrame>((resolve, reject) => {
      const waiter = { resolve, reject };
      this.queue.push(waiter);
      const timer = setTimeout(() => {
        const i = this.queue.indexOf(waiter);
        if (i >= 0) this.queue.splice(i, 1);
        // A late reply after a timeout would pair with the NEXT request and
        // silently misalign every following frame — poison the client instead.
        this.exited = `adapter timed out after ${this.timeoutMs}ms`;
        this.child.kill();
        reject(new AdapterError(this.exited));
      }, this.timeoutMs);
      const settle =
        <T,>(fn: (v: T) => void) =>
        (v: T) => {
          clearTimeout(timer);
          fn(v);
        };
      waiter.resolve = settle(resolve);
      waiter.reject = settle(reject);
    });
  }

  async init(header: ContractHeader): Promise<void> {
    this.send({ op: 'init', doppel: FORMAT_VERSION, header });
    const frame = await this.nextFrame();
    if (frame.op !== 'ready') {
      throw new AdapterError(`expected ready frame, got: ${JSON.stringify(frame).slice(0, 200)}`);
    }
    this.adapterName = frame.adapter;
  }

  async invoke(interaction: Interaction): Promise<Outcome> {
    this.send({
      op: 'invoke',
      seq: interaction.seq,
      boundary: interaction.boundary,
      args: interaction.args,
    });
    const frame = await this.nextFrame();
    if (frame.op === 'error') {
      throw new AdapterError(frame.message);
    }
    if (frame.op !== 'result' || frame.seq !== interaction.seq) {
      throw new AdapterError(`out-of-order adapter frame: ${JSON.stringify(frame).slice(0, 200)}`);
    }
    return frame.outcome;
  }

  end(): void {
    try {
      this.send({ op: 'end' });
    } catch {
      // Adapter already gone; nothing to flush.
    }
    this.lines.close();
    this.child.stdin?.end();
  }
}
