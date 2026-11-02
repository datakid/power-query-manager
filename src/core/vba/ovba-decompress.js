import { QuoinError } from '../errors.js';
import { u16 } from '../bytes.js';

export function bitCountFor(position) {
  let bits = 4;
  while (1 << bits < position) bits++;
  return bits;
}

export function decompress(bytes) {
  if (bytes.length === 0 || bytes[0] !== 0x01) throw new QuoinError('ovba.signature', 'container signature byte is not 0x01');
  const out = [];
  let total = 0;
  let pos = 1;
  while (pos < bytes.length) {
    if (pos + 2 > bytes.length) throw new QuoinError('ovba.chunk', 'truncated chunk header');
    const header = u16(bytes, pos);
    if (((header >> 12) & 0x7) !== 0x3) throw new QuoinError('ovba.chunk', 'invalid chunk signature');
    const size = (header & 0x0FFF) + 3;
    const compressed = (header & 0x8000) !== 0;
    const end = pos + size;
    if (end > bytes.length) throw new QuoinError('ovba.chunk', 'chunk overruns the container');
    const chunk = new Uint8Array(4096);
    let produced = 0;
    let p = pos + 2;
    if (!compressed) {
      const n = Math.min(4096, end - p);
      chunk.set(bytes.subarray(p, p + n), 0);
      produced = n;
    } else {
      while (p < end) {
        const flags = bytes[p++];
        for (let bit = 0; bit < 8 && p < end; bit++) {
          if ((flags & (1 << bit)) === 0) {
            if (produced >= 4096) throw new QuoinError('ovba.chunk', 'chunk exceeds 4096 bytes');
            chunk[produced++] = bytes[p++];
          } else {
            if (p + 2 > end) throw new QuoinError('ovba.chunk', 'truncated copy token');
            const token = u16(bytes, p);
            p += 2;
            if (produced === 0) throw new QuoinError('ovba.offset', 'copy token at the start of a chunk');
            const bits = bitCountFor(produced);
            const lengthMask = 0xFFFF >> bits;
            const length = (token & lengthMask) + 3;
            const offset = (token >> (16 - bits)) + 1;
            if (offset > produced) throw new QuoinError('ovba.offset', 'copy offset precedes the chunk');
            if (produced + length > 4096) throw new QuoinError('ovba.chunk', 'copy runs past the chunk');
            for (let k = 0; k < length; k++) {
              chunk[produced] = chunk[produced - offset];
              produced++;
            }
          }
        }
      }
    }
    out.push(chunk.subarray(0, produced));
    total += produced;
    pos = end;
  }
  const result = new Uint8Array(total);
  let o = 0;
  for (const c of out) {
    result.set(c, o);
    o += c.length;
  }
  return result;
}
