import type { CalendarMonth, MagazineYear, TimelineGroup } from '../../data/photos';
import type { PhotoLibraryAsset } from './libraryTypes';

export interface PhotoChronicleData {
  timelineGroups: TimelineGroup[];
  calendarMonths: CalendarMonth[];
  magazineYears: MagazineYear[];
  hasPhotos: boolean;
}

const uniqueBy = <T>(items: T[], keyOf: (item: T) => string): T[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** Appends a confirmed device batch to the built-in magazine without erasing demo issues. */
export function mergePhotoChronicleData(base: PhotoChronicleData, appended: PhotoChronicleData): PhotoChronicleData {
  const timelineById = uniqueBy([...appended.timelineGroups, ...base.timelineGroups], (group) => group.id);
  const monthLabels = new Set([...base.calendarMonths, ...appended.calendarMonths].map((month) => month.label));
  const calendarMonths = [...monthLabels].sort((left, right) => right.localeCompare(left)).map((label) => {
    const original = base.calendarMonths.find((month) => month.label === label);
    const incoming = appended.calendarMonths.find((month) => month.label === label);
    const days = { ...(original?.days || {}) };
    for (const [day, cell] of Object.entries(incoming?.days || {})) {
      const existing = days[Number(day)];
      days[Number(day)] = { ...cell, count: cell.count + (existing?.count || 0) };
    }
    return { label, dim: incoming?.dim || original?.dim || 31, days };
  });
  const years = new Set([...base.magazineYears, ...appended.magazineYears].map((issue) => issue.year));
  const magazineYears = [...years].sort((left, right) => right - left).map((year) => {
    const original = base.magazineYears.find((issue) => issue.year === year);
    const incoming = appended.magazineYears.find((issue) => issue.year === year);
    const photos = uniqueBy([...(incoming?.photos || []), ...(original?.photos || [])], (photo) => photo.assetKey || photo.id);
    return { year, cover: incoming?.cover || original?.cover || photos[0]?.thumb || '', photos };
  });
  return {
    timelineGroups: timelineById,
    calendarMonths,
    magazineYears,
    hasPhotos: base.hasPhotos || appended.hasPhotos,
  };
}

const ROTS = [-6, 5, -3, 7, -4, 6, -5, 4];
const pad = (value: number) => String(value).padStart(2, '0');
const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();
const assetImage = (asset: PhotoLibraryAsset) => asset.thumbnailUrl || asset.thumbnailRef || '';
const assetTime = (asset: PhotoLibraryAsset) => asset.creationTime || asset.modificationTime || asset.indexedAt;
const localDateParts = (time: number) => {
  const date = new Date(time);
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
};
const dateText = (time: number) => {
  const { year, month, day } = localDateParts(time);
  return `${year}-${pad(month)}-${pad(day)}`;
};

/** Projects system-gallery metadata into the existing UI without an original-file URL. */
export function buildPhotoChronicleData(input: PhotoLibraryAsset[]): PhotoChronicleData {
  const assets = input
    .filter((asset) => asset.mediaType === 'image' && asset.sourceState !== 'missing' && asset.sourceState !== 'permission-revoked' && assetImage(asset))
    .sort((left, right) => assetTime(right) - assetTime(left));
  const monthBuckets = new Map<string, PhotoLibraryAsset[]>();
  const yearBuckets = new Map<number, PhotoLibraryAsset[]>();

  for (const asset of assets) {
    const { year, month } = localDateParts(assetTime(asset));
    const monthKey = `${year}-${pad(month)}`;
    monthBuckets.set(monthKey, [...(monthBuckets.get(monthKey) || []), asset]);
    yearBuckets.set(year, [...(yearBuckets.get(year) || []), asset]);
  }

  const timelineGroups: TimelineGroup[] = [...monthBuckets.entries()].map(([monthKey, monthAssets], groupIndex) => ({
    id: `local-${monthKey}`,
    title: monthKey.replace('-', '.'),
    sub: `${monthAssets.length} 张`,
    special: groupIndex === 0,
    photos: monthAssets.map((asset, index) => ({
      id: asset.key,
      assetKey: asset.key,
      cap: `${asset.fileName || '本机相册'} · ${dateText(assetTime(asset))}`,
      img: assetImage(asset),
      full: assetImage(asset),
      rot: ROTS[index % ROTS.length],
    })),
  }));

  const calendarMonths: CalendarMonth[] = [...monthBuckets.entries()].map(([monthKey, monthAssets]) => {
    const [year, month] = monthKey.split('-').map(Number);
    const dayBuckets = new Map<number, PhotoLibraryAsset[]>();
    for (const asset of monthAssets) {
      const day = localDateParts(assetTime(asset)).day;
      dayBuckets.set(day, [...(dayBuckets.get(day) || []), asset]);
    }
    const days: CalendarMonth['days'] = {};
    for (const [day, dayAssets] of dayBuckets) {
      const representative = dayAssets[0];
      days[day] = {
        assetKey: representative.key,
        thumb: assetImage(representative),
        full: assetImage(representative),
        count: dayAssets.length,
      };
    }
    return { label: `${year}.${pad(month)}`, dim: daysInMonth(year, month), days };
  });

  const magazineYears: MagazineYear[] = [...yearBuckets.entries()].map(([year, yearAssets]) => ({
    year,
    cover: assetImage(yearAssets[0]),
    photos: yearAssets.map((asset) => ({
      id: asset.key,
      assetKey: asset.key,
      thumb: assetImage(asset),
      full: assetImage(asset),
      date: dateText(assetTime(asset)),
      city: asset.latitude != null && asset.longitude != null ? '带位置的照片' : '本机相册',
    })),
  }));

  return { timelineGroups, calendarMonths, magazineYears, hasPhotos: assets.length > 0 };
}
