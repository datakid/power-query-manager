import { readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
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
for (const f of files) hash.update(f).update(readFileSync(f));
const version = hash.digest('hex').slice(0, 16);
writeFileSync('asset-manifest.json', `${JSON.stringify({ version, files: ['./', ...files] }, null, 2)}\n`);
console.log(`${files.length} files, version ${version}`);
