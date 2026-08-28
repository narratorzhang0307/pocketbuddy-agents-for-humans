import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];
const script = path.resolve('scripts/release/rewrite-static-asset-urls.mjs');
const base = 'https://example.oss-cn-hangzhou.aliyuncs.com/pocket-earth/releases/test-v1';

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('rewrite-static-asset-urls', () => {
  it('moves literal and runtime-composed art paths to OSS without moving local compute assets', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'pocket-art-rewrite-'));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, 'assets'), { recursive: true });
    await writeFile(path.join(root, 'assets', 'app.js'), [
      'const evidence = "/assets/skill-evidence/result.png";',
      'const dynamicBuddy = `/assets/pocket-buddy/alien/${id}.png`;',
      'const mixedArt = "/assets/mixed/poster.webp?rev=2";',
      'const pdf = "/assets/mapping-demo/example.pdf";',
      'const worker = "/assets/ocr/worker-entry.mjs";',
      'const wasm = "/assets/ocr/ppocr.wasm";',
      'const json = "/assets/mixed/catalog.json";',
      `const alreadyRemote = "${base}/assets/pocket-plants/plant.png";`,
    ].join('\n'));

    await execFileAsync(process.execPath, [script, '--root', root, '--base', base]);

    const output = await readFile(path.join(root, 'assets', 'app.js'), 'utf8');
    expect(output).toContain(`${base}/assets/skill-evidence/result.png`);
    expect(output).toContain(`${base}/assets/pocket-buddy/alien/${'${id}'}.png`);
    expect(output).toContain(`${base}/assets/mixed/poster.webp?rev=2`);
    expect(output).toContain('"/assets/mapping-demo/example.pdf"');
    expect(output).toContain('"/assets/ocr/worker-entry.mjs"');
    expect(output).toContain('"/assets/ocr/ppocr.wasm"');
    expect(output).toContain('"/assets/mixed/catalog.json"');
    expect(output.match(new RegExp(`${base}/assets/pocket-plants/plant\\.png`, 'g'))).toHaveLength(1);
  });
});
