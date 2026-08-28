import type { GeoPosition } from '../maps/runtime';
import { createPocketPlanting, readPocketPlantings, writePocketPlantings, type PocketPlanting } from './planting';

export const VOICE_TREE_ASSET_ID = 'vintage-floral-11'; // Existing loquat tree artwork.
export const VOICE_TREE_MAX_FIX_AGE_MS = 15_000;
export const VOICE_TREE_MAX_ACCURACY_M = 65;

export type VoiceTreeFix = {
  position: GeoPosition; // Converted AMap coordinates, never the camera/character position.
  wgs84Position: GeoPosition;
  timestamp: number;
  accuracyM: number;
};
export type VoiceTreeContext = {
  walking: boolean;
  mode: 'gps' | 'preview';
  fix: VoiceTreeFix | null;
};
export type VoiceTreeResult = {
  status: 'planted' | 'blocked' | 'failed';
  message: string;
  planting?: PocketPlanting;
};
type VoiceTreeMap = {
  context(): VoiceTreeContext | null;
  onResult(result: VoiceTreeResult): void;
};

let activeMap: VoiceTreeMap | undefined;
const handledInputs = new Map<string, VoiceTreeResult>();

/** Only the mounted central map opts in; leaving it removes planting authority. */
export function registerVoiceTreeMap(map: VoiceTreeMap): () => void {
  activeMap = map;
  return () => { if (activeMap === map) activeMap = undefined; };
}

export function isVoiceTreeCommand(text: string): boolean {
  const compact = text.replace(/[\s，,。.!！、；;：:]/g, '');
  // Deliberately whole-utterance only: no negations, questions, quotes or multi-step requests.
  return /^(?:请|麻烦)?(?:帮我|给我|替我|为我)?(?:在(?:这里|这儿|当前位置))?(?:种下|种|栽下|栽)(?:一[棵颗株]树|[棵颗]树|树)(?:吧|呀|啊)?$/.test(compact);
}

function validPosition(position: GeoPosition): boolean {
  return position.length === 2 && position.every(Number.isFinite)
    && Math.abs(position[0]) <= 180 && Math.abs(position[1]) <= 90;
}

function plantTree(inputId: string, context: VoiceTreeContext | null, now: number): VoiceTreeResult {
  if (!context?.walking || context.mode !== 'gps') {
    return { status: 'blocked', message: '还没有种树。请先进入中间地图，开始真实 GPS 散步；演示漫游不能语音种树。' };
  }
  const fix = context.fix;
  if (!fix || !validPosition(fix.position) || !validPosition(fix.wgs84Position)
    || !Number.isFinite(fix.timestamp) || now < fix.timestamp || now - fix.timestamp > VOICE_TREE_MAX_FIX_AGE_MS
    || !Number.isFinite(fix.accuracyM) || fix.accuracyM < 0 || fix.accuracyM > VOICE_TREE_MAX_ACCURACY_M) {
    return { status: 'blocked', message: '还没有种树。正在等待新鲜、准确的 GPS 定位，请定位恢复后再说一次。' };
  }
  const plantings = readPocketPlantings();
  const existing = plantings.find(planting => planting.sourceEventId === inputId);
  if (existing) return { status: 'planted', message: '这条语音已经种过树了，没有重复种植。', planting: existing };

  // A voice tree is a walk keepsake, not a seed-pouch purchase or a step reward.
  // Reuse the existing device-local ledger and growth renderer without changing inventory.
  const planting: PocketPlanting = {
    ...createPocketPlanting(VOICE_TREE_ASSET_ID, [...fix.position], new Date(now), { place: '真实 GPS 散步位置' }),
    source: 'app', sourceEventId: inputId, wgs84Position: [...fix.wgs84Position],
    accuracyM: fix.accuracyM, collectedAt: new Date(fix.timestamp).toISOString(),
  };
  writePocketPlantings([...plantings, planting]);
  if (!readPocketPlantings().some(saved => saved.id === planting.id)) {
    return { status: 'failed', message: '这次未能保存树，请检查手机本地存储后再试。没有报告种植成功。' };
  }
  return { status: 'planted', message: '已在你当前的真实 GPS 位置种下一棵枇杷树，仅保存在本机地图。', planting };
}

/** Synchronous dispatch: never queue a command for a future map mount or GPS fix. */
export function tryVoiceTreeCommand(text: string, inputId: string): VoiceTreeResult | null {
  if (!isVoiceTreeCommand(text)) return null;
  if (!inputId) return { status: 'blocked', message: '没有有效的本次录音编号，未种树，请重新按键说话。' };
  const previous = handledInputs.get(inputId);
  if (previous) return previous;
  const map = activeMap;
  const context = typeof document !== 'undefined' && document.visibilityState === 'visible'
    ? map?.context() ?? null : null;
  const result = plantTree(inputId, context, Date.now());
  handledInputs.set(inputId, result);
  if (handledInputs.size > 256) handledInputs.delete(handledInputs.keys().next().value!);
  map?.onResult(result);
  return result;
}
