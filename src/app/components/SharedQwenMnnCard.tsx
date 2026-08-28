import { useCallback, useEffect, useState } from 'react';
import { Check, Download, Loader2, Square } from 'lucide-react';
import {
  cancelEdgeAsset,
  configureEdgeRuntime,
  getEdgeAssets,
  getEdgeRuntimeStatus,
  installEdgeAsset,
} from '../../../frost-agent/edge/httpEdge';
import { isNativeMnnPlatform, subscribeNativeAssetProgress } from '../../../frost-agent/edge/capacitorMnnEdge';
import type { EdgeAssetStatus, EdgeResponse } from '../../../frost-agent/edge/types';
import { QWEN2B_BASE_ASSET, QWEN2B_BASE_RELEASE } from '../../../frost-agent/edge/qwen2bRelease';

const ACCENT = '#79bed0';

const bytes = (value: number): string => !value
  ? '0 MB'
  : `${(value / 1024 / 1024).toFixed(value > 1024 * 1024 * 1024 ? 0 : 1)} MB`;

export interface SharedQwenMnnState {
  base?: EdgeAssetStatus;
  runtime: EdgeResponse | null;
}

interface SharedQwenMnnCardProps {
  onStateChange?: (state: SharedQwenMnnState) => void;
}

/** One host-level Qwen/MNN asset and route, reused by Photos and every Skill. */
export default function SharedQwenMnnCard({ onStateChange }: SharedQwenMnnCardProps) {
  const native = isNativeMnnPlatform();
  const [base, setBase] = useState<EdgeAssetStatus>();
  const [runtime, setRuntime] = useState<EdgeResponse | null>(null);
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState('');

  const publish = useCallback((nextBase: EdgeAssetStatus | undefined, nextRuntime: EdgeResponse | null) => {
    setBase(nextBase);
    setRuntime(nextRuntime);
    onStateChange?.({ base: nextBase, runtime: nextRuntime });
  }, [onStateChange]);

  const refresh = useCallback(async () => {
    const [assets, nextRuntime] = await Promise.all([getEdgeAssets(), getEdgeRuntimeStatus()]);
    const nextBase = assets.find((asset) => asset.id === QWEN2B_BASE_ASSET);
    publish(nextBase, nextRuntime);
  }, [publish]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    let unsubscribe: (() => Promise<void>) | null = null;
    void subscribeNativeAssetProgress((event) => {
      if (event.assetId !== QWEN2B_BASE_ASSET) return;
      setBase((current) => ({
        ...current,
        id: QWEN2B_BASE_ASSET,
        kind: current?.kind ?? 'base',
        name: current?.name ?? 'Qwen3-VL-2B',
        state: event.phase === 'done' ? 'installed' : 'downloading',
        installed: event.phase === 'done',
        downloaded: event.downloaded,
        total: event.total,
      }));
      if (event.phase === 'done') void refresh();
    }).then((dispose) => { unsubscribe = dispose; });
    return () => { if (unsubscribe) void unsubscribe(); };
  }, [refresh]);

  const install = async () => {
    if (!native || acting) return;
    setActing(true); setMessage('');
    try {
      const assets = await installEdgeAsset(QWEN2B_BASE_ASSET, QWEN2B_BASE_RELEASE);
      const installed = assets.find((asset) => asset.id === QWEN2B_BASE_ASSET);
      if (!installed?.installed || installed.filesVerified === false) {
        throw new Error(installed?.error || 'Qwen3-VL-2B 资产未通过校验');
      }
      const activated = await configureEdgeRuntime(true, runtime?.runtime?.sme2Requested ?? false);
      if (activated.error) throw new Error(activated.error);
      setMessage('已安装并启用；Photos 与 Skills 立即共用。');
      await refresh();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setActing(false);
    }
  };

  const cancel = async () => {
    if (acting) return;
    setActing(true);
    try {
      const assets = await cancelEdgeAsset(QWEN2B_BASE_ASSET);
      publish(assets.find((asset) => asset.id === QWEN2B_BASE_ASSET), runtime);
    } finally {
      setActing(false);
    }
  };

  const pct = base?.total ? Math.min(100, Math.round(base.downloaded / base.total * 100)) : 0;
  const ready = base?.installed && runtime?.runtime?.mnnEnabled === true
    && (runtime.runtime.textReady === true || runtime.runtime.visionReady === true);

  return <section data-shared-qwen-mnn className="border-2 border-black bg-white p-2">
    <div className="flex items-center gap-2">
      <b className="flex-1 text-[10px]">Qwen3-VL-2B · MNN 3.6.1</b>
      <span className="font-pixel text-[7px]">{ready ? '共享就绪' : base?.installed ? '已安装' : base?.state === 'downloading' ? `${pct}%` : '未安装'}</span>
    </div>
    {base?.state === 'downloading' && <div className="mt-1.5 h-2 overflow-hidden border border-black bg-[#eaeaea]"><div className="h-full" style={{ width: `${pct}%`, background: ACCENT }} /></div>}
    <div className="mt-1 text-[8px] text-black/40">{bytes(base?.downloaded || 0)} / {bytes(base?.total || 0)} · Pocket Earth 全局共享 · {native ? 'Android 原生 MNN' : '网页预览'}</div>
    <div className="mt-2 flex gap-1.5">
      {!base?.installed && base?.state !== 'downloading' && <button type="button" onClick={() => void install()} disabled={acting || !native} className="flex flex-1 items-center justify-center gap-1 border-2 border-black bg-black px-2 py-2 text-[9px] font-bold text-[#9bd4e0] disabled:opacity-35"><Download className="h-3 w-3" />安装共享 MNN 基座</button>}
      {base?.state === 'downloading' && <button type="button" onClick={() => void cancel()} disabled={acting} className="flex flex-1 items-center justify-center gap-1 border-2 border-black bg-white px-2 py-2 text-[9px] font-bold"><Square className="h-3 w-3" />暂停</button>}
      {ready && <div className="flex flex-1 items-center justify-center gap-1 border-2 border-black bg-[#dceff3] px-2 py-2 text-[9px] font-bold"><Check className="h-3 w-3" />Photos / Skills 共用</div>}
    </div>
    {acting && <div className="mt-2 flex items-center gap-1.5 text-[8px] font-bold"><Loader2 className="h-3 w-3 animate-spin" />正在校验并启用共享路由…</div>}
    {message && <div className="mt-2 border-l-2 border-black pl-2 text-[8px] text-black/55">{message}</div>}
  </section>;
}
