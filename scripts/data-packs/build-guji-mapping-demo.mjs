#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const sourceRoot = process.env.POCKET_EARTH_SOURCE_ROOT || '/Users/zhangcheng/Documents/上街去';
const inputs = [
  ['城市地图skill/城市古籍2/四时幽赏录-古籍走读项目/dist/sishi-youshang-lu-preview.skill', 'sishi-youshang-lu'],
  ['城市地图skill/城市古籍2/梦粱录-古籍走读项目/dist/mengliang-lu-preview.skill', 'mengliang-lu'],
  ['城市地图skill/城市古籍2/板桥杂记-古籍走读项目/dist/banqiao-zaji-preview.skill', 'banqiao-zaji'],
  ['城市地图skill/城市古籍2/浮生六记-古籍走读项目/dist/fusheng-liuji-preview.skill', 'fusheng-liuji'],
];
const status = (value) => value === 'extant' ? 'extant' : value === 'rebuilt' ? 'rebuilt' : 'memory-only';
const confidence = (value) => value === 'high' ? 0.92 : value === 'medium' ? 0.78 : 0.62;
const safeId = (value) => value.normalize('NFKC').replace(/[^a-zA-Z0-9._:-]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'place';
const records = [];

for (const [relative, slug] of inputs) {
  const sourcePath = path.join(sourceRoot, relative);
  const bytes = await readFile(sourcePath);
  const document = JSON.parse(bytes.toString('utf8'));
  const book = document.books?.[0];
  if (!book) throw new Error(`${sourcePath} 缺少 books[0]`);
  const places = (book.places || []).filter((place) => place.mapReady === true && Number.isFinite(place.lat) && Number.isFinite(place.lng));
  if (!places.length) throw new Error(`${sourcePath} 没有可落图地点`);
  records.push({
    id: `guji:${slug}`,
    title: String(book.title || document.displayName),
    author: String(book.author || ''),
    era: String(book.era || ''),
    city: String(book.city || ''),
    sourceName: path.basename(sourcePath),
    sourceSha256: createHash('sha256').update(bytes).digest('hex'),
    summary: `${book.title}古籍走读实例。原始 .skill 标记为私人研究预览；这里只迁移原文短引、已审核现代接近点和章节索引，不把私人整理说明冒充公开文献。`,
    locations: places.map((place, index) => ({
      id: `${slug}:${safeId(String(place.canonicalPlaceId || place.id || place.name))}-${index + 1}`,
      name: String(place.name),
      status: status(place.status),
      relation: 'route',
      page: index + 1,
      quote: String(place.quote || '').trim(),
      note: `现代载体：${String(place.modernName || place.name)}。原 .skill 未保存稳定纸本页码；本字段序号仅用于 Data Pack 内定位，原文索引以 sourceRef 为准。`,
      lng: Number(place.lng),
      lat: Number(place.lat),
      confidence: confidence(place.confidence),
      confirmed: true,
      sourceRef: String(place.chapter || place.evidenceRef || '原 .skill 地点记录'),
      sourceUrls: [],
    })),
  });
}

const bundle = {
  protocol: 'pocket-data/v1',
  identity: {
    id: 'art.throughtheglass.pocketearth.guji-mapping-demo',
    name: '古籍走读四册示例库',
    version: '1.0.0',
    author: 'Pocket Earth × 上街去',
    description: '四时幽赏录、梦粱录、板桥杂记、浮生六记的可装卸古籍 Mapping 示例。',
  },
  schema: { name: 'pocket.mapping/v1', version: '1.0.0', record_count: records.length },
  compatibility: { skills: ['pocket.mapping'], runtime_min: '1.0.0' },
  privacy: 'public',
  provenance: {
    source: '由上街去的 4 个私人研究 .skill 脱敏迁移；发布包只含公共领域古籍短引、事实性地名、坐标与章节索引，私人整理说明不进入发布包',
    license: 'public-domain source quotations and factual location metadata',
    generated_at: '2026-08-12T00:00:00+08:00',
  },
  distribution: { mode: 'inline' },
  records,
};

const output = path.resolve('public/data-packs/guji-mapping-demo/1.0.0/bundle.json');
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(bundle, null, 2)}\n`);
console.log(JSON.stringify({ output, records: records.length, locations: records.reduce((sum, record) => sum + record.locations.length, 0) }));
