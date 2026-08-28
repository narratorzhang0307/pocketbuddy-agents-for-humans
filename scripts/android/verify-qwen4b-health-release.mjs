#!/usr/bin/env node

import { createHash } from 'node:crypto';

const revision = 'b6a176e85c3dc8ddf18038154c609452afd7c7d8';
const descriptorUrl = `https://modelscope.cn/api/v1/models/MNN/Qwen3-4B-MNN/repo/files?Revision=${revision}&Recursive=true`;
const fileBaseUrl = `https://modelscope.cn/models/MNN/Qwen3-4B-MNN/resolve/${revision}/`;
const expectedCanonicalSha256 = '5b96c5e7943c35e597529d3aa53199cba591c6931f8b1f58a44b989270d90cb9';
const expectedFiles = [
  ['config.json', 403, 'd74912484c7f0527494c9184d8d6806554be501e15ca559a1610370b80839ef7'],
  ['llm_config.json', 4882, '5244f177522469d06e1282f6b2215a58fd1d2153d40337df8ca50f848f6c6a6c'],
  ['tokenizer.txt', 3193569, '77009625db0b18e74315dd89557c76feaab57e1d54e3240b442649a3c16ec4fb'],
  ['llm.mnn', 592352, 'ade8ad33f1d06ce8a46b57fa85e0fc08f1d4df06e179e7f0f23e761ecfcb38a5'],
  ['llm.mnn.weight', 2709972658, '42d1bd0f4379cbee62a3fb89cb48cac36f13c96cd0d236b89202f633d23f73c3'],
];

const canonical = expectedFiles.map(([file, bytes, sha256]) => `${file}\t${bytes}\t${sha256}\n`).join('');
const canonicalSha256 = createHash('sha256').update(canonical).digest('hex');
if (canonicalSha256 !== expectedCanonicalSha256) throw new Error(`local canonical descriptor mismatch: ${canonicalSha256}`);

const descriptorResponse = await fetch(descriptorUrl, { redirect: 'follow' });
if (!descriptorResponse.ok) throw new Error(`ModelScope descriptor HTTP ${descriptorResponse.status}`);
const descriptor = await descriptorResponse.json();
const descriptorFiles = descriptor?.Data?.Files;
if (descriptor?.Code !== 200 || descriptor?.Success !== true || !Array.isArray(descriptorFiles)) {
  throw new Error('unexpected ModelScope descriptor shape');
}

for (const [file, bytes, sha256] of expectedFiles) {
  const item = descriptorFiles.find((candidate) => candidate?.Path === file);
  if (!item || item.Size !== bytes || item.Sha256 !== sha256) throw new Error(`descriptor mismatch: ${file}`);
  const response = await fetch(fileBaseUrl + encodeURIComponent(file), { method: 'HEAD', redirect: 'follow' });
  if (!response.ok) throw new Error(`model file HEAD ${response.status}: ${file}`);
  const linkedEtag = (response.headers.get('x-linked-etag') || '').replaceAll('"', '');
  if (linkedEtag && linkedEtag !== sha256) throw new Error(`remote object hash mismatch: ${file}`);
}

const totalBytes = expectedFiles.reduce((sum, [, bytes]) => sum + bytes, 0);
console.log(JSON.stringify({
  ok: true,
  model: 'MNN/Qwen3-4B-MNN',
  revision,
  runtimeFiles: expectedFiles.length,
  totalBytes,
  canonicalSha256,
  descriptorUrl,
}, null, 2));
