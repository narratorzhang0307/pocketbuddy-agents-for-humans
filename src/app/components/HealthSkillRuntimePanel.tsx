import { useEffect, useMemo, useState } from 'react';
import { Activity, Database, RefreshCw, Search, Upload } from 'lucide-react';
import {
  auditEndurancePrescription,
  validateTrainingPrescription,
  type GarminReadOperation,
  type ReadinessDecision,
  type TrainingIntensity,
} from '../../../frost-agent/skills/health/foundation';
import { CN_FOOD_LIBRARY, searchCnFoods } from '../../../frost-agent/skills/health/cnFoodLibrary';
import { APPLE_HEALTH_FIELD_MAP } from '../../../frost-agent/skills/health/evidenceReport';
import { explainHealthDecisionWithServerModel } from '../../../frost-agent/skills/health/serverModelControl';
import {
  getHealthSkillBridgeStatus,
  getHealthsyncImportStatus,
  lookupOpenFoodFacts,
  queryGarmin,
  queryHealthsync,
  uploadAppleHealthExport,
  type HealthSkillBridgeStatus,
  type OpenFoodFactsProduct,
} from '../lib/health/foundationBridge';

interface Props {
  skillId: string;
  readiness: ReadinessDecision;
}

const HEALTHSYNC_METRICS = ['sleep', 'steps', 'hrv', 'resting-heart-rate', 'heart-rate', 'workouts', 'vo2max', 'running-speed', 'running-power'];
const GARMIN_OPERATIONS: GarminReadOperation[] = ['auth-status', 'activities', 'sleep', 'steps', 'hrv', 'resting-heart-rate', 'training-status', 'training-readiness', 'body-battery'];
const ACCENT = '#00ee86';

