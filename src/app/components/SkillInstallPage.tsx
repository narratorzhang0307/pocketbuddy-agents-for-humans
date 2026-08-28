import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Cpu, Database, Download, Lock, PackageCheck, Play, ShieldCheck, X } from 'lucide-react';
import {
  cancelSkillPreparation, ensureBuiltinSkills, getEquippedSkill, getInstalledSkill,
  prepareAndEquipSkill, subscribeSkillsRegistry, type SkillManifest,
} from '../lib/skill';
import { skillPublisherForManifest } from '../data/skillPublishers';

const ACCENT = '#326B55';
const PILL = 'inline-flex items-center gap-1 border border-black/45 bg-[#f3f1e8] px-1.5 py-0.5 text-[8px]';
const KIND_LABEL = { markdown: 'Markdown', lora: 'LoRA', hybrid: '混合 Skill' } as const;

const bytesLabel = (bytes: number): string => {
  if (!bytes) return '无需下载模型';
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
};

const shortHash = (value: string): string => `${value.slice(0, 12)}…${value.slice(-6)}`;

export default function SkillInstallPage({ manifest, onBack, onRun }: { manifest: SkillManifest; onBack: () => void; onRun: (target: string) => void }) {
  const [version, setVersion] = useState(0);
  const [progress, setProgress] = useState(0);
  const [currentAsset, setCurrentAsset] = useState('');
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const key = `${manifest.identity.id}@${manifest.identity.version}`;
  const publisher = skillPublisherForManifest(manifest.identity.id);
  const installed = useMemo(() => getInstalledSkill(key), [key, version]);
  const equipped = getEquippedSkill(manifest.identity.id)?.key === key;
  const preparing = installed?.status === 'downloading' || installed?.status === 'verifying';
  const assetBytes = manifest.assets.reduce((sum, asset) => sum + asset.bytes, 0);

  useEffect(() => {
    ensureBuiltinSkills();
    window.scrollTo(0, 0);
    return subscribeSkillsRegistry(() => setVersion((value) => value + 1));
  }, []);

  const install = async () => {
    const skill = getInstalledSkill(key);
    if (!skill || preparing) return;
    setError(''); setProgress(0); setCurrentAsset('');
    const controller = new AbortController(); abortRef.current = controller;
    try {
      await prepareAndEquipSkill(skill.key, {
        signal: controller.signal,
        onProgress: (value) => {
          setCurrentAsset(value.assetId);
          setProgress(value.total ? Math.min(100, Math.round(value.downloaded / value.total * 100)) : value.phase === 'done' ? 100 : 0);
        },
      });
      setProgress(100);
    } catch (reason) {
      if (!controller.signal.aborted) setError(String(reason));
    } finally { abortRef.current = null; }
  };

  const cancel = async () => {
    abortRef.current?.abort();
    if (installed) await cancelSkillPreparation(installed.key);
    setCurrentAsset(''); setProgress(0);
  };

  return <div className="flex h-full flex-col overflow-hidden bg-[#eaeaea] text-black">
    <header className="flex shrink-0 items-center gap-2 border-b-2 border-black bg-white px-3 py-2.5">
      <button type="button" aria-label="返回 Skills" onClick={onBack} className="grid h-9 w-9 place-items-center border-2 border-black bg-white active:translate-y-px"><ArrowLeft className="h-4 w-4" strokeWidth={3} /></button>
      <div className="min-w-0 flex-1"><div className="font-pixel text-[10px] tracking-wider">SKILL 详情 / 安装</div><div className="mt-0.5 truncate text-[8px] text-black/45">只处理当前 Skill · 不跳转 Skills Plaza</div></div>
      <PackageCheck className="h-5 w-5" style={{ color: ACCENT }} />
    </header>

    <main className="flex-1 space-y-2.5 overflow-y-auto p-3 pb-24">
      <section className="border-[3px] border-black bg-white">
        <div className="flex items-start gap-3 p-3">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border-[3px] border-black bg-[#f5efdf]"><img src={publisher.avatar} alt={`${publisher.name}的发布者头像`} className="h-full w-full object-contain" /></div>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><h1 className="font-pixel text-[12px] tracking-wide">{manifest.identity.name}</h1><span className="text-[8px] text-black/35">v{manifest.identity.version}</span></div><p className="mt-1 text-[9px] font-bold text-[#18784b]">{publisher.name} · {publisher.role} 发布</p><p className="mt-2 text-[10px] leading-relaxed text-black/60">{manifest.identity.description}</p></div>
        </div>
        <div className={`flex items-center gap-2 border-t-2 border-black px-3 py-2 ${equipped ? 'bg-[#e8f8ef]' : 'bg-[#f7f1df]'}`}>
          {equipped ? <Check className="h-4 w-4 text-[#087c49]" /> : <Download className="h-4 w-4 text-[#7a4a00]" />}
          <b className="text-[9px]">{equipped ? '已装入这台手机的私人系统' : preparing ? `正在安装 ${progress}%` : installed?.status === 'failed' ? '上次安装未完成，可以重试' : '等待安装'}</b>
        </div>
      </section>

      <section className="border-2 border-black bg-white p-2.5">
        <h2 className="font-pixel text-[9px]">安装内容</h2>
        <div className="mt-2 flex flex-wrap gap-1"><span className={PILL}><PackageCheck className="h-2.5 w-2.5" />{KIND_LABEL[manifest.kind]}</span><span className={PILL}><Cpu className="h-2.5 w-2.5" />{manifest.runtime.execution === 'mnn' ? 'Qwen + MNN' : '本地工作流'}</span><span className={PILL}><Download className="h-2.5 w-2.5" />{bytesLabel(assetBytes)}</span><span className={PILL}><Lock className="h-2.5 w-2.5" />只写私人库</span></div>
        {manifest.runtime.base && <div className="mt-2 border-2 border-black bg-[#dceff3] p-2 text-[8px]"><b className="block">共享 Qwen 基座</b><span className="mt-0.5 block text-black/50">{manifest.runtime.base.id} · {manifest.runtime.base.revision}</span><span className="mt-0.5 block break-all font-mono text-[7px] text-black/35">SHA256 {shortHash(manifest.runtime.base.sha256)}</span></div>}
        <div className="mt-2 space-y-1.5">{manifest.assets.map((asset) => <div key={asset.id} className="border border-black/25 bg-[#f5f5f5] p-2 text-[8px]"><div className="flex items-center gap-2"><b className="min-w-0 flex-1 truncate">{asset.id}</b><span>{bytesLabel(asset.bytes)}</span></div><div className="mt-1 break-all font-mono text-[7px] text-black/35">SHA256 {shortHash(asset.sha256)}</div></div>)}{!manifest.assets.length && <div className="border border-black/20 bg-[#f5f5f5] p-2 text-[8px] text-black/45">这是轻量内容 Skill，不下载模型权重。</div>}</div>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <div className="border-2 border-black bg-white p-2.5"><div className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /><b className="text-[9px]">权限</b></div><p className="mt-1.5 text-[8px] leading-relaxed text-black/50">{manifest.permissions.scopes.length ? manifest.permissions.scopes.join(' · ') : '无额外权限'}</p></div>
        <div className="border-2 border-black bg-white p-2.5"><div className="flex items-center gap-1.5"><Database className="h-3.5 w-3.5" /><b className="text-[9px]">数据</b></div><p className="mt-1.5 text-[8px] leading-relaxed text-black/50">{manifest.data.schemas.length ? manifest.data.schemas.join(' · ') : '不新增数据结构'}</p></div>
      </section>

      <details className="border-2 border-black bg-white"><summary className="flex cursor-pointer list-none items-center gap-2 p-2.5"><ShieldCheck className="h-4 w-4 text-[#18784b]" /><b className="font-pixel text-[8px]">质量保障</b><span className="ml-auto text-[7px] text-[#18784b]">{manifest.evaluation.passed ? '已通过发布门' : '待完成'}</span></summary><div className="border-t-2 border-black p-2.5 text-[8px] leading-relaxed text-black/55"><ol className="list-decimal space-y-1 pl-4">{manifest.quality_gate.checks.map((check) => <li key={check}>{check}</li>)}</ol></div></details>

      {(preparing || progress > 0) && <section className="border-2 border-black bg-[#fff8e6] p-2.5"><div className="flex items-center justify-between text-[8px]"><b>{preparing ? '正在下载并校验' : equipped ? '安装完成' : '准备安装'}</b><span className="font-mono">{progress}%</span></div><div className="mt-1.5 h-3 overflow-hidden border-2 border-black bg-white"><div className="h-full bg-[#00ff88]" style={{ width: `${progress}%` }} /></div>{currentAsset && <p className="mt-1 truncate font-mono text-[7px] text-black/40">{currentAsset}</p>}</section>}
      {(error || installed?.error) && <div className="border-2 border-[#b3261e] bg-[#fff0ed] p-2.5 text-[8px] leading-relaxed text-[#b3261e]">{error || installed?.error}</div>}

      <section className="sticky bottom-0 flex gap-2 border-[3px] border-black bg-[#f7f1df] p-2.5">
        {equipped ? <button type="button" onClick={() => onRun(manifest.entry.target)} className="flex flex-1 items-center justify-center gap-1.5 border-2 border-black bg-black py-2.5 text-[10px] font-black text-[#7CFF6B]"><Play className="h-4 w-4" />打开 Skill</button>
          : preparing ? <button type="button" onClick={() => void cancel()} className="flex flex-1 items-center justify-center gap-1.5 border-2 border-black bg-white py-2.5 text-[10px] font-black text-[#b3261e]"><X className="h-4 w-4" />取消安装</button>
            : <button type="button" onClick={() => void install()} disabled={!installed} className="flex flex-1 items-center justify-center gap-1.5 border-2 border-black bg-[#00ff88] py-2.5 text-[10px] font-black disabled:opacity-35"><Download className="h-4 w-4" />{installed?.status === 'failed' ? '重试安装' : '安装这个 Skill'}</button>}
        {!equipped && <button type="button" onClick={() => onRun(manifest.entry.target)} title="不下载权重，只查看这个 Skill 的功能页面" className="flex items-center justify-center gap-1 border-2 border-black bg-white px-3 text-[9px] font-bold"><Play className="h-3.5 w-3.5" />先预览</button>}
      </section>
    </main>
  </div>;
}
