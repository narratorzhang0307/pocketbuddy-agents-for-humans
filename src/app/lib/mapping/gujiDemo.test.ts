import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { validateDataPackDocument } from '../dataPack';
import type { MappingPackRecord } from '../dataPack/types';
import { GUJI_MAPPING_DEMO_KEY, GUJI_MAPPING_DEMO_PREVIEWS } from './gujiDemo';

describe('古籍 Mapping 四册实例', () => {
  it('通过 pocket.mapping/v1 严格协议并保留可核验来源', async () => {
    const raw = await readFile('public/data-packs/guji-mapping-demo/1.0.0/bundle.json', 'utf8');
    const validated = validateDataPackDocument(JSON.parse(raw), 'mapping');
    const records = validated.inlineRecords as MappingPackRecord[];
    expect(`${validated.manifest.identity.id}@${validated.manifest.identity.version}`).toBe(GUJI_MAPPING_DEMO_KEY);
    expect(validated.manifest.privacy).toBe('public');
    expect(records).toHaveLength(4);
    expect(records.map((record) => record.title)).toEqual(GUJI_MAPPING_DEMO_PREVIEWS.map((item) => item.title));
    expect(records.flatMap((record) => record.locations)).toHaveLength(68);
    for (const record of records) {
      expect(record.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(record.locations.every((location) => location.confirmed && location.sourceRef && location.quote)).toBe(true);
    }
  });
});
