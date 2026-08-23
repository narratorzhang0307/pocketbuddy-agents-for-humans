import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, Cloud, CloudDownload, Database, Lock, PackageCheck, PawPrint, Play, RotateCcw, ShieldCheck, Trash2, X } from 'lucide-react';
import {
  BUILTIN_SKILLS,
  ensureBuiltinSkills,
  getEquippedSkill,
  installSkillFromUrl,
  listInstalledSkills,
  prepareAndEquipSkill,
  cancelSkillPreparation,
  rollbackSkill,
  skillProtocolErrorMessage,
  subscribeSkillsRegistry,
  uninstallSkillWithAssets,
  type InstalledSkill,
  type SkillManifest,
} from '../lib/skill';
import { skillPublisherForManifest, type SkillPublisher } from '../data/skillPublishers';

interface Props {
  onBack: () => void;
  onRun: (target: string) => void;
  backLabel?: string;
  title?: string;
  subtitle?: string;
  manifestIds?: string[];
  networkLabel?: string;
}

const ACCENT = '#326B55';
const PILL = 'inline-flex items-center gap-1 border border-black/50 bg-[#f2f0e8] px-1.5 py-0.5 text-[8px] tracking-wide';
const KIND_LABEL = { markdown: 'Markdown', lora: 'LoRA', hybrid: '混合 Skill' } as const;

function runtimeLabel(manifest: SkillManifest): string {
  return manifest.permissions.scopes.includes('network') ? '服务端连接' : '服务端编排';
}

