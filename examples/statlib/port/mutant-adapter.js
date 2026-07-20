import { serveAdapter } from '../../../src/replay/serve.ts';
import * as reference from '../reference/statlib.js';
import { mutants } from './mutants.js';

const name = process.env.DOPPEL_MUTANT;
const mutant = mutants[name];
if (!mutant) {
  process.stderr.write(`mutant-adapter: unknown mutant "${name}"\n`);
  process.exit(2);
}

const impl = { ...reference, ...mutant.overrides };

serveAdapter({
  name: `statlib-mutant:${name}`,
  language: 'javascript',
  resolve(boundary) {
    return impl[boundary.split('#')[1]];
  },
});
