import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { speciesFrameUrl } from '../lib/nature-sound/speciesCatalog';
import './NatureSpeciesBuddy.css';

const ACTIONS = ['listen', 'call', 'hop', 'rest'] as const;
type NatureSpeciesAction = typeof ACTIONS[number];

const ACTION_LABELS: Record<NatureSpeciesAction, string> = {
  listen: '侧耳听',
  call: '正在鸣叫',
  hop: '轻轻跃起',
  rest: '安静休息',
};

type NatureSpeciesBuddyProps = {
  assetSlug: string;
  name: string;
  className?: string;
  compact?: boolean;
  animated?: boolean;
  staticAction?: NatureSpeciesAction;
  showActionLabel?: boolean;
  style?: CSSProperties;
};

export default function NatureSpeciesBuddy({
  assetSlug,
  name,
  className = '',
  compact = false,
  animated = true,
  staticAction = 'rest',
  showActionLabel = false,
  style,
}: NatureSpeciesBuddyProps) {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const activeLayerRef = useRef<0 | 1>(0);
  const actionIndexRef = useRef(0);
  const [visible, setVisible] = useState(false);
  const [activeLayer, setActiveLayer] = useState<0 | 1>(0);
  const [action, setAction] = useState<NatureSpeciesAction>('listen');
  const [layerUrls, setLayerUrls] = useState<readonly [string, string]>(() => {
    const first = speciesFrameUrl(assetSlug, 'listen');
    return [first, first];
  });
  const frameUrls = useMemo(() => ACTIONS.map((item) => speciesFrameUrl(assetSlug, item)), [assetSlug]);

  useEffect(() => {
    setLayerUrls([frameUrls[0], frameUrls[0]]);
    setAction('listen');
    actionIndexRef.current = 0;
    activeLayerRef.current = 0;
    setActiveLayer(0);
  }, [frameUrls]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !animated) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      { rootMargin: '140px' },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [animated]);

  useEffect(() => {
    if (!animated || !visible || document.hidden || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    frameUrls.forEach((url) => {
      const image = new Image();
      image.src = url;
      void image.decode?.().catch(() => undefined);
    });
    const timer = window.setInterval(() => {
      const nextIndex = (actionIndexRef.current + 1) % ACTIONS.length;
      const nextAction = ACTIONS[nextIndex];
      const nextLayer: 0 | 1 = activeLayerRef.current === 0 ? 1 : 0;
      setLayerUrls((current) => {
        const next: [string, string] = [...current];
        next[nextLayer] = frameUrls[nextIndex];
        return next;
      });
      window.requestAnimationFrame(() => {
        activeLayerRef.current = nextLayer;
        actionIndexRef.current = nextIndex;
        setActiveLayer(nextLayer);
        setAction(nextAction);
      });
    }, compact ? 1260 : 1560);
    return () => window.clearInterval(timer);
  }, [animated, compact, frameUrls, visible]);

  const advance = () => {
    const nextIndex = (actionIndexRef.current + 1) % ACTIONS.length;
    const nextLayer: 0 | 1 = activeLayerRef.current === 0 ? 1 : 0;
    setLayerUrls((current) => {
      const next: [string, string] = [...current];
      next[nextLayer] = frameUrls[nextIndex];
      return next;
    });
    activeLayerRef.current = nextLayer;
    actionIndexRef.current = nextIndex;
    setActiveLayer(nextLayer);
    setAction(ACTIONS[nextIndex]);
  };

  return (
    <span
      ref={hostRef}
      className={`nsb-buddy${animated ? ' is-animated' : ''}${compact ? ' is-compact' : ''}${className ? ` ${className}` : ''}`}
      style={style}
      role="img"
      aria-label={animated ? `${name}卡通形象，${ACTION_LABELS[action]}` : `${name}卡通形象`}
      onClick={animated ? advance : undefined}
    >
      {animated ? layerUrls.map((url, index) => (
        <img
          key={`${index}-${url}`}
          className={activeLayer === index ? 'is-active' : ''}
          src={url}
          alt=""
          draggable={false}
        />
      )) : (
        <img className="is-active" src={speciesFrameUrl(assetSlug, staticAction)} alt="" draggable={false} />
      )}
      {animated && showActionLabel && <small>{ACTION_LABELS[action]}</small>}
    </span>
  );
}
