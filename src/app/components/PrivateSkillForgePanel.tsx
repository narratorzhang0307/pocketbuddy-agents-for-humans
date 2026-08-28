import { useEffect, useState } from 'react';
import { Check, ChevronDown, Cpu, LoaderCircle, LockKeyhole, PackageCheck, Sparkles, Trash2 } from 'lucide-react';
import { ALLOWED_TARGETS, getLearnedSkills, installSkill, removeLearnedSkill, subscribeSkills, type LearnedSkill } from '../../../frost-agent/harness/skillForge';
import { isNativeMnnPlatform } from '../../../frost-agent/edge/capacitorMnnEdge';
import { runEdgeChatEvidence } from '../../../frost-agent/edge/httpEdge';
import { createPrivateSkillPrompt, parsePrivateSkillDraft, suggestPrivateSkillLocally, type PrivateSkillDraft } from '../lib/plaza/privateSkillForge';

interface Props { initiallyOpen?: boolean }

export default function PrivateSkillForgePanel({ initiallyOpen = false }: Props) {
  const [open, setOpen] = useState(initiallyOpen);
  const [idea, setIdea] = useState('');
  const [draft, setDraft] = useState<PrivateSkillDraft | null>(null);
  const [source, setSource] = useState<'mnn' | 'rules' | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [installed, setInstalled] = useState<LearnedSkill[]>(getLearnedSkills());
  useEffect(() => subscribeSkills(() => setInstalled([...getLearnedSkills()])), []);

  const propose = async () => {
    const description = idea.trim();
    if (!description || busy) return;
    setBusy(true); setDraft(null); setSource(null); setNote('');
    try {
      if (isNativeMnnPlatform()) {
        const response = await runEdgeChatEvidence(createPrivateSkillPrompt(description), {
          system: '你是 Frost 的端侧 Skill 架构器。只能返回白名单内的声明式快捷 Skill JSON。', json: true, maxTokens: 160,
        });
        const parsed = response.backend === 'mnn' ? parsePrivateSkillDraft(response.text || '') : null;
        if (parsed) {
          setDraft(parsed); setSource('mnn'); setNote('Qwen3-VL-2B · MNN 已生成待审声明；尚未安装。'); return;
        }
      }
      const localDraft = suggestPrivateSkillLocally(description);
      setDraft(localDraft); setSource(localDraft ? 'rules' : null);
      setNote(localDraft
        ? isNativeMnnPlatform() ? 'MNN 未返回合格白名单 JSON，已明确降级为本地规则草案；未上云。' : '网页只生成本地规则草案；没有冒充 Qwen/MNN。'
        : '未匹配已审核的运动健康目标，因此没有生成或安装 Skill。');
    } catch {
      const localDraft = suggestPrivateSkillLocally(description);
      setDraft(localDraft); setSource(localDraft ? 'rules' : null);
      setNote(localDraft ? 'MNN 本轮调用失败，已明确降级为本地规则草案；未上云。' : 'MNN 调用失败，且本地规则没有匹配已审核的运动健康目标。');
    } finally { setBusy(false); }
  };

  const confirmInstall = () => {
    if (!draft) return;
    const result = installSkill(draft);
    setNote(result.ok ? '已安装到本机私人 Skills；Frost 路由器现在可以调用。' : `安全审查未通过：${result.reasons.join('；')}`);
    if (result.ok) { setDraft(null); setIdea(''); setSource(null); }
  };

  return (
    <section className="border-2 border-black bg-[#f7f1df]">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="grid w-full grid-cols-[38px_1fr_auto] items-center gap-2 p-2.5 text-left">
        <span className="grid h-9 w-9 place-items-center border-2 border-black bg-[#00ff88]"><Sparkles className="h-4 w-4" /></span>
        <span><b className="block font-pixel text-[8px]">CREATE PRIVATE SKILL</b><small className="mt-1 block text-[8px] text-black/50">一句话教 Frost 一个受控快捷能力</small></span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="space-y-2 border-t-2 border-black p-2.5">
        <p className="text-[9px] leading-relaxed text-black/60">只生成“触发词 → 已有 Skill 页面”的声明，不生成代码，不扩大权限，不自动发布。</p>
        <textarea value={idea} maxLength={140} onChange={(event) => { setIdea(event.target.value.slice(0, 140)); setDraft(null); setSource(null); setNote(''); }} placeholder="例如：以后我说跑步复盘，就打开跑步决策教练" className="min-h-[68px] w-full resize-none border-2 border-black bg-white px-2.5 py-2 text-[10px] leading-relaxed outline-none" />
        <button type="button" onClick={() => void propose()} disabled={!idea.trim() || busy} className="flex w-full items-center justify-center gap-2 border-2 border-black bg-black px-2 py-2.5 font-pixel text-[7px] text-[#7CFF6B] disabled:opacity-35">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Cpu className="h-4 w-4" />}{busy ? '生成与审查中' : isNativeMnnPlatform() ? 'QWEN + MNN 生成草案' : '本地规则预览'}</button>
        {draft && <div className="border-2 border-black bg-white">
          <div className="flex items-center justify-between border-b-2 border-black px-2.5 py-2"><b className="text-[11px]">{draft.name}</b><span className={`border border-black px-1.5 py-0.5 font-pixel text-[5px] ${source === 'mnn' ? 'bg-[#dff5e9] text-[#18784b]' : 'bg-[#fff3cd] text-[#8a5a00]'}`}>{source === 'mnn' ? 'MNN 草案' : '规则草案'}</span></div>
          <div className="space-y-2 p-2.5 text-[9px]"><p>{draft.desc}</p><p className="text-black/50">触发：{draft.keywords.join(' / ')}</p><div className="flex items-center gap-1.5 text-[#18784b]"><LockKeyhole className="h-3.5 w-3.5" />目标白名单：{ALLOWED_TARGETS[draft.target]}</div></div>
          <button type="button" onClick={confirmInstall} className="flex w-full items-center justify-center gap-2 border-t-2 border-black bg-[#00ff88] px-2 py-2.5 font-pixel text-[7px]"><PackageCheck className="h-4 w-4" />确认安装到私人 Skills</button>
        </div>}
        {note && <div role="status" className="border border-black bg-white px-2 py-1.5 text-[8px] leading-relaxed text-[#18784b]">{note}</div>}
        {installed.length > 0 && <div className="border-t border-black/25 pt-2">
          <div className="mb-1.5 flex items-center justify-between"><b className="font-pixel text-[6px]">FROST 已学快捷能力</b><span className="font-pixel text-[6px] text-black/40">{installed.length}</span></div>
          <div className="space-y-1">{installed.map((skill) => <div key={skill.id} className="grid grid-cols-[1fr_auto] items-center gap-2 border border-black bg-white px-2 py-1.5"><span className="min-w-0"><b className="block truncate text-[9px]">{skill.name}</b><small className="block truncate text-[7px] text-black/45">{skill.keywords.join(' / ')} → {ALLOWED_TARGETS[skill.target]}</small></span><button type="button" aria-label={`删除私人 Skill ${skill.name}`} onClick={() => removeLearnedSkill(skill.id)} className="grid h-7 w-7 place-items-center border border-black text-[#b3261e]"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div>
        </div>}
        <div className="flex items-center gap-1.5 text-[7.5px] leading-relaxed text-black/40"><Check className="h-3 w-3" />字段、目标、代码与外链必须全部通过安全闸。</div>
      </div>}
    </section>
  );
}
