import { describe, expect, it } from 'vitest';
import type { OcrResultItem } from '@paddleocr/paddleocr-js';
import { isUsableChineseOcrResult, releaseOcrAssetUrl, sameOriginOcrAssetUrl, sameOriginOcrWorkerUrl } from './chineseOcr';

function item(text: string, score: number): OcrResultItem {
  return { text, score, poly: [[0, 0], [10, 0], [10, 10], [0, 10]] };
}

describe('progressive Chinese OCR rotations', () => {
  it('accepts a credible first heritage orientation', () => {
    expect(isUsableChineseOcrResult([item('始以十三級為準', 0.91)], 'heritage')).toBe(true);
  });

  it('tries another orientation for short or low-confidence noise', () => {
    expect(isUsableChineseOcrResult([item('古籍', 0.93)], 'heritage')).toBe(false);
    expect(isUsableChineseOcrResult([item('始以十三級為準', 0.2)], 'heritage')).toBe(false);
  });
});

describe('Chinese OCR Worker URL', () => {
  it('rewrites a CDN-emitted Worker to the app origin while preserving its hash', () => {
    expect(sameOriginOcrWorkerUrl(
      'https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/pocket-earth/releases/v38/assets/worker-entry-abc.js',
      'https://pocketearth.throughtheglass.art',
    )).toBe('https://pocketearth.throughtheglass.art/assets/worker-entry-abc.js');
  });

  it('keeps model and WASM requests on the Worker origin', () => {
    expect(sameOriginOcrAssetUrl(
      '/assets/ocr/PP-OCRv5_mobile_det_onnx_infer.tar',
      'https://pocketearth.throughtheglass.art',
    )).toBe(
      'https://pocketearth.throughtheglass.art/assets/ocr/PP-OCRv5_mobile_det_onnx_infer.tar?ocr_rev=paddleocr-js-0.4.2-host-v2-mime',
    );
    expect(sameOriginOcrAssetUrl(
      '/assets/ocr/ort/',
      'https://pocketearth.throughtheglass.art',
    )).toBe('https://pocketearth.throughtheglass.art/assets/ocr/ort/');
  });

  it('loads large model and WASM files from the immutable release CDN', () => {
    const release = 'https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/pocket-earth/releases/20260814-web-v42/';
    expect(releaseOcrAssetUrl(
      '/assets/ocr/PP-OCRv5_mobile_rec_onnx_infer.tar',
      release,
      'https://pocketearth.throughtheglass.art',
    )).toBe(`${release}assets/ocr/PP-OCRv5_mobile_rec_onnx_infer.tar`);
    expect(releaseOcrAssetUrl(
      '/assets/ocr/ort/',
      release,
      'https://pocketearth.throughtheglass.art',
    )).toBe(`${release}assets/ocr/ort/`);
  });
});
