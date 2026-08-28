import { describe, expect, it } from 'vitest';
import type { PhotoChronicleData } from './chronicleData';
import { mergePhotoChronicleData } from './chronicleData';

const data = (id: string, count: number): PhotoChronicleData => ({
  timelineGroups: [{ id: `group-${id}`, title: '2026.08', photos: [{ id, assetKey: id, cap: id, img: `${id}.jpg`, full: `${id}.jpg`, rot: 0 }] }],
  calendarMonths: [{ label: '2026.08', dim: 31, days: { 13: { assetKey: id, thumb: `${id}.jpg`, full: `${id}.jpg`, count } } }],
  magazineYears: [{ year: 2026, cover: `${id}.jpg`, photos: [{ id, assetKey: id, thumb: `${id}.jpg`, full: `${id}.jpg`, date: '2026-08-13', city: id }] }],
  hasPhotos: true,
});

describe('photo chronicle append', () => {
  it('keeps demo photos and puts a newly confirmed batch first', () => {
    const merged = mergePhotoChronicleData(data('demo', 2), data('device', 1));
    expect(merged.magazineYears[0].photos.map((photo) => photo.id)).toEqual(['device', 'demo']);
    expect(merged.magazineYears[0].cover).toBe('device.jpg');
    expect(merged.calendarMonths[0].days[13]).toMatchObject({ assetKey: 'device', count: 3 });
  });
});
