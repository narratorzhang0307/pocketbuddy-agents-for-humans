import { describe, expect, it } from 'vitest';
import {
  needsPhotoRadarAnalysis, photoReadProfile, photoResultAssetMetadataPatch, PHOTO_RADAR_ALGORITHM_VERSION,
} from './radarPipeline';
import type { PhotoLibraryAsset } from './libraryTypes';
import type { PhotoRadarAnalysis } from './radarTypes';

const asset: PhotoLibraryAsset = {
  key: 'native-library:image:1', assetId: 'image:1', source: 'native-library', access: 'full', mediaType: 'image',
  mimeType: 'image/jpeg', fileName: 'one.jpg', width: 100, height: 100, indexedAt: 1, lastSeenAt: 1, analysisState: 'analyzed',
};
const analysis = (algorithmVersion: PhotoRadarAnalysis['algorithmVersion']): PhotoRadarAnalysis => ({
  key: asset.key, assetId: asset.assetId, contentHash: '0'.repeat(16), photoType: 'life', technicalQuality: 80,
  preferenceConfidence: 0, confidence: 0.8, verdict: 'keep', pinnable: false, needPlace: true, tags: [], reasons: [],
  visionBackend: 'local-features', algorithmVersion, analyzedAt: 1,
});

describe('photo radar derived-index migration', () => {
  it('reanalyzes v2 and missing analyses exactly once for pHash v3', () => {
    expect(needsPhotoRadarAnalysis(asset)).toBe(true);
    expect(needsPhotoRadarAnalysis(asset, analysis('photo-radar-dhash-v2'))).toBe(true);
    expect(needsPhotoRadarAnalysis(asset, analysis(PHOTO_RADAR_ALGORITHM_VERSION))).toBe(false);
  });

  it('never sends video assets through the still-photo pHash pipeline', () => {
    expect(needsPhotoRadarAnalysis({ ...asset, mediaType: 'video', mimeType: 'video/mp4' })).toBe(false);
  });

  it('promotes decoded EXIF metadata into the lightweight asset index', () => {
    const capturedAt = new Date('2024-05-06T07:08:09.000Z');
    expect(photoResultAssetMetadataPatch({
      date: capturedAt, hasGPS: true, lat: 30.2741, lng: 120.1551, w: 4032, h: 3024,
    })).toEqual({
      creationTime: capturedAt.getTime(), latitude: 30.2741, longitude: 120.1551, width: 4032, height: 3024,
    });
  });

  it('does not erase trusted GPS when the decoded thumbnail has none', () => {
    expect(photoResultAssetMetadataPatch({ date: null, hasGPS: false, w: 0, h: 0 })).toEqual({});
  });

  it('does not replace authoritative MediaStore dimensions with thumbnail dimensions', () => {
    expect(photoResultAssetMetadataPatch(
      { date: null, hasGPS: false, w: 320, h: 240 },
      { source: 'native-library', width: 4032, height: 3024 },
    )).toEqual({});
  });

  it('keeps bulk screening cheap but gives selected vision and OCR enough pixels', () => {
    expect(photoReadProfile('screen')).toEqual({ maxEdge: 320, quality: 0.66 });
    expect(photoReadProfile('vision').maxEdge).toBeGreaterThanOrEqual(1024);
    expect(photoReadProfile('ocr').maxEdge).toBeGreaterThan(photoReadProfile('vision').maxEdge);
  });
});
