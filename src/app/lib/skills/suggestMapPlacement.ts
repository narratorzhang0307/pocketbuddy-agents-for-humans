import { runEdgeChatEvidence, runEdgeVisionEvidence } from '../../../../frost-agent/edge/httpEdge';
import { resolvePlace, type GeoHit } from './resolvePlace';

export type PlacementSuggestionSource = 'edge-qwen' | 'gps' | 'catalog' | 'cloud-qwen' | 'manual';

export interface PlacementSuggestion {
  place: string;
  role: string;
  confidence: number;
  evidence: string;
  source: PlacementSuggestionSource;
}

export interface ResolvedPlacementDecision extends PlacementSuggestion { geo: GeoHit }

interface PlacementRole { value: string; label: string }

const stripFence = (value: string) => value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
const cleanString = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export function parsePlacementSuggestion(
  raw: string,
  roles: PlacementRole[],
  source: PlacementSuggestionSource = 'edge-qwen',
): PlacementSuggestion | null {
  const clean = stripFence(raw);
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(clean.slice(start, end + 1)) as Record<string, unknown>;
    const place = cleanString(value.place);
    const allowed = new Set(roles.map((role) => role.value));
    const role = cleanString(value.role);
    const confidence = Math.max(0, Math.min(1, Number(value.confidence) || 0));
    const evidence = cleanString(value.evidence);
    if (!place || !allowed.has(role) || confidence < 0.55 || !evidence) return null;
    return { place, role, confidence, evidence, source };
  } catch {
    return null;
  }
}

function roleSpec(roles: PlacementRole[]): string {
  return roles.map((role) => `${role.value}=${role.label}`).join('；');
}

export async function suggestTextPlacementOnDevice(input: {
  domain: string;
  title?: string;
  text: string;
  roles: PlacementRole[];
  candidate?: { place: string; role: string; evidence?: string };
}): Promise<PlacementSuggestion | null> {
  const response = await runEdgeChatEvidence(
    `内容类型：${input.domain}\n标题：${input.title?.trim() || '（无）'}\n用户确认内容：\n${input.text.trim().slice(0, 3500)}\n\n` +
    (input.candidate?.place ? `其他本地能力提供的候选：${input.candidate.place}（${input.candidate.role}）${input.candidate.evidence ? `，依据：${input.candidate.evidence}` : ''}。候选不是事实，你要判断采用、改正或留空。\n` : '') +
    `请只提出一个最适合在地图上表达这张卡片的地点。允许的地点角色：${roleSpec(input.roles)}。` +
    '如果文字没有明确地名，只有在标题/作者/作品身份足够明确时才可给出广为确认的关联城市；不确定就把 place 留空。' +
    '输出严格 JSON：{"place":"城市或地区；未知留空","role":"允许值之一","confidence":0到1,"evidence":"一句话说明依据；未知留空"}。不要输出坐标。',
    {
      system: '你是端侧地图落位建议器。你只产出可撤销的草稿，不写地图；宁可留空，不猜测地点。',
      json: true,
      maxTokens: 260,
    },
  );
  if (response.backend !== 'mnn' || !response.text?.trim()) return null;
  return parsePlacementSuggestion(response.text, input.roles);
}

/** 端侧 2B 决定地点语义与角色；确定性地理编码只负责把它转换为坐标。 */
export async function decideTextPlacementOnDevice(input: Parameters<typeof suggestTextPlacementOnDevice>[0]): Promise<ResolvedPlacementDecision | null> {
  const suggestion = await suggestTextPlacementOnDevice(input);
  if (!suggestion) return null;
  const geo = await resolvePlace(suggestion.place);
  return geo ? { ...suggestion, geo } : null;
}

export async function suggestPhotoPlacementOnDevice(input: {
  image: string;
  context?: string;
}): Promise<PlacementSuggestion | null> {
  const roles = [{ value: 'capture', label: '拍摄地' }];
  const response = await runEdgeVisionEvidence(
    input.image,
    `这是一张没有 GPS 的用户实拍照片。${input.context ? `本地整理信息：${input.context.slice(0, 600)}。` : ''}` +
    '只有画面里出现可唯一识别的地标、店名/路牌/地址文字，或强地点证据时，才建议城市或地区；普通山水、室内、人物、食物一律留空。' +
    '输出严格 JSON：{"place":"城市或地区；未知留空","role":"capture","confidence":0到1,"evidence":"指出画面中的直接证据；未知留空"}。不要输出坐标。',
    { detail: 'fast', maxTokens: 220 },
  );
  if (response.backend !== 'mnn' || !response.text?.trim()) return null;
  return parsePlacementSuggestion(response.text, roles);
}
