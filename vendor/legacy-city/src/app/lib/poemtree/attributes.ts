// 四维属性层：语义定义（命脉，原样继承原项目）+ 诗→四维（GMI 云脑判，prompt 迁自原后端 main.py）。
// 「按结构而非语义解析」：把一首诗抽象成 LUX/TEMP/FLUX/GRAV 四个可解释、可驱动生成的锚点。
import { enrichJSON } from '../skills/enrichEntity';
import { DEFAULT_ATTRIBUTES, type PoemAttributes } from './types';

// 四维语义定义（列表/属性卡展示 + 生成映射的共享单一事实源）。三处重复的表收口于此。
export interface AttrDef { key: keyof PoemAttributes; name: string; sub: string; gloss: string; low: string; high: string; }
export const ATTR_DEFS: AttrDef[] = [
  { key: 'lux', name: 'LUX', sub: '光照 / 可见度', gloss: '诗把多少东西照亮给你看', low: '多暗示、少交代，意义藏在阴影里', high: '多呈现、少遮掩，叙事骨架立刻浮现' },
  { key: 'temp', name: 'TEMP', sub: '温度 / 情绪热度', gloss: '诗的情绪有多烫，或有多冷', low: '冷、克制，像旁观者的陈述', high: '热、贴近，像创作者的呼吸' },
  { key: 'flux', name: 'FLUX', sub: '通量 / 流速', gloss: '诗的推进速度与转场力度', low: '慢、停驻、反复凝视，如长镜头', high: '快、跳切、持续推进，若湍流' },
  { key: 'grav', name: 'GRAV', sub: '重力 / 意象重量', gloss: '诗的意象重量', low: '轻盈、透明，似光、风、薄雾', high: '厚重、密度高，如历史、死亡、命运' },
];

const clamp = (n: unknown): number => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

// 诗 → 四维属性。GMI 云脑判（qwen/GLM/DeepSeek 均可，走 task:'multilingual'）；不可用/超时 → 默认值兜底。
// prompt 迁自原项目后端（main.py:62-71），语义规则一字不改，只把宿主换成我们的 enrichJSON。
export async function sensePoemAttributes(poemText: string): Promise<{ attrs: PoemAttributes; source: 'llm' | 'default' }> {
  const text = (poemText || '').trim();
  if (!text) return { attrs: { ...DEFAULT_ATTRIBUTES }, source: 'default' };
  const system = '你是一个将中文诗句映射成四个参数的系统。输出严格 JSON，字段仅为 lux,temp,flux,grav，值为 0-100 的整数。'
    + '规则：lux 明亮/希望/高能量更高、阴郁/夜色更低；temp 情绪热度/激烈更高、冷静/克制更低；'
    + 'flux 变化/跳跃/不稳定更高、平稳/凝固更低；grav 重量/沉重/宿命更高、轻盈/飘逸更低。只输出 JSON，不要多余文字。';
  const prompt = `诗句：${text.slice(0, 600)}`;
  const obj = await enrichJSON<Record<string, unknown>>({ prompt, system, task: 'multilingual' });
  if (!obj) return { attrs: { ...DEFAULT_ATTRIBUTES }, source: 'default' };
  const attrs: PoemAttributes = { lux: clamp(obj.lux), temp: clamp(obj.temp), flux: clamp(obj.flux), grav: clamp(obj.grav) };
  // 云脑吐了退化空对象（四维全 0）→ 视同不可用，回落默认（免把「没判出来」当成真判定）
  if (!attrs.lux && !attrs.temp && !attrs.flux && !attrs.grav) return { attrs: { ...DEFAULT_ATTRIBUTES }, source: 'default' };
  return { attrs, source: 'llm' };
}

// 一次 GMI 往返同时出四维 + 树语（合并原来串行的 sensePoemAttributes + curateTreeVoice，省一次往返、省一半 token）。
export async function sensePoemGestalt(poemText: string): Promise<{ attrs: PoemAttributes; voice: string; source: 'llm' | 'default' }> {
  const text = (poemText || '').trim();
  if (!text) return { attrs: { ...DEFAULT_ATTRIBUTES }, voice: '', source: 'default' };
  const system = '你是解读中文诗的系统。输出严格 JSON，字段：lux,temp,flux,grav（各 0-100 整数），voice（一句不超过30字的中文树语，诗意描述这棵由诗长成的树，不要引号）。'
    + '规则：lux 明亮/希望更高、阴郁更低；temp 情绪热度更高、冷静更低；flux 变化/跳跃更高、平稳更低；grav 重量/沉重更高、轻盈更低。只输出 JSON。';
  const prompt = '诗句：' + text.slice(0, 600);
  const obj = await enrichJSON<Record<string, unknown>>({ prompt, system, task: 'narrative' });
  if (!obj) return { attrs: { ...DEFAULT_ATTRIBUTES }, voice: '', source: 'default' };
  const attrs: PoemAttributes = { lux: clamp(obj.lux), temp: clamp(obj.temp), flux: clamp(obj.flux), grav: clamp(obj.grav) };
  const voice = typeof obj.voice === 'string' ? obj.voice.trim().slice(0, 40) : '';
  if (!attrs.lux && !attrs.temp && !attrs.flux && !attrs.grav) return { attrs: { ...DEFAULT_ATTRIBUTES }, voice, source: 'default' };
  return { attrs, voice, source: 'llm' };
}
