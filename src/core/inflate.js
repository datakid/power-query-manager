import { QuoinError } from './errors.js';

export async function inflateRaw(bytes, { maxBytes = Infinity, part = '' } = {}) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel();
        throw new QuoinError('limit.entry', 'inflated size exceeds the limit', part);
      }
      chunks.push(value);
    }
  } catch (e) {
    if (e instanceof QuoinError) throw e;
    throw new QuoinError('zip.inflate', String(e && e.message), part);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

export async function deflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}
