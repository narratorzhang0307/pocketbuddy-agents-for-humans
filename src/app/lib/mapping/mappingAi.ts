import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { nativeApiEndpoint } from '../../../native/apiOrigin';
import { runEdgeChatEvidence } from '../../../../frost-agent/edge/httpEdge';
import { postQwenJson, readQwenError, readStringField, type QwenFetch } from '../skills/qwenClient';
import { normalizeModelCandidates, parseLooseJson, type ForgeBookMeta, type ForgePageEvidence, type ForgePlaceCandidate } from './forge';

const SYSTEM = '你是端侧文献地点整理器。只能依据 OCR 原文，地点名必须逐字出现在对应页；不得编造地点、引文、坐标或历史事实。只输出纯 JSON。';
export const MAPPING_CLOUD_ENDPOINT = '/api/mapping-cloud';
export const MAPPING_CLOUD_NATIVE_ENDPOINT = 'https://pocketearth.throughtheglass.art/api/mapping-cloud';
export const MAX_MAPPING_CLOUD_PDF_BYTES = 8 * 1024 * 1024;

function groups(pages: ForgePageEvidence[]): ForgePageEvidence[][] {
  const output: ForgePageEvidence[][] = [];
  let current: ForgePageEvidence[] = [];
  let size = 0;
  for (const page of pages) {
    const clipped = { ...page, text: page.text.slice(0, 5200) };
    if (current.length && size + clipped.text.length > 9000) {
      output.push(current);
      current = [];
      size = 0;
    }
    current.push(clipped);
    size += clipped.text.length;
  }
  if (current.length) output.push(current);
  return output;
}

export function mappingExtractionPrompt(pages: ForgePageEvidence[], meta: ForgeBookMeta): string {
  const source = pages.map((page) => `【小 PDF 第 ${page.page} 页】\n${page.text}`).join('\n\n');
  return [
    `资料：${meta.title || '未命名资料'}；作者：${meta.author || '未知'}；城市范围：${meta.city || '不限'}。`,
    '找出原文中适合落到地图的地点实体，并用不超过 45 字说明它在这段原文中的意义。',
    'nameAsWritten 必须逐字出现在该页；context 必须是含地名的原文短句；description 只能概括原文，不能扩写历史知识；不要输出坐标。',
    '输出：{"claims":[{"nameAsWritten":"","page":1,"context":"","description":"","relation":"scene|mentioned|route|subject"}]}',
    source,
  ].join('\n');
}

function uniqueCandidates(candidates: ForgePlaceCandidate[]): ForgePlaceCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.name}:${candidate.page}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 30).map((candidate, index) => ({ ...candidate, id: `claim-${index + 1}` }));
}

export async function runMappingEdgeExtraction(pages: ForgePageEvidence[], meta: ForgeBookMeta): Promise<ForgePlaceCandidate[]> {
  const candidates: ForgePlaceCandidate[] = [];
  for (const pageGroup of groups(pages)) {
    const response = await runEdgeChatEvidence(mappingExtractionPrompt(pageGroup, meta), { system: SYSTEM, json: true, maxTokens: 1024 });
    if (response.backend !== 'mnn' || !response.text) throw new Error('Qwen 2B/MNN 端侧运行时未连接，请在 Android 真机运行或载入案例快照。');
    candidates.push(...normalizeModelCandidates(parseLooseJson(response.text)?.claims, pageGroup));
  }
  return uniqueCandidates(candidates);
}

export async function runMappingCloudExtraction(
  file: File,
  sourceHash: string,
  images: string[],
  pages: ForgePageEvidence[],
  meta: ForgeBookMeta,
  onPage?: (page: number, total: number) => void,
  fetcher?: QwenFetch,
): Promise<{ candidates: ForgePlaceCandidate[]; model: string }> {
  if (!images.length || images.length !== pages.length) throw new Error('云端旗舰链路需要与 PP-OCR 页码一致的页面图像。');
  if (file.size > MAX_MAPPING_CLOUD_PDF_BYTES) throw new Error('云端旗舰链路要求当前 PDF 不超过 8 MB；请先截取需要处理的 10 页。');
  if (!/^[a-f0-9]{64}$/i.test(sourceHash)) throw new Error('原 PDF SHA-256 尚未准备好。');
  onPage?.(1, 1);
  const pdf = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('原 PDF 读取失败'));
    reader.readAsDataURL(file);
  });
  const body = {
    source: { name: file.name, sha256: sourceHash, pdf },
    meta,
    pages: pages.map((page, index) => ({ page: page.page, text: page.text, image: images[index] })),
  };
  let data: unknown;
  let status = 0;
  if (!fetcher && Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.post({
      url: nativeApiEndpoint(MAPPING_CLOUD_ENDPOINT, MAPPING_CLOUD_NATIVE_ENDPOINT),
      headers: { 'content-type': 'application/json' },
      data: body,
      connectTimeout: 30_000,
      readTimeout: 180_000,
      responseType: 'json',
    });
    status = response.status;
    data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  } else {
    const response = await postQwenJson({ endpoint: MAPPING_CLOUD_ENDPOINT, body, timeoutMs: 180_000, fetcher });
    status = response.status || 0;
    data = response.data;
    if (!response.ok) throw new Error(`Qwen 3.7 Mapping 提炼失败：${response.error || 'network_error'}`);
  }
  const error = readQwenError(data);
  const text = readStringField(data, 'text');
  const source = data && typeof data === 'object' ? (data as { source?: { sha256?: string; verified?: boolean } }).source : undefined;
  if (status < 200 || status >= 300 || error || !text.trim()) throw new Error(`Qwen 3.7 Mapping 提炼失败：${error || `http_${status || 0}`}`);
  if (!source?.verified || source.sha256 !== sourceHash.toLowerCase()) throw new Error('云端没有返回原 PDF 完整性证明。');
  const normalized = uniqueCandidates(normalizeModelCandidates(parseLooseJson(text)?.claims, pages));
  if (!normalized.length) throw new Error('Qwen 3.7 没有返回带原文证据的地点。');
  return { candidates: normalized, model: readStringField(data, 'model') || 'qwen3.7-plus' };
}
