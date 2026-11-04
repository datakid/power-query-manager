import { inflateSync } from 'node:zlib';

export function decodePng(bytes) {
  const buf = Buffer.from(bytes);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let pos = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let type = 0;
  const parts = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const name = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (name === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
    } else if (name === 'IDAT') parts.push(data);
    pos += 12 + len;
  }
  if (depth !== 8 || (type !== 2 && type !== 6)) throw new Error(`unsupported png depth ${depth} type ${type}`);
  const bpp = type === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = (v + add) & 255;
    }
  }
  const pixel = (x, y) => {
    const i = y * stride + x * bpp;
    return { r: out[i], g: out[i + 1], b: out[i + 2], a: bpp === 4 ? out[i + 3] : 255 };
  };
  return { width, height, pixel };
}
