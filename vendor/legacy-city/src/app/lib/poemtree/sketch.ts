// 生成层：四维属性 → 「诗歌植物」生成艺术参数（原项目只有意图、无实现，这是解耦后新写的核心）。
// 纯参数映射 + 确定性随机（同诗同树、可复现）；实际绘制在 PoemPlantCanvas 组件（Canvas 2D，零依赖、像素风）。
import { type PoemAttributes } from './types';

// 确定性伪随机（mulberry32）：同一 seed 出同一棵树，换 seed 换形态但四维气质不变。
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 诗文 → 稳定 seed（同一首诗每次生成同一棵树）
export function poemSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// 四维 → 具体渲染参数。这套映射是「诗的结构长成什么样的树」的规则。
export interface SketchParams {
  hue: number;            // 主色相（TEMP：暖↔冷）
  sat: number;            // 饱和度（TEMP 高→更艳）
  bright: number;         // 整体亮度（LUX）
  strokeAlpha: number;    // 描边清晰度/对比（LUX 高→更清晰）
  growthSpeed: number;    // 生长/粒子速度（FLUX）
  jitter: number;         // 抖动幅度（FLUX 高→更躁动）
  droop: number;          // 枝干下坠量（GRAV）
  branchDensity: number;  // 枝干密度（GRAV 高→更密更重）
  branchWidth: number;    // 枝干粗细（GRAV）
  depth: number;          // 递归层数（GRAV + LUX 综合）
  bg: string;             // 背景色（暗↔亮，随 LUX）
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function attributesToSketch(attr: PoemAttributes): SketchParams {
  const lux = attr.lux / 100, temp = attr.temp / 100, flux = attr.flux / 100, grav = attr.grav / 100;
  // TEMP：冷(220 蓝青) → 暖(20 橙红)。低温偏蓝、高温偏橙红。
  const hue = Math.round(lerp(210, 20, temp));
  const sat = Math.round(lerp(35, 85, temp));
  // LUX：亮度与描边清晰度；低 LUX 意义藏在阴影 → 暗背景低对比。
  const bright = Math.round(lerp(38, 92, lux));
  const strokeAlpha = lerp(0.35, 1, lux);
  const bg = `hsl(${hue}, ${Math.round(sat * 0.4)}%, ${Math.round(lerp(6, 22, lux))}%)`;   // 越亮 LUX 背景越不死黑
  // FLUX：生长速度与抖动；低 FLUX 长镜头般舒缓，高 FLUX 湍流般躁动。
  const growthSpeed = lerp(0.4, 2.6, flux);
  const jitter = lerp(0.2, 3.2, flux);
  // GRAV：下坠、密度、粗细、层深；高 GRAV 厚重密集下坠，低 GRAV 轻盈稀疏上扬。
  const droop = lerp(-0.35, 0.7, grav);         // 负=上扬（轻盈），正=下坠（厚重）
  const branchDensity = lerp(0.35, 0.95, grav);
  const branchWidth = lerp(1, 5.5, grav);
  const depth = Math.round(lerp(6, 11, grav * 0.6 + lux * 0.4));
  return { hue, sat, bright, strokeAlpha, growthSpeed, jitter, droop, branchDensity, branchWidth, depth, bg };
}
