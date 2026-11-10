import { QuoinError } from '../core/errors.js';
import { equalBytes } from '../core/bytes.js';

export const hasFilePicker = () => typeof window.showSaveFilePicker === 'function';

export async function writeThroughPicker({ bytes, name, mime, extension, description, sourceHandle, confirmReplace }) {
  for (;;) {
    let handle;
    try {
      handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description, accept: { [mime]: [`.${extension}`] } }] });
    } catch (e) {
      if (e && e.name === 'AbortError') return null;
      throw e;
    }
    if (sourceHandle && typeof handle.isSameEntry === 'function' && (await handle.isSameEntry(sourceHandle))) {
      if (!(await confirmReplace(handle.name || name))) continue;
    }
    const writable = await handle.createWritable();
    await writable.write(bytes);
    await writable.close();
    const file = await handle.getFile();
    const back = new Uint8Array(await file.arrayBuffer());
    if (!equalBytes(back, bytes)) throw new QuoinError('write.verify', `${back.length} of ${bytes.length} bytes read back`);
    return { name: handle.name || name };
  }
}
