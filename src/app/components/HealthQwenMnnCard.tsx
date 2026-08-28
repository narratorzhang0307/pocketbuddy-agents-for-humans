import { useCallback, useEffect, useState } from 'react';
import { Check, Download, Loader2, Trash2 } from 'lucide-react';
import { QWEN4B_HEALTH_ASSET, QWEN4B_HEALTH_RELEASE } from '../../../frost-agent/edge/qwen4bHealthRelease';
import {
  configureEdgeRuntime,
  getEdgeAssets,
  getEdgeRuntimeStatus,
  installEdgeAsset,
  uninstallEdgeAsset,
} from '../../../frost-agent/edge/httpEdge';
import { isNativeMnnPlatform, subscribeNativeAssetProgress } from '../../../frost-agent/edge/capacitorMnnEdge';
import type { EdgeAssetStatus, EdgeResponse } from '../../../frost-agent/edge/types';

export interface HealthQwenMnnState {
  base?: EdgeAssetStatus;
  runtime: EdgeResponse;
}

interface Props {
  onReadyChange?: (ready: boolean) => void;
  onStateChange?: (state: HealthQwenMnnState) => void;
}

const formatGiB = (value: number) => `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;

export default function HealthQwenMnnCard({ onReadyChange, onStateChange }: Props) {
  const native = isNativeMnnPlatform();
  const [asset, setAsset] = useState<EdgeAssetStatus>();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    const [assets, runtime] = await Promise.all([getEdgeAssets(), getEdgeRuntimeStatus()]);
    const next = assets.find((item) => item.id === QWEN4B_HEALTH_ASSET);
    const nextReady = next?.installed === true && next.filesVerified === true
      && runtime.runtime?.healthTextReady === true && runtime.runtime?.mnnEnabled === true;
    setAsset(next);
    setReady(nextReady);
    onReadyChange?.(nextReady);
    onStateChange?.({ base: next, runtime });
  }, [onReadyChange, onStateChange]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    let dispose: (() => Promise<void>) | undefined;
    void subscribeNativeAssetProgress((event) => {
      if (event.assetId !== QWEN4B_HEALTH_ASSET) return;
      setAsset((current) => ({
        ...current,
        id: QWEN4B_HEALTH_ASSET,
        kind: 'base',
        name: current?.name || 'Qwen3-4B 健康文本基座',
        state: event.phase === 'done' ? 'installed' : 'downloading',
        installed: event.phase === 'done',
        downloaded: event.downloaded,
        total: event.total,
      }));
      if (event.phase === 'done') void refresh();
    }).then((value) => { dispose = value; });
    return () => { if (dispose) void dispose(); };
  }, [refresh]);

  const install = async () => {
    if (!native || busy) return;
    setBusy(true); setMessage('');
    try {
      const assets = await installEdgeAsset(QWEN4B_HEALTH_ASSET, QWEN4B_HEALTH_RELEASE);
      const installed = assets.find((item) => item.id === QWEN4B_HEALTH_ASSET);
      if (!installed?.installed || installed.filesVerified !== true) throw new Error(installed?.error || '4B 资产未通过校验');
      const runtime = await getEdgeRuntimeStatus();
      await configureEdgeRuntime(true, runtime.runtime?.sme2Requested ?? true);
      setMessage('已安装；健康 Skills 可显式调用 4B 解释层。');
      await refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const uninstall = async () => {
    if (!native || busy) return;
    setBusy(true); setMessage('');
    try {
      await uninstallEdgeAsset(QWEN4B_HEALTH_ASSET);
      setMessage('已移除 4B 健康基座；确定性安全门仍可用。');
      await refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const total = asset?.total || QWEN4B_HEALTH_RELEASE.bytes;
  const downloaded = asset?.downloaded || 0;
  const progress = total ? Math.min(100, Math.round(downloaded / total * 100)) : 0;

  return <section className="mt-3 border-2 border-black bg-[#e8f8ef] p-3">
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1"><div className="font-pixel text-[7px]">HEALTH TEXT BASE</div><b className="text-[11px]">Qwen3-4B 4bit · MNN 3.6.1</b></div>
      <span className="border border-black bg-white px-2 py-1 font-pixel text-[5px]">{ready ? '4B READY' : asset?.state === 'downloading' ? `${progress}%` : asset?.installed ? '已安装' : '可选'}</span>
    </div>
    {asset?.state === 'downloading' && <div className="mt-2 h-2 overflow-hidden border border-black bg-white"><div className="h-full bg-[#00ee86]" style={{ width: `${progress}%` }} /></div>}
    <p className="mt-2 text-[8px] leading-relaxed text-black/55">只处理已结构化的健康事件和规则结果；不读原始视频，不覆盖强度/停止规则。需额外 {formatGiB(QWEN4B_HEALTH_RELEASE.bytes)} 模型空间，推理前要求约 3.25GB 可用内存；与现有 2B/VL 会话互斥加载。</p>
    <div className="mt-2 flex gap-2">
      {!asset?.installed && <button type="button" disabled={!native || busy} onClick={() => void install()} className="flex flex-1 items-center justify-center gap-1 border-2 border-black bg-black px-2 py-2 text-[8px] font-bold text-[#7dffb8] disabled:opacity-35"><Download className="h-3 w-3" />安装官方 4B 基座</button>}
      {asset?.installed && <div className="flex flex-1 items-center justify-center gap-1 border-2 border-black bg-white px-2 py-2 text-[8px] font-bold"><Check className="h-3 w-3" />SHA-256 已校验</div>}
      {asset?.installed && <button type="button" disabled={!native || busy} onClick={() => void uninstall()} className="flex items-center gap-1 border-2 border-black bg-white px-2 py-2 text-[8px] disabled:opacity-35"><Trash2 className="h-3 w-3" />移除</button>}
    </div>
    {busy && <div className="mt-2 flex items-center gap-1 text-[8px]"><Loader2 className="h-3 w-3 animate-spin" />正在校验资产与运行时…</div>}
    {message && <div className="mt-2 border-l-2 border-black pl-2 text-[8px] text-black/60">{message}</div>}
    {!native && <div className="mt-2 text-[7px] text-black/45">安装仅在 Android ARM64 原生 MNN 中开放；网页不会用 WebLLM 冒充 4B。</div>}
  </section>;
}
