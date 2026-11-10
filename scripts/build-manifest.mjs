import { readdirSync, statSync, writeFileSync, readFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';

const roots = ['src', 'styles', 'public'];
const files = ['index.html', 'manifest.webmanifest'];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(relative('.', p).split('\\').join('/'));
  }
}

for (const r of roots) walk(r);
files.sort();

const hash = createHash('sha256');
for (const f of [...files, 'sw.js']) hash.update(f).update(readFileSync(f));
const version = hash.digest('hex').slice(0, 16);
const manifest = `${JSON.stringify({ version, files: ['./', ...files] }, null, 2)}\n`;
writeFileSync('asset-manifest.json', manifest);

rmSync('dist', { recursive: true, force: true });
for (const f of [...files, 'sw.js', 'asset-manifest.json']) {
  mkdirSync(dirname(join('dist', f)), { recursive: true });
  copyFileSync(f, join('dist', f));
}
console.log(`${files.length} files, version ${version}, copied to dist`);
