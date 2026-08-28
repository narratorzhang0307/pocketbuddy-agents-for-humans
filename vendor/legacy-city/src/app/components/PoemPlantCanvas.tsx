// 诗歌植物 · 四维驱动的实时生成艺术（Canvas 2D，零依赖，像素风）。
// 原项目线上是人工预渲染的 OSS 视频、无运行时生成；这里补上「四维 → 一棵会生长的树」的真生成管线。
// TEMP→冷暖色相、LUX→亮度/描边清晰度、FLUX→生长速度/抖动、GRAV→下坠/密度/粗细/层深；seed→同诗同树。
import { useEffect, useRef } from 'react';
import { attributesToSketch, makeRng, type PoemAttributes } from '../lib/poemtree';

export default function PoemPlantCanvas({ attributes, seed, size = 280, transparent = false }: { attributes: PoemAttributes; seed: number; size?: number; transparent?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const p = attributesToSketch(attributes);
    const depth = Math.min(9, p.depth);   // 封顶 9：每帧 ≤2^9=512 枝，移动端 60fps 安全
    let raf = 0, t = 0, disposed = false;
    let inViewport = true;
    let pageVisible = !document.hidden;
    let offscreenStartedAt: number | null = null;

    const branch = (x: number, y: number, angle: number, len: number, width: number, d: number, rng: () => number, grow: number) => {
      if (d <= 0 || len < 2) return;
      const sway = Math.sin(t * 0.6 + d) * p.jitter * (1 - grow * 0.55);   // 抖动随长成减弱 → 呼吸感
      const a = angle + sway * 0.02;
      const g = Math.min(1, grow * 1.2 - (depth - d) * 0.08);              // 逐层展开：先干后梢
      if (g <= 0) return;
      const nx = x + Math.cos(a) * len * g;
      const ny = y + Math.sin(a) * len * g;
      ctx.strokeStyle = `hsla(${p.hue + (depth - d) * 5}, ${p.sat}%, ${p.bright}%, ${p.strokeAlpha})`;
      ctx.lineWidth = Math.max(0.5, width);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
      if (d <= 2 && g > 0.7) {   // 枝端叶/花：像素点，密度随 GRAV
        const leaf = p.branchDensity > 0.7 ? 3 : 2;
        ctx.fillStyle = `hsla(${p.hue}, ${p.sat}%, ${Math.min(92, p.bright + 18)}%, ${p.strokeAlpha})`;
        ctx.fillRect(nx - leaf / 2, ny - leaf / 2, leaf, leaf);
      }
      // 恒 2 分枝（防指数爆炸）；GRAV(droop) 决定上扬还是下坠，rng 决定不对称
      const spread = 0.42 + p.branchDensity * 0.25;
      branch(nx, ny, a - spread + p.droop * 0.3, len * (0.66 + rng() * 0.1), width * 0.72, d - 1, rng, grow);
      branch(nx, ny, a + spread + p.droop * 0.3, len * (0.66 + rng() * 0.1), width * 0.72, d - 1, rng, grow);
    };

    const draw = () => {
      raf = 0;
      if (disposed || !inViewport || !pageVisible) return;
      t += p.growthSpeed * 0.016;
      const grow = Math.min(1, t * 0.5);
      if (transparent) {
        ctx.clearRect(0, 0, size, size);   // 透明底：树枝直接悬在现实画面上（AR/拍照用）
      } else {
        ctx.fillStyle = p.bg;
        ctx.fillRect(0, 0, size, size);
      }
      const rng = makeRng(seed);   // 每帧同 seed → 结构确定，只 sway 动
      branch(size / 2, size - 6, -Math.PI / 2, size * 0.2, p.branchWidth, depth, rng, grow);
      raf = requestAnimationFrame(draw);
    };
    const start = () => {
      if (!disposed && inViewport && pageVisible && !raf) {
        raf = requestAnimationFrame(draw);
      }
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVisibilityChange = () => {
      pageVisible = !document.hidden;
      if (pageVisible) {
        if (!inViewport) offscreenStartedAt = performance.now();
        start();
      } else {
        // 只补偿页面仍可见时的离屏时段；浏览器后台原本就会暂停 RAF。
        if (offscreenStartedAt != null) {
          t += p.growthSpeed * ((performance.now() - offscreenStartedAt) / 1000);
          offscreenStartedAt = null;
        }
        stop();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    const observer = 'IntersectionObserver' in window
      ? new IntersectionObserver(([entry]) => {
          const nextInViewport = entry?.isIntersecting ?? true;
          if (nextInViewport === inViewport) return;
          inViewport = nextInViewport;
          if (inViewport) {
            if (offscreenStartedAt != null) {
              t += p.growthSpeed * ((performance.now() - offscreenStartedAt) / 1000);
              offscreenStartedAt = null;
            }
            start();
          } else {
            if (pageVisible) offscreenStartedAt = performance.now();
            stop();
          }
        }, { rootMargin: '80px' })
      : null;
    observer?.observe(canvas);
    start();
    return () => {
      disposed = true;
      stop();
      observer?.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attributes.lux, attributes.temp, attributes.flux, attributes.grav, seed, size, transparent]);

  return <canvas ref={ref} style={{ width: size, height: size, imageRendering: 'pixelated' }} className={transparent ? 'block' : 'border-2 border-black block'} />;
}