function bytesLabel(bytes: number): string {
  if (!bytes) return '轻量';
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)}MB`;
}

function SkillCard({ manifest, installed, publisher, onRun }: { manifest: SkillManifest; installed?: InstalledSkill; publisher: SkillPublisher; onRun: (target: string) => void }) {
  const [progress, setProgress] = useState(0);
  const [localError, setLocalError] = useState('');
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const equipped = getEquippedSkill(manifest.identity.id)?.key === installed?.key;
  const canRollback = !!installed?.previousKey;
  const preparing = installed?.status === 'downloading' || installed?.status === 'verifying';
  const install = async () => {
    const skill = installed || (() => { throw new Error('内置 Skill 尚未注册'); })();
    setLocalError(''); setProgress(0);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      await prepareAndEquipSkill(skill.key, {
        signal: controller.signal,
        onProgress: (value) => setProgress(value.total ? Math.min(100, Math.round(value.downloaded / value.total * 100)) : value.phase === 'done' ? 100 : 0),
      });
    } catch (reason) {
      if (!controller.signal.aborted) setLocalError(String(reason));
    } finally { abortRef.current = null; }
  };
  const cancel = async () => {
    abortRef.current?.abort();
    if (installed) await cancelSkillPreparation(installed.key);
  };
  const remove = async () => {
    if (!installed) return;
    setLocalError('');
    try { await uninstallSkillWithAssets(installed.key); }
    catch (reason) { setLocalError(String(reason)); }
  };
  return (
    <article className="border-2 border-black bg-white">
      <div className="flex items-start gap-2.5 p-2.5">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 border-black bg-[#f5efdf]">
          <img src={publisher.avatar} alt={`${publisher.name}的发布者头像`} className="h-[98%] w-[98%] object-contain" loading="lazy" draggable={false} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate font-pixel text-[9px] tracking-wide">{manifest.identity.name}</h3>
            <span className="shrink-0 text-[8px] text-black/35">v{manifest.identity.version}</span>
          </div>
          <p className="mt-0.5 truncate text-[8.5px] font-bold text-[#18784b]">{publisher.name} · {publisher.role} 发布</p>
          <p className="mt-1 overflow-hidden text-[10px] leading-snug text-black/60 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">{manifest.identity.description}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <span className={PILL}><PackageCheck className="h-2.5 w-2.5" />{KIND_LABEL[manifest.kind]}</span>
            <span className={PILL}><Cloud className="h-2.5 w-2.5" />{runtimeLabel(manifest)}</span>
            <span className={`${PILL} text-[#18784b]`}><Lock className="h-2.5 w-2.5" />只写入我的私人库</span>
          </div>
          <button type="button" aria-expanded={evidenceOpen} onClick={() => setEvidenceOpen((value) => !value)} className="mt-2 inline-flex items-center gap-1 text-[8px] font-bold text-[#326B55] underline decoration-dotted underline-offset-2">
            技术证据 <ChevronDown className={`h-3 w-3 transition-transform ${evidenceOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>
      {evidenceOpen && <div className="border-t border-black/20 bg-[#f8f6ef] px-2.5 py-2">
        <div className="flex flex-wrap gap-1">
          <span className={PILL}>{bytesLabel(manifest.assets.reduce((sum, asset) => sum + asset.bytes, 0))}</span>
          <span className={PILL}><Lock className="h-2.5 w-2.5" />{manifest.permissions.scopes.length ? manifest.permissions.scopes.join('·') : '无额外权限'}</span>
          {manifest.data.schemas.length > 0 && <span className={PILL}><Database className="h-2.5 w-2.5" />Data Pack 可替换</span>}
          <span className={`${PILL} ${manifest.evaluation.passed ? 'text-[#238c57]' : 'text-[#b3261e]'}`}><ShieldCheck className="h-2.5 w-2.5" />静态门 {Math.round(manifest.evaluation.score * 100)}%</span>
          <span className={`${PILL} text-[#238c57]`}>服务端契约已验</span>
        </div>
        {manifest.runtime.base && <p className="mt-2 break-all font-pixel text-[6px] leading-relaxed text-black/40">BASE · {manifest.runtime.base.id} / {manifest.runtime.base.revision}</p>}
        <p className="mt-1 text-[8px] leading-relaxed text-black/50">门禁：{manifest.quality_gate.checks.join('；')}</p>
        <p className="mt-1.5 border-l-2 border-[#326B55] pl-2 text-[8px] leading-relaxed text-[#326B55]">运行由可信服务端统一编排；客户端只提交已授权输入，并接收结构化结果与审计摘要。</p>
      </div>}
      <div className="flex items-center gap-1.5 border-t border-black/20 bg-[#f4f1e7] px-2.5 py-2">
        <span className={`mr-auto font-pixel text-[7px] ${equipped ? 'text-[#238c57]' : installed ? 'text-black/45' : 'text-[#b3261e]'}`}>
          {equipped ? '● 已加载到我的 Skills' : preparing ? `↓ 加载中 ${progress}%` : installed?.status === 'failed' ? '× 加载失败' : installed ? '○ 待安装' : '○ 未登记'}
        </span>
        {equipped ? <>
          <button type="button" onClick={() => onRun(manifest.entry.target)} className="flex items-center gap-1 border-2 border-black bg-black px-2 py-1 text-[9px] font-bold text-[#7CFF6B] active:translate-y-px"><Play className="h-3 w-3" />打开</button>
          <button type="button" onClick={remove} title="从我的 Skills 卸载；私人知识与 Data Pack 保留" className="flex items-center gap-1 border-2 border-black bg-white px-2 py-1 text-[8px] font-bold text-[#b3261e] active:translate-y-px"><Trash2 className="h-3 w-3" />卸载</button>
        </> : <>
          <button type="button" onClick={() => onRun(manifest.entry.target)} title="只看 Skill 说明和内置实例，不会下载模型或加载地图数据" className="flex items-center gap-1 border-2 border-black bg-white px-2 py-1 text-[9px] font-bold active:translate-y-px"><Play className="h-3 w-3" />预览</button>
          {preparing ? <button type="button" onClick={cancel} className="flex items-center gap-1 border-2 border-black bg-white px-2 py-1 text-[9px] font-bold text-[#b3261e] active:translate-y-px"><X className="h-3 w-3" />取消</button>
            : installed ? <button type="button" onClick={install} title="加载后会立即出现在你的 Skills 子页" className="flex items-center gap-1 border-2 border-black px-2 py-1 text-[8px] font-bold text-white active:translate-y-px" style={{ background: ACCENT }}><PackageCheck className="h-3 w-3" />加载到你的 Skills 中</button> : null}
        </>}
        {canRollback && <button type="button" onClick={() => rollbackSkill(manifest.identity.id)} title="回滚上一版本" className="grid h-7 w-7 place-items-center border-2 border-black bg-white active:translate-y-px"><RotateCcw className="h-3.5 w-3.5" /></button>}
        {installed && !equipped && installed.source !== 'builtin' && <button type="button" onClick={remove} title="移除 Skill 声明与未共享资产；私人知识数据保留" className="grid h-7 w-7 place-items-center border-2 border-black bg-white text-[#b3261e] active:translate-y-px"><Trash2 className="h-3.5 w-3.5" /></button>}
      </div>
      {(localError || installed?.error) && <p className="border-t border-[#b3261e]/30 bg-[#fff0ed] px-2.5 py-1.5 text-[8px] leading-snug text-[#b3261e]">{localError || installed?.error}</p>}
    </article>
  );
}

