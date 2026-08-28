import { describe, expect, it } from 'vitest';
// @ts-expect-error Node-only deployment module.
import { assertNoRetiredPublicReferences, shouldPublishPublicAsset } from '../../../../deploy/pocketbuddy/public-assets.mjs';

describe('Pocket Buddy server public assets', () => {
  it.each(['mediapipe', 'mediapipe/wasm/old.wasm', 'signbridge', 'signbridge/models/signformer.onnx', 'signbridge\\app.js'])('excludes only retired standalone runtime copies: %s', (path) => {
    expect(shouldPublishPublicAsset(path)).toBe(false);
  });

  it.each(['', 'sw.js', 'mediapipe-pose/new.js', 'assets/ocr/model.tar', 'assets/shengsheng-species/bird.webp', 'assets/exhibit-2_5d/view.webp', 'assets/mediapipe-motion/skill.json', 'data-packs/books/bundle.json'])('preserves current and uncertain resources: %s', (path) => {
    expect(shouldPublishPublicAsset(path)).toBe(true);
  });

  it('fails the build if a current page starts using an excluded runtime', () => {
    expect(() => assertNoRetiredPublicReferences('src="/signbridge/app.js"', 'index.html')).toThrow('still references');
    expect(() => assertNoRetiredPublicReferences('fetch("/mediapipe/wasm/model.wasm")', 'entry.js')).toThrow('still references');
    expect(() => assertNoRetiredPublicReferences('"/assets/mediapipe-motion/skill.json"', 'entry.js')).not.toThrow();
  });
});
