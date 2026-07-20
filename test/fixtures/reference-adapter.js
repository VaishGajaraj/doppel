import { serveAdapter } from '../../src/replay/serve.ts';
import * as reference from '../../examples/statlib/reference/statlib.js';

serveAdapter({
  name: 'statlib-reference',
  language: 'javascript',
  resolve(boundary) {
    const name = boundary.split('#')[1];
    return reference[name];
  },
});
