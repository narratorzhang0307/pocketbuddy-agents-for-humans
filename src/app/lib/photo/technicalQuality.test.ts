import { describe, expect, it } from 'vitest';
import { classify, technicalQualityOf, technicalReasonsOf, valueByType } from './reasoning';
import type { PhotoFeatures } from './types';

const features: PhotoFeatures = {
  dHash: '0000000000000000', w: 100, h: 100, capDate: null, hasCameraFields: false, hasGPS: false,
  softwareIsScreenshot: false, suspectExif: false, sharpness: 0.9, exposure: 0.85, colorful: 0.65,
  contrast: 0.8, mean: 128, aspectScreenHit: false, isUtilityProb: 0.9,
};

describe('technical photo quality', () => {
  it('stays objective even when a photo is routed as a document', () => {
    expect(valueByType(features, 'document')).toBe(45);
    expect(technicalQualityOf(features)).toBeGreaterThan(70);
  });

  it('explains overexposure and underexposure separately', () => {
    expect(technicalReasonsOf({ ...features, mean: 28, exposure: 0.25 })).toContain('欠曝风险（平均亮度 28/255）');
    expect(technicalReasonsOf({ ...features, mean: 228, exposure: 0.25 })).toContain('过曝风险（平均亮度 228/255）');
  });

  it('surfaces low contrast as a technical concern instead of an aesthetic verdict', () => {
    expect(technicalReasonsOf({ ...features, contrast: 0.12 })).toContain('低对比风险（对比度 12/100）');
  });

  it('keeps trustworthy GPS as a real-photo prior after camera metadata is stripped', () => {
    expect(classify({
      ...features, hasGPS: true, lat: 30.2741, lng: 120.1551,
      isUtilityProb: 0.1, colorful: 0.12, sharpness: 0.5,
    })).toMatchObject({ photoType: 'place' });
  });

  it('does not let GPS bypass the document gate', () => {
    expect(classify({ ...features, hasGPS: true, lat: 30.2741, lng: 120.1551 }).photoType).not.toBe('place');
  });

  it('keeps a low-contrast photographed receipt in the document route', () => {
    expect(classify({
      ...features, hasCameraFields: true, colorful: 0.15, contrast: 0.2,
      isUtilityProb: 0.9,
    })).toMatchObject({ photoType: 'document' });
  });
});
