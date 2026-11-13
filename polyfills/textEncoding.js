import {
  TextDecoder as PolyTextDecoder,
  TextEncoder as PolyTextEncoder,
} from '@exodus/bytes/encoding.js';

const g = globalThis;
if (typeof g.TextEncoder === 'undefined') g.TextEncoder = PolyTextEncoder;
if (typeof g.TextDecoder === 'undefined') g.TextDecoder = PolyTextDecoder;