function Result({ value }: { value: unknown }) {
  if (!value) return null;
  return <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap border-2 border-black bg-[#111] p-2 text-[8px] leading-relaxed text-[#7dffb8]">{JSON.stringify(value, null, 2)}</pre>;
}

function ActionButton({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="border-2 border-black px-3 py-2 text-[9px] font-black disabled:cursor-not-allowed disabled:opacity-35" style={{ background: disabled ? '#ddd' : ACCENT }}>{children}</button>;
}

function ConnectorBadge({ status }: { status?: { available: boolean; reason?: string } }) {
  return <span className="border border-black bg-white px-2 py-1 font-pixel text-[5px]">{status?.available ? 'LOCAL READY' : status?.reason === 'not_installed' ? 'CLI 未安装' : 'LOCAL OFF'}</span>;
}

export default function HealthSkillRuntimePanel({ skillId, readiness }: Props) {
  const needsConnector = skillId === 'frost.healthsync' || skillId === 'frost.garmin-readonly';
  const [bridge, setBridge] = useState<HealthSkillBridgeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<unknown>(null);
  const [metric, setMetric] = useState('sleep');
  const [from, setFrom] = useState('');
  const [healthFile, setHealthFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState<Record<string, unknown> | null>(null);
  const [garminOperation, setGarminOperation] = useState<GarminReadOperation>('training-readiness');
  const [date, setDate] = useState('');
  const [foodQuery, setFoodQuery] = useState('');
  const [offProducts, setOffProducts] = useState<OpenFoodFactsProduct[]>([]);
  const [cnQuery, setCnQuery] = useState('');
  const [intensity, setIntensity] = useState<TrainingIntensity>('moderate');
  const [duration, setDuration] = useState(45);
  const [modelBusy, setModelBusy] = useState(false);
  const [modelExplanation, setModelExplanation] = useState('');

  useEffect(() => {
    if (!needsConnector) return;
    const controller = new AbortController();
    getHealthSkillBridgeStatus(controller.signal).then(setBridge).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
    return () => controller.abort();
  }, [needsConnector]);

  useEffect(() => {
    if (importStatus?.status !== 'running' && importStatus?.status !== 'receiving') return;
    const timer = window.setInterval(() => {
      getHealthsyncImportStatus().then(setImportStatus).catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [importStatus?.status]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { setResult(await action()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };

  const prescription = useMemo(() => {
    const draft = {
      intensity,
      durationMin: duration,
      stopRules: ['出现胸痛、眩晕、异常呼吸困难或影响步态的疼痛时立即停止'],
      evidenceIds: ['readiness-current'],
    };
    return skillId === 'frost.endurance-guard'
      ? auditEndurancePrescription({ prescription: draft, readiness, dataReadAt: new Date().toISOString(), sourceEventIds: ['readiness-current'], progressionVariables: [] })
      : validateTrainingPrescription(draft, readiness);
  }, [duration, intensity, readiness, skillId]);

  const explain = async () => {
    if (skillId !== 'frost.running-coach' && skillId !== 'frost.endurance-guard') return;
    setModelBusy(true); setError(''); setModelExplanation('');
    try {
      const response = await explainHealthDecisionWithServerModel({ skillId, readiness, validation: prescription });
      if (response.backend !== 'server') throw new Error(response.error || 'server_model_unavailable');
      setModelExplanation(response.text);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setModelBusy(false);
    }
  };

  if (skillId === 'frost.running-coach' || skillId === 'frost.endurance-guard') {
    return <section className="mt-3 border-2 border-black bg-white p-3">
      <div className="flex items-center gap-2"><Activity className="h-5 w-5" /><h2 className="font-pixel text-[8px]">PRESCRIPTION GATE</h2></div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-[8px] font-bold">计划强度<select value={intensity} onChange={(event) => setIntensity(event.target.value as TrainingIntensity)} className="mt-1 w-full border-2 border-black bg-[#f7f1df] px-2 py-2 text-[10px]">{['recovery', 'easy', 'moderate', 'hard'].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="text-[8px] font-bold">时长 min<input type="number" min={0} max={300} value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="mt-1 w-full border-2 border-black bg-[#f7f1df] px-2 py-2 text-[10px]" /></label>
      </div>
      <div className="mt-2 border-2 border-black p-2 text-[9px]" style={{ background: prescription.ok ? '#dff5e9' : '#ffd9d2' }}>
        <b>{prescription.ok ? 'PASS' : 'DOWNGRADE'}</b> · 最终 {prescription.conservative.intensity.toUpperCase()} / {prescription.conservative.durationMin} min
        {!prescription.ok && <div className="mt-1 text-[8px]">{prescription.errors.join(' · ')}</div>}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <ActionButton disabled={modelBusy} onClick={() => void explain()}>{modelBusy ? '服务端生成中…' : '用服务端模型解释已校验结果'}</ActionButton>
        <span className="text-[7px] text-black/45">模型只解释，PASS / DOWNGRADE 由上方规则确定。</span>
      </div>
      {error && <p className="mt-2 text-[8px] font-bold text-red-700">{error}</p>}
      {modelExplanation && <div className="mt-2 whitespace-pre-wrap border-2 border-black bg-[#111] p-2 text-[8px] leading-relaxed text-[#7dffb8]">{modelExplanation}</div>}
    </section>;
  }

  if (skillId === 'frost.healthsync') {
    const available = bridge?.healthsync.available === true;
    return <section className="mt-3 border-2 border-black bg-white p-3">
      <div className="flex items-center justify-between gap-2"><h2 className="font-pixel text-[8px]">APPLE HEALTH LOCAL ADAPTER</h2><ConnectorBadge status={bridge?.healthsync} /></div>
      <p className="mt-2 text-[8px] text-black/55">ZIP/XML 只流向本机 Frost 服务并由 healthsync 去重；线上桥默认关闭。</p>
      <div className="mt-3 flex flex-wrap items-center gap-2"><input type="file" accept=".zip,.xml,application/zip,application/xml,text/xml" onChange={(event) => setHealthFile(event.target.files?.[0] || null)} className="min-w-0 flex-1 text-[8px]" /><ActionButton disabled={!available || !healthFile || busy} onClick={() => void run(async () => { const job = await uploadAppleHealthExport(healthFile!); setImportStatus(job); return job; })}><Upload className="mr-1 inline h-3 w-3" />导入</ActionButton></div>
      {importStatus && <div className="mt-2 border border-black bg-[#fff5cc] p-2 text-[8px]">导入状态：{String(importStatus.status)} {importStatus.receivedBytes ? `· ${Math.round(Number(importStatus.receivedBytes) / 1024 / 1024)} MB` : ''}</div>}
      <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2"><select value={metric} onChange={(event) => setMetric(event.target.value)} className="border-2 border-black bg-[#f7f1df] px-2 text-[9px]">{HEALTHSYNC_METRICS.map((value) => <option key={value}>{value}</option>)}</select><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="border-2 border-black bg-[#f7f1df] px-2 text-[9px]" /><ActionButton disabled={!available || busy} onClick={() => void run(() => queryHealthsync({ metric, from: from || undefined, limit: 50 }))}>查询</ActionButton></div>
      {error && <p className="mt-2 text-[8px] font-bold text-red-700">{error}</p>}<Result value={result} />
    </section>;
  }

  if (skillId === 'frost.garmin-readonly') {
    const available = bridge?.garmin.available === true;
    return <section className="mt-3 border-2 border-black bg-white p-3">
      <div className="flex items-center justify-between gap-2"><h2 className="font-pixel text-[8px]">GARMIN READ-ONLY ADAPTER</h2><ConnectorBadge status={bridge?.garmin} /></div>
      <p className="mt-2 text-[8px] text-black/55">仅开放活动、睡眠、HRV、心率和训练状态读取；上传、删除、体重写入不在 API 中。</p>
      <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2"><select value={garminOperation} onChange={(event) => setGarminOperation(event.target.value as GarminReadOperation)} className="border-2 border-black bg-[#f7f1df] px-2 text-[9px]">{GARMIN_OPERATIONS.map((value) => <option key={value}>{value}</option>)}</select><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="border-2 border-black bg-[#f7f1df] px-2 text-[9px]" /><ActionButton disabled={!available || busy} onClick={() => void run(() => queryGarmin({ operation: garminOperation, date: date || undefined }))}>读取</ActionButton></div>
      {error && <p className="mt-2 text-[8px] font-bold text-red-700">{error}</p>}<Result value={result} />
    </section>;
  }

  if (skillId === 'frost.openfoodfacts') {
    return <section className="mt-3 border-2 border-black bg-white p-3">
      <div className="flex items-center gap-2"><Search className="h-5 w-5" /><h2 className="font-pixel text-[8px]">PACKAGED FOOD LOOKUP</h2></div>
      <div className="mt-3 flex gap-2"><input value={foodQuery} onChange={(event) => setFoodQuery(event.target.value)} placeholder="条码或商品名" className="min-w-0 flex-1 border-2 border-black bg-[#f7f1df] px-2 py-2 text-[10px]" /><ActionButton disabled={!foodQuery.trim() || busy} onClick={() => void run(async () => { const response = await lookupOpenFoodFacts(foodQuery); setOffProducts(response.products); return null; })}>查询</ActionButton></div>
      {error && <p className="mt-2 text-[8px] font-bold text-red-700">{error}</p>}
      <div className="mt-2 space-y-2">{offProducts.map((food) => <div key={`${food.barcode}-${food.name}`} className="border border-black p-2 text-[8px]"><b>{food.name || '未命名商品'}</b> · {food.brands || '品牌未知'}<div className="mt-1">每100g：{food.nutritionPer100g.energyKcal ?? '?'} kcal · 蛋白 {food.nutritionPer100g.proteinG ?? '?'}g · 脂肪 {food.nutritionPer100g.fatG ?? '?'}g · 碳水 {food.nutritionPer100g.carbsG ?? '?'}g</div><div className="mt-1 text-black/45">缺失：{food.missing.join(', ') || '无'} · Open Food Facts</div></div>)}</div>
    </section>;
  }

  if (skillId === 'frost.cn-health-library') {
    const foods = searchCnFoods(cnQuery);
    return <section className="mt-3 border-2 border-black bg-white p-3">
      <div className="flex items-center gap-2"><Database className="h-5 w-5" /><h2 className="font-pixel text-[8px]">中国食品本地参考库</h2></div>
      <div className="mt-3 flex gap-2"><input value={cnQuery} onChange={(event) => setCnQuery(event.target.value)} placeholder="例：伯牙绝弦、宫保鸡丁、Luckin" className="min-w-0 flex-1 border-2 border-black bg-[#f7f1df] px-2 py-2 text-[10px]" /><span className="grid place-items-center border-2 border-black px-2 font-pixel text-[6px]">{foods.length} HITS</span></div>
      <p className="mt-2 text-[8px] text-black/50">{CN_FOOD_LIBRARY.length} 条本地食品参考 · {Object.keys(APPLE_HEALTH_FIELD_MAP).length} 个 HealthKit 字段白名单 · 周报只汇总已确认事件。带 ~ 的数值为估算，不能替代包装标签或称重。</p>
      <div className="mt-2 space-y-2">{foods.map((food) => <div key={food.id} className="border border-black p-2 text-[8px]"><b>{food.name}</b> · {food.brand}<div className="mt-1">{food.portion || food.energyBasis}：{food.energyText} kcal {food.proteinText ? `· 蛋白 ${food.proteinText}g` : ''}</div><div className="mt-1 text-black/45">{food.category} · {food.approximate ? '估算参考' : '参考值'} · health-coach/cn-brands</div></div>)}</div>
    </section>;
  }

  return <section className="mt-3 border-2 border-black bg-white p-3 text-[9px]"><RefreshCw className="mr-2 inline h-4 w-4" />运行能力由现有 Her Motion 本地链路提供。</section>;
}
