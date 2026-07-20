import { serveAdapter } from '../../src/replay/serve.ts';
import * as reference from '../../examples/statlib/reference/statlib.ts';

serveAdapter({
  name: 'statlib-reference',
  language: 'typescript',
  resolve(boundary) {
    const name = boundary.split('#')[1];
    return reference[name];
  },
});
