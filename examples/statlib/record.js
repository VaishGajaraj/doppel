import { fileURLToPath } from 'node:url';
import { RecordSession, instrument, writeContract } from '../../src/index.ts';
import * as reference from './reference/statlib.js';
import { runCorpus } from './corpus.js';

const session = new RecordSession({ library: 'statlib' });
session.start();
await runCorpus(instrument(reference, { module: 'statlib' }));
session.stop();

const contract = session.finalize();
const out = fileURLToPath(new URL('./contracts/statlib.dopl.jsonl', import.meta.url));
writeContract(out, contract);
console.log(
  `recorded ${contract.header.interaction_count} interactions -> ${out}\n` +
    `body hash ${contract.header.body_hash}`,
);
