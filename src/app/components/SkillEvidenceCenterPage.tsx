import { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, ChevronDown, Database, Download, FlaskConical, ShieldCheck, Smartphone } from 'lucide-react';
import {
  CONTENT_SKILL_EVIDENCE,
  MODEL_SKILL_EVIDENCE,
  SKILL_EVIDENCE_CATALOG,
  type SkillEvidenceRecord,
  type SkillEvidenceVerdict,
} from '../data/skillEvidenceCatalog';

const VERDICT_STYLE: Record<SkillEvidenceVerdict, { bg: string; fg: string; label: string }> = {
  proven: { bg: '#dff5e9', fg: '#12613d', label: '已建立证据' },
  conditional: { bg: '#fff0c8', fg: '#7a5100', label: '条件式成立' },
  protocol: { bg: '#e8efff', fg: '#2856a3', label: '协议 / 闭环证据' },
  'pending-device': { bg: '#f0f0f0', fg: '#555', label: '待手机验收' },
};

function downloadCatalog(): void {
  const payload = JSON.stringify({
    protocol: 'pocket-skill-evidence/v1',
    exportedAt: new Date().toISOString(),
    records: SKILL_EVIDENCE_CATALOG,
  }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `pocket-earth-skill-evidence-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function EvidenceCard({ record }: { record: SkillEvidenceRecord }) {
  const verdict = VERDICT_STYLE[record.verdict];
  return (
    <details className="border-2 border-black bg-white" open={record.verdict !== 'protocol'}>
      <summary className="flex cursor-pointer list-none items-start gap-2.5 p-2.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center border-2 border-black" style={{ background: verdict.bg, color: verdict.fg }}>
          {record.group === 'model' ? <FlaskConical className="h-5 w-5" /> : <Database className="h-5 w-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <strong className="font-pixel text-[9px] tracking-wide">{record.title}</strong>
            <span className="border border-black px-1 py-0.5 font-pixel text-[5px]" style={{ background: verdict.bg, color: verdict.fg }}>{verdict.label}</span>
            <span className="border border-black/30 bg-white px-1 py-0.5 font-pixel text-[5px] text-black/55">{record.kind}</span>
          </span>
          <span className="mt-1 block text-[8.5px] leading-relaxed text-black/60">{record.summary}</span>
        </span>
        <ChevronDown className="mt-1 h-4 w-4 shrink-0" />
      </summary>

      <div className="space-y-2.5 border-t-2 border-black p-2.5">
        <div className="grid grid-cols-3 gap-1.5">
          {record.metrics.map((metric) => (
            <div key={metric.label} className="border border-black/25 p-1.5 text-center" style={{ background: metric.tone === 'positive' ? '#f0faf5' : metric.tone === 'warning' ? '#fff8e5' : '#f5f5f5' }}>
              <span className="block text-[6.5px] text-black/45">{metric.label}</span>
              <b className="mt-0.5 block font-mono text-[8px] leading-tight">{metric.value}</b>
            </div>
          ))}
        </div>

        <section className="border-2 border-black bg-[#f7f1df] p-2">
          <div className="flex items-center gap-1.5 text-[8px] font-black"><ShieldCheck className="h-3.5 w-3.5" style={{ color: verdict.fg }} />结论边界</div>
          <p className="mb-0 mt-1 text-[8px] leading-relaxed text-black/60">{record.claimBoundary}</p>
        </section>

        {record.image && <img src={record.image} alt={`${record.title} 证据摘要`} className="block w-full border-2 border-black bg-[#f7f1df] object-contain" loading="lazy" />}

        <section>
          <div className="mb-1.5 flex items-end justify-between"><b className="font-pixel text-[7px]">原始证据</b><span className="text-[6.5px] text-black/35">{record.artifacts.length} 件</span></div>
          <div className="border-2 border-black">
            {record.artifacts.map((artifact, index) => (
              <div key={`${artifact.label}-${artifact.source}`} className={`p-2 ${index ? 'border-t border-black/25' : ''}`}>
                <div className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-[#12613d]" /><div className="min-w-0"><b className="block text-[8px]">{artifact.label}</b><p className="mb-0 mt-0.5 text-[7.5px] leading-relaxed text-black/55">{artifact.detail}</p><code className="mt-1 block break-all bg-[#f2f2f2] px-1 py-0.5 text-[6px] text-black/45">{artifact.source}</code></div></div>
              </div>
            ))}
          </div>
        </section>

        {record.needsPhone && <div className="flex items-start gap-1.5 border border-black/25 bg-[#f1f1f1] p-2 text-[7.5px] leading-relaxed text-black/50"><Smartphone className="h-3.5 w-3.5 shrink-0" />当前证据证明能力质量与桌面 MNN 链路；最终延迟、内存、温升、飞行模式和 SME2 增益必须在比赛手机验收账本补齐。</div>}
      </div>
    </details>
  );
}

export default function SkillEvidenceCenterPage({ onBack }: { onBack: () => void }) {
  const [group, setGroup] = useState<'all' | 'model' | 'content'>('all');
  const records = useMemo(() => group === 'model' ? MODEL_SKILL_EVIDENCE : group === 'content' ? CONTENT_SKILL_EVIDENCE : SKILL_EVIDENCE_CATALOG, [group]);
  const proven = SKILL_EVIDENCE_CATALOG.filter((item) => item.verdict === 'proven').length;
  const conditional = SKILL_EVIDENCE_CATALOG.filter((item) => item.verdict === 'conditional').length;
  const protocol = SKILL_EVIDENCE_CATALOG.filter((item) => item.verdict === 'protocol').length;

  return <div className="h-full overflow-y-auto bg-[#eaeaea] text-black">
    <header className="sticky top-0 z-20 flex items-center gap-2 border-b-2 border-black bg-white px-3 py-2">
      <button type="button" aria-label="返回 Skills" onClick={onBack} className="grid h-8 w-8 place-items-center border-2 border-black"><ArrowLeft className="h-4 w-4" /></button>
      <div className="min-w-0 flex-1"><h1 className="font-pixel text-[11px] tracking-wider">SKILL 证据中心</h1><p className="truncate text-[8px] text-black/45">LoRA 胜负、质量门控、MNN 专项模型与协议闭环分开记账</p></div>
      <ShieldCheck className="h-5 w-5 text-[#12613d]" />
    </header>

    <main className="space-y-3 p-3 pb-24">
      <section className="border-[3px] border-black bg-[#f7f1df] p-3">
        <div className="flex items-start gap-2.5"><div className="grid h-11 w-11 shrink-0 place-items-center border-2 border-black bg-[#00ff88]"><FlaskConical className="h-6 w-6" /></div><div><h2 className="font-pixel text-[9px]">{SKILL_EVIDENCE_CATALOG.length} 类能力 · 一套诚实证据口径</h2><p className="mb-0 mt-1 text-[8.5px] leading-relaxed text-black/60">不把“用了 LoRA”写成“优于 Base”。同输入、同底座、同协议后，分别记录胜出、条件式胜出、规则闭环与手机待验。</p></div></div>
        <div className="mt-2 grid grid-cols-3 gap-1.5 text-center"><div className="border-2 border-black bg-[#dff5e9] p-1.5"><b className="block font-mono text-sm text-[#12613d]">{proven}</b><span className="text-[7px] text-black/45">已建立证据</span></div><div className="border-2 border-black bg-[#fff0c8] p-1.5"><b className="block font-mono text-sm text-[#7a5100]">{conditional}</b><span className="text-[7px] text-black/45">条件式成立</span></div><div className="border-2 border-black bg-[#e8efff] p-1.5"><b className="block font-mono text-sm text-[#2856a3]">{protocol}</b><span className="text-[7px] text-black/45">协议 / 闭环</span></div></div>
      </section>

      <section className="grid grid-cols-[1fr_1fr_1fr] border-2 border-black bg-white p-1">
        {(['all', 'model', 'content'] as const).map((value) => <button key={value} type="button" onClick={() => setGroup(value)} className={`px-1 py-2 font-pixel text-[6px] ${group === value ? 'bg-black text-[#00ff88]' : 'bg-white text-black'}`}>{value === 'all' ? `全部 ${SKILL_EVIDENCE_CATALOG.length}` : value === 'model' ? `模型能力 ${MODEL_SKILL_EVIDENCE.length}` : `内容能力 ${CONTENT_SKILL_EVIDENCE.length}`}</button>)}
      </section>

      <section className="space-y-2">{records.map((record) => <EvidenceCard key={record.skillId} record={record} />)}</section>

      <section className="border-2 border-black bg-white p-2.5"><div className="flex items-center gap-2"><Download className="h-4 w-4" /><div className="min-w-0 flex-1"><b className="block text-[9px]">导出可复核台账</b><span className="block text-[7.5px] text-black/45">包含结论边界、指标和原始文件索引；不包含伪造的手机成绩。</span></div><button type="button" onClick={downloadCatalog} className="shrink-0 border-2 border-black bg-[#00ff88] px-2 py-2 font-pixel text-[6px]">下载 JSON</button></div></section>
    </main>
  </div>;
}
