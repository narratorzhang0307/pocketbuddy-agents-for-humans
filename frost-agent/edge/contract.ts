// 端侧 Selector 能力契约（F）
// 契约本体是 types.ts 的 EdgeModel（声明 available/chat/classify/rank/embed/vision）。
// 这里把「调用点应得到的安全保证」固化下来：给 EdgeModel 套一层兜底 + 健康追踪，
// 任一能力异常都返回安全默认值并记 health，agent/router 调用点无需各自 try-catch。
// 换端侧模型(Qwen→Phi / MNN…)只改 viteEdge 实现与本契约，调用点不动。
import type { EdgeModel } from './types';
import { httpEdge } from './httpEdge';
import { recordHealth } from '../harness/health';

export const EDGE_CAPABILITIES = ['available', 'chat', 'classify', 'rank', 'embed', 'vision'] as const;
export type EdgeCapability = (typeof EDGE_CAPABILITIES)[number];

/** 给 EdgeModel 套一层：任一能力异常都返回安全默认值并记 health，调用点拿到的永远是可用值。 */
export function withFallback(edge: EdgeModel): EdgeModel {
  const guard = async <T>(cap: EdgeCapability, run: () => Promise<T>, fallback: T): Promise<T> => {
    try { const v = await run(); recordHealth('edge.' + cap, true); return v; }
    catch (e) { recordHealth('edge.' + cap, false, String(e)); return fallback; }
  };
  return {
    available: () => guard('available', () => edge.available(), false),
    chat: (p, o) => guard('chat', () => edge.chat(p, o), ''),
    classify: (t, l) => guard('classify', () => edge.classify(t, l), ''),
    rank: (q, c) => guard('rank', () => edge.rank(q, c), [] as number[]),
    embed: (t) => guard('embed', () => edge.embed(t), [] as number[][]),
    vision: (i, p, o) => guard('vision', () => edge.vision(i, p, o), ''),
  };
}

// All semantic calls share one transport contract. On Android, httpEdge enters
// the native PocketMnn bridge; on the web it reaches the configured local/server
// edge runtime. A second browser-only model must not silently change behavior.
export const edgeSafe: EdgeModel = withFallback(httpEdge);
