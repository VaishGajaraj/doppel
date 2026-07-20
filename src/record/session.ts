import { channel, type Channel } from 'node:diagnostics_channel';
import type {
  Contract,
  ErrorShape,
  Interaction,
  RedactionRule,
} from '../contract/types.ts';
import { buildHeader } from '../contract/io.ts';
import { snapshot, snapshotArgs } from '../capture/snapshot.ts';

/**
 * Boundary events flow over diagnostics_channel (the TracingChannel event
 * shape: start / end / error / asyncSettle). publish() collapses to a boolean
 * check when nothing subscribes, so instrumented code costs ~nothing outside
 * a recording session.
 */
export const channels: Record<'start' | 'end' | 'error' | 'asyncSettle', Channel> = {
  start: channel('doppel.boundary.start'),
  end: channel('doppel.boundary.end'),
  error: channel('doppel.boundary.error'),
  asyncSettle: channel('doppel.boundary.asyncSettle'),
};

export interface StartMessage {
  boundary: string;
  args: unknown[];
  parent: number | undefined;
  /** Assigned by the session during publish. */
  seq?: number;
}

export interface EndMessage {
  seq: number;
  value: unknown;
}

export interface ErrorMessage {
  seq: number;
  error: unknown;
}

export interface AsyncSettleMessage {
  seq: number;
  kind: 'return' | 'throw';
  value?: unknown;
  error?: unknown;
}

export function toErrorShape(error: unknown): ErrorShape {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return {
      name: error.name,
      message: error.message,
      ...(code !== undefined ? { code: String(code) } : {}),
    };
  }
  return { name: 'NonError', message: String(error) };
}

export interface SessionOptions {
  library: string;
  /** Language of the reference implementation (header metadata). */
  language?: string;
  redactions?: RedactionRule[];
}

export class RecordSession {
  private clock = 0;
  private open = new Map<number, Interaction>();
  private done: Interaction[] = [];
  private active = false;
  readonly opts: SessionOptions;

  constructor(opts: SessionOptions) {
    this.opts = opts;
  }

  private redactions(): RedactionRule[] {
    return this.opts.redactions ?? [];
  }

  private onStart = (raw: unknown) => {
    const msg = raw as StartMessage;
    const seq = this.clock++;
    msg.seq = seq;
    const interaction: Interaction = {
      seq,
      boundary: msg.boundary,
      args: snapshotArgs(msg.args, {
        boundary: msg.boundary,
        redactions: this.redactions(),
      }),
      outcome: { kind: 'throw', error: { name: 'Unsettled', message: 'never settled' } },
      timing: 'sync',
      ...(msg.parent !== undefined ? { parent: msg.parent } : {}),
    };
    this.open.set(seq, interaction);
  };

  private settle(seq: number, patch: Partial<Interaction>): void {
    const interaction = this.open.get(seq);
    if (!interaction) return;
    this.open.delete(seq);
    this.done.push({ ...interaction, ...patch });
  }

  private captureReturn(boundary: string, value: unknown) {
    return {
      kind: 'return' as const,
      value: snapshot(value, {
        boundary,
        root: 'return',
        redactions: this.redactions(),
      }),
    };
  }

  private onEnd = (raw: unknown) => {
    const msg = raw as EndMessage;
    const interaction = this.open.get(msg.seq);
    if (!interaction) return;
    this.settle(msg.seq, {
      timing: 'sync',
      outcome: this.captureReturn(interaction.boundary, msg.value),
    });
  };

  private onError = (raw: unknown) => {
    const msg = raw as ErrorMessage;
    this.settle(msg.seq, {
      timing: 'sync',
      outcome: { kind: 'throw', error: toErrorShape(msg.error) },
    });
  };

  private onAsyncSettle = (raw: unknown) => {
    const msg = raw as AsyncSettleMessage;
    const interaction = this.open.get(msg.seq);
    if (!interaction) return;
    const settleSeq = this.clock++;
    this.settle(msg.seq, {
      timing: 'async',
      settle_seq: settleSeq,
      outcome:
        msg.kind === 'return'
          ? this.captureReturn(interaction.boundary, msg.value)
          : { kind: 'throw', error: toErrorShape(msg.error) },
    });
  };

  start(): void {
    if (this.active) return;
    channels.start.subscribe(this.onStart);
    channels.end.subscribe(this.onEnd);
    channels.error.subscribe(this.onError);
    channels.asyncSettle.subscribe(this.onAsyncSettle);
    this.active = true;
  }

  stop(): void {
    if (!this.active) return;
    channels.start.unsubscribe(this.onStart);
    channels.end.unsubscribe(this.onEnd);
    channels.error.unsubscribe(this.onError);
    channels.asyncSettle.unsubscribe(this.onAsyncSettle);
    this.active = false;
  }

  finalize(): Contract {
    this.stop();
    const interactions = [...this.done].sort((a, b) => a.seq - b.seq);
    const header = buildHeader({
      library: this.opts.library,
      ...(this.opts.language ? { language: this.opts.language } : {}),
      redactions: this.redactions(),
      interactions,
    });
    return { header, interactions };
  }
}
