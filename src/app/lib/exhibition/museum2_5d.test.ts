import { describe, expect, it } from 'vitest';
import {
  MUSEUM_2_5D_DEMO_HOTSPOTS,
  MUSEUM_2_5D_ARCHIVE_DEMOS,
  MUSEUM_2_5D_DEMOS,
  MUSEUM_2_5D_DEMO_VIEWS,
  captureReady,
  exhibitInferenceAssetUrl,
  hotspotVisibleAtYaw,
  mattingCaptureAccepted,
  nearestObservedView,
  signedYawDelta,
  wrapYaw,
} from './museum2_5d';

describe('museum multi-view 2.5D contract', () => {
  it('uses the CORS asset gateway when local inference reads release OSS art', () => {
    const direct = 'https://last-night-on-earth.oss-cn-hangzhou.aliyuncs.com/pocket-earth/releases/v1/assets/exhibit.jpg';
    expect(exhibitInferenceAssetUrl(direct)).toBe('https://assets-pocketearth.throughtheglass.art/pocket-earth/releases/v1/assets/exhibit.jpg');
    expect(exhibitInferenceAssetUrl('/assets/exhibit.jpg')).toBe('/assets/exhibit.jpg');
  });

  it('ships seven distinct reconstructions and preserves archival coverage limits', () => {
    expect(MUSEUM_2_5D_DEMOS).toHaveLength(7);
    expect(new Set(MUSEUM_2_5D_DEMOS.map((demo) => demo.id)).size).toBe(7);
    expect(MUSEUM_2_5D_DEMOS.filter((demo) => demo.views.length === 6).length).toBeGreaterThanOrEqual(5);
    expect(MUSEUM_2_5D_DEMOS.find((demo) => demo.id === 'harvard-315439-rong-mirror')?.views).toHaveLength(2);
    expect(MUSEUM_2_5D_DEMOS.find((demo) => demo.id === 'harvard-204612-jade-bi')?.views).toHaveLength(4);
    expect(MUSEUM_2_5D_DEMOS.flatMap((demo) => demo.views).every((view) => view.observed)).toBe(true);
  });

  it('keeps only observed views and wraps yaw', () => {
    expect(MUSEUM_2_5D_DEMO_VIEWS).toHaveLength(6);
    expect(MUSEUM_2_5D_DEMO_VIEWS.every((view) => view.observed)).toBe(true);
    expect(wrapYaw(-59)).toBe(301);
    expect(nearestObservedView(359).yawDeg).toBe(0);
    expect(signedYawDelta(350, 10)).toBe(20);
  });

  it('packages the archival originals for direct matting comparison', () => {
    const bronze = MUSEUM_2_5D_DEMOS.find((demo) => demo.id === 'harvard-200497-li');
    expect(bronze?.views).toHaveLength(6);
    expect(bronze?.views.every((view) => view.originalUrl?.includes('/originals/'))).toBe(true);
    expect(bronze?.views[5].originalUrl).toContain('view-05-300.jpg');
  });

  it('leads with the complete six-view museum-vessel asset', () => {
    const [demo] = MUSEUM_2_5D_DEMOS;
    expect(demo.id).toBe('harvard-200497-li');
    expect(demo.views).toHaveLength(6);
    expect(demo.views.every((view) => view.originalUrl?.includes('/originals/'))).toBe(true);
    expect(demo.sourceLabel).toContain('6/6');
    expect(demo.sourceLabel).toContain('完整馆藏角度');
    expect(MUSEUM_2_5D_DEMOS[1].id).toBe('ego-ch-42-79-0-gallery-relief');
    expect(MUSEUM_2_5D_DEMOS[1].sourceLabel).toContain('压力测试');
  });

  it('keeps the interactive main task and pressure test out of the finished example catalog', () => {
    expect(MUSEUM_2_5D_ARCHIVE_DEMOS).toHaveLength(5);
    expect(MUSEUM_2_5D_ARCHIVE_DEMOS.some((demo) => demo.id === 'harvard-200497-li')).toBe(false);
    expect(MUSEUM_2_5D_ARCHIVE_DEMOS.some((demo) => demo.id === 'ego-ch-42-79-0-gallery-relief')).toBe(false);
    expect(MUSEUM_2_5D_ARCHIVE_DEMOS[0].id).toBe('harvard-315439-rong-mirror');
  });

  it('refuses an under-captured exhibit', () => {
    expect(captureReady(5)).toBe(false);
    expect(captureReady(6)).toBe(true);
    expect(captureReady(8)).toBe(true);
    expect(captureReady(9)).toBe(false);
  });

  it('quality-gates tiny targets and whole-scene masks', () => {
    expect(mattingCaptureAccepted(0.02)).toBe(false);
    expect(mattingCaptureAccepted(0.42)).toBe(true);
    expect(mattingCaptureAccepted(0.93)).toBe(false);
  });

  it('attaches a separate detail photo to one observed angle', () => {
    const [hotspot] = MUSEUM_2_5D_DEMO_HOTSPOTS;
    expect(hotspot.captureRole).toBe('separate_detail_photo');
    expect(hotspot.detailPhotoUrl).toBeUndefined();
    expect(hotspotVisibleAtYaw(2, hotspot)).toBe(true);
    expect(hotspotVisibleAtYaw(90, hotspot)).toBe(false);
  });
});
