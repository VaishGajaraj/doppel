import { serveAdapter } from '../../../src/replay/serve.ts';
import * as port from './statlib.js';

serveAdapter({
  name: 'statlib-js-port',
  language: 'javascript',
  resolve(boundary) {
    const name = boundary.split('#')[1];
    return port[name];
  },
});
