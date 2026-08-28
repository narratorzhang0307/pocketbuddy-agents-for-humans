import { useEffect, useRef, useState } from 'react';
import { loadAmap, AMAP_KEY, AMAP_PERSONAL_STYLE } from '../lib/amap';
import { wgs84ToGcj02 } from '../lib/location/chinaCoordinates';
import {
  createAmapRuntime,
  type AmapMap,
} from '../lib/maps/amapRuntime';
import type { CityMapRuntime } from '../lib/maps/runtime';

interface AmapEarthProps {
  /** 是否允许拖拽 / 缩放，默认 true */
  interactive?: boolean;
  /** 初始中心点 [lng, lat]，业务数据统一使用 WGS84。 */
  center?: [number, number];
  /** 初始缩放级别，默认 3 */
  zoom?: number;
  /** 地图就绪回调（返回统一 WGS84 地图运行时） */
  onReady?: (map: CityMapRuntime | null) => void;
  className?: string;
}

// “我的街道”专用高德底图。这里只负责底图与相机，不读取任何个人
// 知识数据，也不创建公共街道的花园覆盖物；业务内容由 MyMapTab 叠加。
export default function AmapEarth({
  interactive = true,
  center = [118.793, 32.049],
  zoom = 3,
  onReady,
  className,
}: AmapEarthProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);
  const [loaded, setLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;
    setLoaded(false);
    setMapError(null);

    loadAmap()
      .then((AMapNs) => {
        if (cancelled || !containerRef.current) return;
        // AMap 全局命名空间（JSAPI 2.0）。用 any 断言避免引入官方 types 依赖。
        const AMap = AMapNs as any;
        const map = new AMap.Map(containerRef.current, {
          viewMode: '3D',
          center: wgs84ToGcj02(center),
          zoom: Math.max(3, zoom),
          pitch: 0,
          rotation: 0,
          zooms: [3, 20],
          mapStyle: AMAP_PERSONAL_STYLE,
          dragEnable: interactive,
          zoomEnable: interactive,
          showLabel: true,
        });
        mapRef.current = map;

        map.on('complete', () => {
          if (cancelled) return;
          setLoaded(true);
          onReady?.(createAmapRuntime(map as AmapMap));
        });
      })
      .catch((e: unknown) => {
        if (!cancelled) setMapError(e instanceof Error ? e.message : '高德地图加载失败');
      });

    return () => {
      cancelled = true;
      const m = mapRef.current as { destroy?: () => void } | null;
      m?.destroy?.();
      mapRef.current = null;
      onReady?.(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryToken]);

  return (
    <>
      <div
        ref={containerRef}
        className={className}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, background: '#f1f3f1' }}
      />

      {/* 加载中 / 失败的可见反馈。 */}
      {(mapError || !loaded) && (
        <div className={`absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2 bg-[#f1f3f1]/90 px-6 text-center ${mapError ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          {mapError ? (
            <>
              <div className="w-3 h-3 bg-[#d23b3b] border border-black/40" />
              <div className="text-[11px] text-black/70">
                高德地图加载失败 · {mapError}
                {!AMAP_KEY ? '（未配置 VITE_AMAP_KEY）' : ''}
              </div>
              {AMAP_KEY && (
                <button
                  type="button"
                  onClick={() => setRetryToken((value) => value + 1)}
                  className="border-2 border-black bg-white px-3 py-1.5 text-[11px] font-bold shadow-[2px_2px_0_#000] active:translate-y-px active:shadow-none"
                >
                  重新加载地图
                </button>
              )}
            </>
          ) : (
            <div className="w-3 h-3 bg-[#8fc9a0] border border-black/30 animate-pulse" />
          )}
        </div>
      )}

      {/* 左下角 provider 水印：肉眼可证当前底图正是高德地图 */}
      {loaded && (
        <div className="absolute bottom-2 left-2 z-20 px-2 py-0.5 rounded border border-black/20 bg-[#f7f7f2]/90 text-[10px] text-[#51695a] font-mono pointer-events-none">
          MAP: AMap / 高德地图
        </div>
      )}
    </>
  );
}
