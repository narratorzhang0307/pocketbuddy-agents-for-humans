import type { JournalPage } from './types';

function isMapJournalPage(pageId: string) {
  return (
    pageId.startsWith('pg-atlas-home-') ||
    pageId.startsWith('pg-garden-map-journal-')
  );
}

export function selectJournalPage(
  pages: readonly JournalPage[],
  city: string,
  storagePageId?: string,
): JournalPage | undefined {
  if (storagePageId) {
    return pages.find((page) => page.id === storagePageId);
  }

  const canonicalId = `pg-journal-${city}`;
  return (
    pages.find((page) => page.id === canonicalId) ??
    pages.find((page) => page.city === city && !isMapJournalPage(page.id))
  );
}
