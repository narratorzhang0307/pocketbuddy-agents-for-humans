import type { PocketPlantAsset } from '../pocket-plants/catalog';

const KEY = 'carrythecosmos:pocket-poem-drafts:v1';

export type PocketPoemVisibility = 'hidden' | 'public';

export type PocketPoemDraft = {
  id: string;
  text: string;
  assetId: string;
  magic: string[];
  visibility: PocketPoemVisibility;
  createdAt: string;
  city?: string;
};

const MAGIC_RULES = [
  { label: '温暖', words: '春光暖爱笑拥抱太阳清晨' },
  { label: '静谧', words: '夜月雨雪霜静孤等梦远' },
  { label: '轻盈', words: '风云鸟飞跑跳自由天空' },
  { label: '绵长', words: '时间记忆从前后来一生永远等待' },
  { label: '向水', words: '湖河海潮溪岸船波游泳' },
  { label: '向城', words: '街路城窗灯站桥家门' },
] as const;

function hashText(text: string): number {
  let hash = 2166136261;
  for (const character of text.trim()) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
export function inferPocketPoemMagic(text: string): string[] {
  const normalized = text.trim();
  const matched = MAGIC_RULES.filter((rule) =>
    [...rule.words].some((word) => normalized.includes(word)),
  ).map((rule) => rule.label);
  const fallback = ['含蓄', '缓慢', '向光'];
  return [...new Set([...matched, ...fallback])].slice(0, 3);
}

export function recommendPocketPoemPlants(
  text: string,
  assets: readonly PocketPlantAsset[],
  count = 3,
): PocketPlantAsset[] {
  // `fieldReady` only describes whether an asset is suitable for the large
  // randomly generated city field. A seed the user owns is still plantable at
  // an explicit map location, including the seven indoor / hanging plants.
  const plantable = assets;
  if (plantable.length <= count) return [...plantable];
  const start = hashText(text) % plantable.length;
  const recommendations: PocketPlantAsset[] = [];
  for (let offset = 0; recommendations.length < count; offset += 7) {
    const candidate = plantable[(start + offset) % plantable.length];
    if (!recommendations.some((asset) => asset.id === candidate.id)) {
      recommendations.push(candidate);
    }
  }
  return recommendations;
}

const storage = () => (typeof window === 'undefined' ? null : window.localStorage);

export function readPocketPoemDrafts(): PocketPoemDraft[] {
  try {
    const parsed = JSON.parse(storage()?.getItem(KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((draft): draft is PocketPoemDraft => (
      draft &&
      typeof draft.id === 'string' &&
      typeof draft.text === 'string' &&
      typeof draft.assetId === 'string' &&
      Array.isArray(draft.magic) &&
      typeof draft.createdAt === 'string' &&
      (draft.visibility === 'hidden' || draft.visibility === 'public')
    ));
  } catch {
    return [];
  }
}

export function savePocketPoemDraft(draft: PocketPoemDraft): void {
  const rest = readPocketPoemDrafts().filter((item) => item.assetId !== draft.assetId);
  storage()?.setItem(KEY, JSON.stringify([draft, ...rest]));
}

export function takePocketPoemDraft(assetId: string): PocketPoemDraft | null {
  const drafts = readPocketPoemDrafts();
  const draft = drafts.find((item) => item.assetId === assetId) ?? null;
  if (!draft) return null;
  storage()?.setItem(
    KEY,
    JSON.stringify(drafts.filter((item) => item.id !== draft.id)),
  );
  return draft;
}

export function createPocketPoemDraft({
  text,
  assetId,
  visibility,
  city,
  now = new Date(),
}: {
  text: string;
  assetId: string;
  visibility: PocketPoemVisibility;
  city?: string;
  now?: Date;
}): PocketPoemDraft {
  return {
    id: `poem-seed-${now.getTime().toString(36)}-${hashText(text).toString(36)}`,
    text: text.trim(),
    assetId,
    magic: inferPocketPoemMagic(text),
    visibility,
    createdAt: now.toISOString(),
    city: city?.trim() || undefined,
  };
}
