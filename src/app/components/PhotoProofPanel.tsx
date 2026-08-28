import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Cpu, Database, Download, FileCheck2, RefreshCw, ShieldCheck } from 'lucide-react';
import { getEdgeApkEvidence, getEdgeAssets, getEdgeRuntimeStatus } from '../../../frost-agent/edge/httpEdge';
import type { EdgeAssetStatus, EdgeResponse } from '../../../frost-agent/edge/types';
import type { PhotoRuntimeStatus } from '../../../frost-agent/edge/httpPhotoEdge';
import {
  getPhotoInferenceEvidence, serializePhotoInferenceEvidence, type PhotoInferenceEvidenceEvent,
} from '../lib/photo';

const short = (value: string | undefined, length = 12): string => value ? value.slice(0, length) : '—';
const ms = (value: number | undefined): string => value == null ? '—' : `${Math.round(value)}ms`;
const memory = (event?: PhotoInferenceEvidenceEvent): string => {
  const value = event?.metrics.appPssMb ?? event?.metrics.currentRssMb;
  return value == null ? '—' : `${Math.round(value)}MB`;
};
const downloadJson = (filename: string, body: string) => {
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

function ProofMetric({ label, value, good }: { label: string; value: string | number; good?: boolean }) {
  return <div className={`border border-black/35 px-1.5 py-2 text-center ${good ? 'bg-[#eaffdf]' : 'bg-white'}`}><div className="font-pixel text-[10px]">{value}</div><div className="mt-0.5 text-[6.5px] text-black/45">{label}</div></div>;
}

export default function PhotoProofPanel({ runtime }: { runtime: PhotoRuntimeStatus }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<PhotoInferenceEvidenceEvent[]>([]);
  const [status, setStatus] = useState<EdgeResponse | null>(null);
  const [assets, setAssets] = useState<EdgeAssetStatus[]>([]);
  const [apk, setApk] = useState<EdgeResponse['apkEvidence']>();
  const [message, setMessage] = useState('');
  const latest = events.at(-1);
  const baseAsset = useMemo(() => assets.find((asset) => asset.id === 'qwen3-vl-2b-mnn'), [assets]);
  const nativeBridge = status?.runtime?.nativeBridge ?? runtime.nativeBridge ?? false;
  const cpuTarget = latest?.cpuTarget ?? status?.runtime?.cpuTarget ?? runtime.cpuTarget;
  const sme2Effective = latest?.sme2Effective ?? status?.runtime?.sme2Effective ?? runtime.sme2Effective ?? false;
  const hardwareSme2 = latest?.hardwareSme2 ?? status?.runtime?.hardware?.sme2 ?? runtime.hardwareSme2;

  const refresh = async () => {
    setBusy(true); setMessage('');
    try {
      const [stored, runtimeStatus, installed] = await Promise.all([
        getPhotoInferenceEvidence(), getEdgeRuntimeStatus(), getEdgeAssets(),
      ]);
      setEvents(stored); setStatus(runtimeStatus); setAssets(installed);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };

  useEffect(() => { if (expanded) void refresh(); }, [expanded]);

  const readApk = async () => {
    setBusy(true); setMessage('APK SHA 只在你明确点击后读取…');
    try { setApk(await getEdgeApkEvidence()); setMessage('APK 证据已读取。'); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };

  const exportEvidence = () => downloadJson(
    `pocket-earth-photo-proof-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    JSON.stringify({
      schema: 'pocket-earth.photo-proof-export/v1', exportedAt: new Date().toISOString(),
      runtime: status?.runtime, baseAsset, apk, inference: JSON.parse(serializePhotoInferenceEvidence(events)),
    }, null, 2),
  );

  return <section className="overflow-hidden border-2 border-black bg-[#f8fff3]">
    <button onClick={() => setExpanded((value) => !value)} className="flex w-full items-center justify-between gap-2 bg-[#f8fff3] px-3 py-2.5 text-left">
      <div className="flex min-w-0 items-center gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-[#087a43]" /><div className="min-w-0"><div className="font-pixel text-[9px]">ON-DEVICE PROOF · 端侧证据</div><div className="mt-0.5 truncate text-[7px] text-black/45">默认折叠 · 真实 MNN/SME2/质量门 · 不存原片与 OCR 正文</div></div></div>
      <div className="flex shrink-0 items-center gap-2"><span className={`border border-black px-1.5 py-0.5 font-pixel text-[6px] ${nativeBridge ? 'bg-[#7CFF6B]' : 'bg-[#fff1c7]'}`}>{nativeBridge ? 'ANDROID NATIVE' : 'WEB PREVIEW'}</span>{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</div>
    </button>
    {expanded && <div className="border-t-2 border-black bg-[#f4f2e9] p-3">
      <div className="grid grid-cols-4 gap-1.5"><ProofMetric label="证据样本" value={events.length} /><ProofMetric label="CPU TARGET" value={cpuTarget ?? '—'} good={cpuTarget === 3} /><ProofMetric label="SME2 EFFECTIVE" value={sme2Effective ? 'YES' : nativeBridge && hardwareSme2 === false ? 'N/A' : '未证明'} good={sme2Effective} /><ProofMetric label="网络请求" value={latest?.networkRequests === 0 ? '0' : '未证明'} good={latest?.networkRequests === 0} /></div>

      <div className="mt-2 grid grid-cols-3 gap-1.5"><ProofMetric label="总耗时" value={ms(latest?.metrics.elapsedMs)} /><ProofMetric label="TTFA" value={ms(latest?.metrics.ttfaMs)} /><ProofMetric label="PSS / RSS" value={memory(latest)} /></div>

      <div className="mt-2 border border-black/25 bg-white p-2 text-[7.5px] leading-relaxed text-black/60">
        <div className="flex items-center gap-1 font-pixel text-[7px] text-black"><Cpu className="h-3 w-3 text-[#087a43]" />{status?.runtime?.version || runtime.version || runtime.runtime} · {latest?.model || runtime.baseModel}</div>
        <div className="mt-1">Bridge: {nativeBridge ? 'Capacitor → Java → JNI' : '网页/服务器预览，不作为真机证据'} · Hardware SME2: {hardwareSme2 == null ? '待真机' : hardwareSme2 ? 'YES' : 'NO'}</div>
        <div>Base manifest: {short(baseAsset?.manifestSha256)} · filesVerified: {baseAsset?.filesVerified === true ? 'YES' : baseAsset?.filesVerified === false ? 'NO' : '待读取'}</div>
        <div>最新路由: {latest ? `${latest.task} · ${latest.qualityGate} · ${short(latest.outputSha256)}` : '尚无真实推理样本'}</div>
        {latest && <div className="truncate">Evidence: {short(latest.id, 18)} · Asset: {short(latest.assetKey, 18)}</div>}
        {apk?.sha256 && <div>APK SHA256: {short(apk.sha256, 20)} · {apk.versionName || '—'} ({apk.versionCode || '—'})</div>}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <button disabled={busy} onClick={() => void refresh()} className="flex items-center justify-center gap-1 border border-black bg-white py-1.5 text-[7.5px] font-bold disabled:opacity-40"><RefreshCw className={`h-3 w-3 ${busy ? 'animate-spin' : ''}`} />刷新</button>
        <button disabled={busy} onClick={() => void readApk()} className="flex items-center justify-center gap-1 border border-black bg-white py-1.5 text-[7.5px] font-bold disabled:opacity-40"><FileCheck2 className="h-3 w-3" />读取 APK SHA</button>
        <button disabled={!events.length} onClick={exportEvidence} className="flex items-center justify-center gap-1 border border-black bg-[#7CFF6B] py-1.5 text-[7.5px] font-bold disabled:bg-white disabled:opacity-40"><Download className="h-3 w-3" />导出 JSON</button>
      </div>
      <div className="mt-2 flex items-start gap-1 text-[7px] leading-relaxed text-black/45"><Database className="mt-0.5 h-3 w-3 shrink-0" />每次 Qwen/OCR 返回后立即事务落盘。仅保存 asset key、版本、运行指标、质量门和输出 SHA；崩溃、锁屏或退出不会丢失早先样本。</div>
      {message && <div className="mt-2 border-l-2 border-black pl-2 text-[7px] text-black/55">{message}</div>}
    </div>}
  </section>;
}
