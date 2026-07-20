import * as statlib from './reference/statlib.js';
import { runCorpus } from './corpus.js';

/**
 * A plain workload with no doppel imports — this is what "your existing test
 * suite" looks like. Run it under the recorder without touching it:
 *
 *   doppel record --config examples/statlib/doppel.config.json \
 *     -- node examples/statlib/workload.js
 *
 * The result is byte-identical to the contract record.js produces via the
 * instrument() API (same corpus, same boundary, same hash).
 */
await runCorpus(statlib);
