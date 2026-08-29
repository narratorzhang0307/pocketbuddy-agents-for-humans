import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { hashReleaseFiles } from './release-files.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'pb-release-files-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('covers the actual Web bundle and Expo assets, not only server source', t => {
  const root = fixture(t);
  mkdirSync(path.join(root, 'dist/lianlema/assets/node_modules'), { recursive: true });
  writeFileSync(path.join(root, 'dist/index.html'), 'current app');
  writeFileSync(path.join(root, 'dist/lianlema/assets/node_modules/icon.png'), 'icon');
  writeFileSync(path.join(root, 'server.mjs'), 'server');
  const before = hashReleaseFiles(root);
  assert.equal(Object.keys(before).length, 3);
  assert.ok(before['dist/lianlema/assets/node_modules/icon.png']);
  writeFileSync(path.join(root, 'dist/index.html'), 'stale app');
  assert.notEqual(hashReleaseFiles(root)['dist/index.html'], before['dist/index.html']);
});

test('rejects links back to local machine files', t => {
  const root = fixture(t);
  writeFileSync(path.join(root, 'source.txt'), 'local');
  symlinkSync(path.join(root, 'source.txt'), path.join(root, 'linked.txt'));
  assert.throws(() => hashReleaseFiles(root), /symlink/);
});

test('rejects accidentally included private environment files', t => {
  const root = fixture(t);
  writeFileSync(path.join(root, '.env'), 'EXAMPLE=private');
  assert.throws(() => hashReleaseFiles(root), /private dotfile/);
});
