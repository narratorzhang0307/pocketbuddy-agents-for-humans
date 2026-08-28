import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateDataPackDocument } from '../../../vendor/legacy-city/src/app/lib/dataPack/protocol';

describe('restored city map bundled data', () => {
  for (const domain of ['books', 'movies', 'music'] as const) {
    it(`accepts the host project's bundled ${domain} data without a legacy API`, () => {
      const file = new URL(`../../../public/data-packs/pocket-earth-${domain}/1.0.0/bundle.json`, import.meta.url);
      const bundle = JSON.parse(readFileSync(file, 'utf8'));
      const document = validateDataPackDocument(bundle, domain);
      expect(document.domain).toBe(domain);
      expect(document.inlineRecords).toHaveLength(bundle.schema.record_count);
    });
  }
});
