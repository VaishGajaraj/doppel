import { add, mul, VERSION } from './mathy.mjs';

if (add(2, 3) !== 5 || mul(4, 5) !== 20 || VERSION !== '1.0.0') {
  throw new Error('fixture module misbehaved');
}
