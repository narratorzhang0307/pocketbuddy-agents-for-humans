// ════════════════════════════════════════════════════════════════════════════
// 可复用 Skill（app 层）· 套索平滑 —— 把手绘折线圈选平滑成「手剪圆边」有机轮廓
// ────────────────────────────────────────────────────────────────────────────
// 手帐剪刀（ScissorsMat）此前直接把原始指针点 lineTo 连成【尖角折线多边形】再 clip，
// 正是 AnyPiece 博主吐槽的「PS lasso 尖角」。这里把「折线 → 圆边」这步领域无关的几何原语收口成一处：
//   ① 等弧长重采样去抖  →  ② 可选 Chaikin 切角轻磨  →  ③ 向心 Catmull-Rom 过点样条细分。
// 用【过点插值】而非【逼近】：Catmull-Rom 曲线穿过采样点，不会把用户圈中的主体往里啃；
// Chaikin 是逼近型会内缩，故默认只用 1 次做「轻磨尖角」，磨圆而不吃肉。
//
// 关注点分离：只认「点数组进、点数组出」，不碰 canvas / 照片 / 手帐领域（纯几何、可 node 单测）。
// 领域差异（圆润程度 / 细分密度 / 是否闭合）全做成参数，不写死分支。
// ════════════════════════════════════════════════════════════════════════════

export interface Pt { x: number; y: number }

export interface SmoothOptions {
  resampleStep?: number;   // 等弧长重采样间距（px，默认 8）——越大越圆润
  chaikin?: number;        // Chaikin 切角迭代次数（默认 1；0 = 关）——轻磨尖角
  subdivisions?: number;   // Catmull-Rom 每段细分点数（默认 6）——越大越顺滑
  closed?: boolean;        // 是否闭合（套索恒为 true，默认 true）
}

const EPS = 1e-6;
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** 闭合折线周长（closed 时含收尾段） */
export function polylineLength(pts: Pt[], closed = true): number {
  if (pts.length < 2) return 0;
  let len = 0;
  for (let i = 0; i < pts.length - 1; i++) len += dist(pts[i], pts[i + 1]);
  if (closed) len += dist(pts[pts.length - 1], pts[0]);
  return len;
}

/** 等弧长重采样：把疏密不均的手绘点重铺成间距 ~step 的均匀点（去抖 + 稳定后续样条）。 */
export function resample(pts: Pt[], step: number, closed = true): Pt[] {
  if (pts.length < 3 || step <= 0) return pts.slice();
  const src = closed ? [...pts, pts[0]] : pts;           // 闭合时补一段回到起点
  const total = polylineLength(pts, closed);
  if (total < step) return pts.slice();
  const out: Pt[] = [src[0]];
  let acc = 0;                                            // 已走过弧长（相对下一个采样点）
  for (let i = 0; i < src.length - 1; i++) {
    const a = src[i], b = src[i + 1];
    let segLen = dist(a, b);
    if (segLen < EPS) continue;
    let remain = segLen;
    let from = a;
    while (acc + remain >= step) {
      const need = step - acc;
      const t = need / remain;
      const p = { x: from.x + (b.x - from.x) * t, y: from.y + (b.y - from.y) * t };
      out.push(p);
      from = p;
      remain -= need;
      acc = 0;
    }
    acc += remain;
  }
  // 闭合时去掉可能与起点重合的收尾点
  if (closed && out.length > 1 && dist(out[out.length - 1], out[0]) < step * 0.5) out.pop();
  return out.length >= 3 ? out : pts.slice();
}

/** Chaikin 切角：每条边取 1/4、3/4 处新点，磨圆折角。closed 时闭环处理。 */
export function chaikin(pts: Pt[], iterations = 1, closed = true): Pt[] {
  let cur = pts.slice();
  for (let it = 0; it < iterations; it++) {
    if (cur.length < 3) break;
    const next: Pt[] = [];
    const n = cur.length;
    const last = closed ? n : n - 1;
    if (!closed) next.push(cur[0]);
    for (let i = 0; i < last; i++) {
      const a = cur[i], b = cur[(i + 1) % n];
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    if (!closed) next.push(cur[n - 1]);
    cur = next;
  }
  return cur;
}

/** 向心（centripetal, α=0.5）Catmull-Rom 过点样条：穿过每个控制点，无内缩、无回勾自交。 */
export function catmullRom(pts: Pt[], subdivisions = 6, closed = true): Pt[] {
  const n = pts.length;
  if (n < 3 || subdivisions < 1) return pts.slice();
  const at = (i: number) => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const out: Pt[] = [];
  const segEnd = closed ? n : n - 1;
  for (let i = 0; i < segEnd; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    // 向心参数化：t 间距 = 段长开方（防尖点/自交）
    const t0 = 0;
    const t1 = t0 + Math.max(EPS, Math.sqrt(dist(p0, p1)));
    const t2 = t1 + Math.max(EPS, Math.sqrt(dist(p1, p2)));
    const t3 = t2 + Math.max(EPS, Math.sqrt(dist(p2, p3)));
    for (let s = 0; s < subdivisions; s++) {
      const t = t1 + ((t2 - t1) * s) / subdivisions;
      const a1 = lerp(p0, p1, (t1 - t) / (t1 - t0), (t - t0) / (t1 - t0));
      const a2 = lerp(p1, p2, (t2 - t) / (t2 - t1), (t - t1) / (t2 - t1));
      const a3 = lerp(p2, p3, (t3 - t) / (t3 - t2), (t - t2) / (t3 - t2));
      const b1 = lerp(a1, a2, (t2 - t) / (t2 - t0), (t - t0) / (t2 - t0));
      const b2 = lerp(a2, a3, (t3 - t) / (t3 - t1), (t - t1) / (t3 - t1));
      out.push(lerp(b1, b2, (t2 - t) / (t2 - t1), (t - t1) / (t2 - t1)));
    }
  }
  return out;
}
// 两权重线性组合（wa*a + wb*b），权重由 CR 递推给定
function lerp(a: Pt, b: Pt, wa: number, wb: number): Pt {
  return { x: a.x * wa + b.x * wb, y: a.y * wa + b.y * wb };
}

/**
 * 把手绘折线套索平滑成手剪圆边：重采样去抖 → 轻磨尖角 → 过点样条细分。
 * 返回稠密点数组（闭合环，不重复首点）；点数不足或退化时原样返回。
 */
export function smoothPolygon(pts: Pt[], opts: SmoothOptions = {}): Pt[] {
  const { resampleStep = 8, chaikin: chaikinIter = 1, subdivisions = 6, closed = true } = opts;
  if (pts.length < 3) return pts.slice();
  let p = resample(pts, resampleStep, closed);
  if (chaikinIter > 0) p = chaikin(p, chaikinIter, closed);
  p = catmullRom(p, subdivisions, closed);
  return p;
}

/** 点集包围盒（供剪切台外扩描边用） */
export function bbox(pts: Pt[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}
