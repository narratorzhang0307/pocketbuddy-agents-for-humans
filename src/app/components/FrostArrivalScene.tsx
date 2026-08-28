import { useEffect, useRef, useState } from 'react';
import { FROST_ARRIVAL_ATLAS, FROST_ARRIVAL_DURATION, FROST_ARRIVAL_LOADING_LIMIT,
  frostArrivalAt, frostArrivalPosition } from '../lib/frostArrival';

export type ArrivalFinish = 'complete' | 'reduced-motion' | 'hidden' | 'unavailable';

/** A bounded, replayable film inside the App card, never a WidgetKit animation loop. */
export default function FrostArrivalScene({ onFinish }: { onFinish: (reason: ArrivalFinish) => void }) {
  const [elapsed, setElapsed] = useState(0);
  const [ready, setReady] = useState(false);
  const callback = useRef(onFinish);
  callback.current = onFinish;
  useEffect(() => {
    let stopped = false, raf = 0, loadingTimer = 0;
    const image = new Image();
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finish = (reason: ArrivalFinish) => {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(loadingTimer);
      callback.current(reason);
    };
    const visibility = () => { if (document.visibilityState === 'hidden') finish('hidden'); };
    const preference = () => { if (motion.matches) finish('reduced-motion'); };
    document.addEventListener('visibilitychange', visibility);
    motion.addEventListener('change', preference);
    if (motion.matches) finish('reduced-motion');
    else if (document.visibilityState === 'hidden') finish('hidden');
    else {
      image.onload = () => {
        if (stopped) return;
        window.clearTimeout(loadingTimer);
        setReady(true);
        const start = performance.now();
        const tick = (now: number) => {
          if (stopped) return;
          const time = now - start;
          if (time >= FROST_ARRIVAL_DURATION) { finish('complete'); return; }
          setElapsed(time);
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      };
      image.onerror = () => finish('unavailable');
      loadingTimer = window.setTimeout(() => finish('unavailable'), FROST_ARRIVAL_LOADING_LIMIT);
      image.src = FROST_ARRIVAL_ATLAS;
    }
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(loadingTimer);
      image.onload = null; image.onerror = null;
      document.removeEventListener('visibilitychange', visibility);
      motion.removeEventListener('change', preference);
    };
  }, []);
  const pose = frostArrivalAt(elapsed);
  return <div className="presence-arrival-scene" data-stage={ready ? pose.phase : 'loading'}
    role="img" aria-label="Frost 跑进来，在中间摇摇尾巴，凑近镜头，再回到头像卡片">
    <div className="presence-arrival-backdrop" />
    {ready ? <div className="presence-arrival-sprite" data-frame={pose.frame}
      style={{ backgroundImage: `url(${FROST_ARRIVAL_ATLAS})`, backgroundPosition: frostArrivalPosition(pose.frame),
        transform: `translate(calc(-50% - ${pose.travel * 150}%), -50%)` }} />
      : <span className="presence-arrival-loading">准备跑来见你…</span>}
    <span className="presence-arrival-caption" aria-hidden="true">{!ready ? '' : pose.phase === 'run' ? '跑来见你'
      : pose.phase === 'wag' ? '见到你就很开心' : pose.phase === 'approach' ? '再靠近一点' : ''}</span>
  </div>;
}