type Filter = 'all' | 'markdown' | 'lora' | 'hybrid';

export default function AgentPlazaPage({
  onBack,
  onRun,
  backLabel = '返回 Agent Worlds',
  title = 'GLOBAL SKILLS PLAZA',
  subtitle = '全球 Agent 发布 · 一键加载到你的 Skills',
  manifestIds,
  networkLabel = '决赛示例网络',
}: Props) {
  const [version, setVersion] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [manifestUrl, setManifestUrl] = useState('');
  const [installState, setInstallState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => {
    const unsubscribe = subscribeSkillsRegistry(() => setVersion((value) => value + 1));
    ensureBuiltinSkills();
    setVersion((value) => value + 1);
    return unsubscribe;
  }, []);
  const installedSkills = useMemo(() => listInstalledSkills(), [version]);
  const installed = useMemo(() => new Map(installedSkills.map((skill) => [skill.key, skill])), [installedSkills]);
  const allManifests = useMemo(() => {
    const latest = new Map<string, SkillManifest>();
    installedSkills.forEach((skill) => { if (!latest.has(skill.manifest.identity.id)) latest.set(skill.manifest.identity.id, skill.manifest); });
    const values = BUILTIN_SKILLS.map((manifest) => latest.get(manifest.identity.id) || manifest);
    const builtinIds = new Set(BUILTIN_SKILLS.map((manifest) => manifest.identity.id));
    installedSkills.forEach((skill) => {
      if (!builtinIds.has(skill.manifest.identity.id) && !values.some((item) => item.identity.id === skill.manifest.identity.id)) values.push(skill.manifest);
    });
    return values;
  }, [installedSkills]);
  const manifests = useMemo(() => allManifests.filter((manifest) => (
    (!manifestIds || manifestIds.includes(manifest.identity.id))
    && (filter === 'all' || manifest.kind === filter)
  )), [allManifests, filter, manifestIds]);
  const equippedCount = useMemo(() => allManifests.filter((manifest) => (
    (!manifestIds || manifestIds.includes(manifest.identity.id))
    && !!getEquippedSkill(manifest.identity.id)
  )).length, [allManifests, manifestIds, version]);
  const installRemote = async () => {
    if (!manifestUrl.trim() || installState === 'loading') return;
    setInstallState('loading'); setError('');
    try {
      const skill = await installSkillFromUrl(manifestUrl.trim());
      await prepareAndEquipSkill(skill.key);
      setManifestUrl(''); setInstallState('done');
    } catch (reason) {
      setError(skillProtocolErrorMessage(reason)); setInstallState('error');
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#EAEAEA] font-sans">
      <header className="flex shrink-0 items-center gap-2 border-b-2 border-black bg-white px-3 py-2.5">
        <button type="button" onClick={onBack} aria-label={backLabel} className="grid h-9 w-9 place-items-center border-2 border-black bg-white active:translate-y-px"><ChevronLeft className="h-4 w-4" strokeWidth={3} /></button>
        <div className="min-w-0 flex-1"><div className="truncate font-pixel text-[10px] tracking-wider">{title}</div><div className="mt-0.5 truncate text-[9px] text-black/45">{subtitle}</div></div>
        <PawPrint className="h-5 w-5" style={{ color: ACCENT }} />
      </header>

      <div className="flex shrink-0 items-center justify-between border-b-2 border-black bg-black px-4 py-2.5 font-pixel text-[7px] tracking-wider text-[#7CFF6B]">
        <span>{manifests.length} 个发布</span><span>{equippedCount} 已加载</span><span>只写私人库</span><span>{networkLabel}</span>
      </div>

      <main className="flex-1 space-y-2.5 overflow-y-auto px-3 py-2.5">
        <section className="border-2 border-black bg-white p-3">
          <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" style={{ color: ACCENT }} /><b className="text-[11px]">全球发现 · 加载到我的 Skills</b></div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-black/60">世界广场负责发现发布者。每个 Skill 先校验能力、权限、服务端运行契约和资产 SHA256；点击“加载到你的 Skills 中”后才进入 Skills 子页。卸载只移除运行能力与专属资产，私人知识仍保留；演示目录卡会继续显示为“待安装”。</p>
          <div className="mt-2 inline-flex border border-black bg-[#eef3df] px-2 py-1 font-pixel text-[6px] text-[#326B55]">{networkLabel} · 非实时用户服务</div>
        </section>

        <section className="border-2 border-black bg-[#f4f1e7] p-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 font-pixel text-[7px]"><CloudDownload className="h-3.5 w-3.5" />从 HTTPS 地址导入 Skill 声明</div>
          <div className="flex gap-1.5"><input value={manifestUrl} onChange={(event) => { setManifestUrl(event.target.value); setInstallState('idle'); setError(''); }} placeholder="HTTPS Skill Manifest 地址" className="min-w-0 flex-1 border-2 border-black bg-white px-2 py-1.5 text-[10px] outline-none" /><button type="button" onClick={installRemote} disabled={!manifestUrl.trim() || installState === 'loading'} className="border-2 border-black bg-black px-2 text-[8px] font-bold text-[#7CFF6B] disabled:opacity-40">{installState === 'loading' ? '校验中' : '加载到 Skills'}</button></div>
          {error && <p role="alert" className="mt-1.5 border-l-2 border-[#b3261e] pl-2 text-[8px] leading-relaxed text-[#b3261e]">{error}</p>}
          {installState === 'done' && <p role="status" className="mt-1.5 border-l-2 border-[#238c57] pl-2 text-[8px] leading-relaxed text-[#18784b]">Manifest 已通过协议校验，并加载到你的 Skills。</p>}
        </section>

        <div className="grid grid-cols-4 gap-1.5">
          {(['all', 'markdown', 'lora', 'hybrid'] as Filter[]).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={`border-2 border-black py-1.5 font-pixel text-[7px] ${filter === item ? 'bg-[#326B55] text-white' : 'bg-white'}`}>{item === 'all' ? '全部' : item === 'markdown' ? 'Markdown' : item === 'lora' ? 'LoRA' : '混合'}</button>)}
        </div>

        <section className="space-y-2">
          {manifests.map((manifest) => <SkillCard key={manifest.identity.id} manifest={manifest} installed={installed.get(`${manifest.identity.id}@${manifest.identity.version}`)} publisher={skillPublisherForManifest(manifest.identity.id)} onRun={onRun} />)}
        </section>
        <p className="pt-1 text-center font-pixel text-[7px] tracking-wider text-black/35">AGENTS 发布 · FROST 调度 · 知识只属于你</p>
      </main>
    </div>
  );
}
