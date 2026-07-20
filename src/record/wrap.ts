import { AsyncLocalStorage } from 'node:async_hooks';
import { channels, type StartMessage } from './session.ts';

const context = new AsyncLocalStorage<{ seq: number }>();

function isThenable(v: unknown): v is PromiseLike<unknown> {
  return (
    v !== null &&
    (typeof v === 'object' || typeof v === 'function') &&
    typeof (v as { then?: unknown }).then === 'function'
  );
}

/**
 * Innermost wrap: a Proxy over the boundary function that publishes
 * start/end/error/asyncSettle events. When no session is subscribed the
 * only overhead is one boolean check. Constructor calls pass through
 * unrecorded in v0.
 */
export function wrapFunction<F extends Function>(fn: F, boundary: string): F {
  return new Proxy(fn, {
    apply(target, thisArg, args: unknown[]) {
      if (!channels.start.hasSubscribers) {
        return Reflect.apply(target as unknown as (...a: unknown[]) => unknown, thisArg, args);
      }
      const msg: StartMessage = {
        boundary,
        args,
        parent: context.getStore()?.seq,
      };
      channels.start.publish(msg);
      const seq = msg.seq!;
      let result: unknown;
      try {
        result = context.run({ seq }, () =>
          Reflect.apply(target as unknown as (...a: unknown[]) => unknown, thisArg, args),
        );
      } catch (error) {
        channels.error.publish({ seq, error });
        throw error;
      }
      if (isThenable(result)) {
        return (result as Promise<unknown>).then(
          (value) => {
            channels.asyncSettle.publish({ seq, kind: 'return', value });
            return value;
          },
          (error) => {
            channels.asyncSettle.publish({ seq, kind: 'throw', error });
            throw error;
          },
        );
      }
      channels.end.publish({ seq, value: result });
      return result;
    },
  }) as F;
}

export interface InstrumentOptions {
  /** Module label used in boundary names, e.g. "statlib" -> "statlib#mean". */
  module: string;
  /** Restrict to these export names. Default: every function-valued export. */
  include?: string[];
}

/**
 * Wrap every function-valued export of a module namespace (or any plain
 * object of functions). Returns a new object; the original is untouched.
 */
export function instrument<T extends object>(mod: T, opts: InstrumentOptions): T {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(mod)) {
    const value = (mod as Record<string, unknown>)[key];
    const wanted = !opts.include || opts.include.includes(key);
    out[key] =
      wanted && typeof value === 'function'
        ? wrapFunction(value, `${opts.module}#${key}`)
        : value;
  }
  return out as T;
}

/** Mutate a module's exports in place (used by the register hook, where the loader owns the namespace). */
export function instrumentInPlace(
  exports: Record<string, unknown>,
  opts: InstrumentOptions,
): void {
  for (const key of Object.keys(exports)) {
    const value = exports[key];
    const wanted = !opts.include || opts.include.includes(key);
    if (wanted && typeof value === 'function') {
      try {
        exports[key] = wrapFunction(value as Function, `${opts.module}#${key}`);
      } catch {
        // Non-writable export: leave it unwrapped rather than crash the host.
      }
    }
  }
}
