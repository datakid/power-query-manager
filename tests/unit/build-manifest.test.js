import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, cpSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { root } from './helpers.js';

function copyProject() {
  const dir = mkdtempSync(join(tmpdir(), 'quoin-build-'));
  for (const name of ['src', 'styles', 'public', 'scripts', 'index.html', 'manifest.webmanifest', 'sw.js']) cpSync(join(root, name), join(dir, name), { recursive: true });
  return dir;
}

const build = (dir) => {
  execFileSync(process.execPath, ['scripts/build-manifest.mjs'], { cwd: dir, stdio: 'pipe' });
  return JSON.parse(readFileSync(join(dir, 'asset-manifest.json'), 'utf8'));
};

test('T-B-20: editing only sw.js changes the manifest version', () => {
  const dir = copyProject();
  const before = build(dir);
  appendFileSync(join(dir, 'sw.js'), '\n');
  const after = build(dir);
  assert.notEqual(before.version, after.version);
  assert.deepEqual(before.files, after.files);
});

test('T-B-20: the service worker is hashed but never pre-cached', () => {
  const dir = copyProject();
  const m = build(dir);
  assert.equal(m.files.includes('sw.js'), false);
  assert.equal(m.files.includes('asset-manifest.json'), false);
});

test('T-B-20: removing a shipped file changes the version', () => {
  const dir = copyProject();
  const before = build(dir);
  writeFileSync(join(dir, 'src', 'extra.js'), 'export const x = 1;\n');
  const added = build(dir);
  assert.notEqual(before.version, added.version);
  execFileSync(process.execPath, ['-e', "require('node:fs').rmSync('src/extra.js')"], { cwd: dir });
  assert.equal(build(dir).version, before.version);
});
