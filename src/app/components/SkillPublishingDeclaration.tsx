import { useState } from 'react';
import { ChevronDown, ShieldCheck } from 'lucide-react';

const SKILL_PUBLISHING_RULES = [
  ['三层分工', 'PP-OCR、Qwen 2B 等模型属于宿主能力层；Skill 组合能力、规则、权限和质量门；LoRA 只是一种可选专项资产。'],
  ['默认不训练', '提示词、MD / JSON、RAG、共享基座或规则能稳定完成的任务，一律做组合 Skill；会更新的事实不得写进 LoRA。'],
  ['LoRA 有门槛', '仅当 Base + Prompt 仍不可靠，且目标属于重复的视觉/物理感知、特殊版面识别或固定结构化行为时才训练。'],
  ['统一宿主底座', 'PP-OCR 与 Qwen3-VL-2B 都由宿主只装一份并按 profile 路由；Skill 不重复携带基座，确有收益时才切换兼容 LoRA。'],
  ['先装协议再装权重', 'LoRA 必须通过 Skill Protocol Runtime 安装：声明底座、输入输出、权限、依赖、校验和、版本与异常处理。'],
  ['数据与隐私可追溯', '训练集、盲测集按对象隔离并记录来源；用户本地照片、笔记与足迹默认不得进入训练。'],
  ['盲测胜过基座才发布', '同一真实盲测集对比 Base 与 LoRA；保留失败样本、置信度和质量门控，不可见内容必须标 □ 或候选。'],
  ['端侧结果必须诚实', '真机验证 MNN 的体积、延迟与内存；SME2 只代表加速。抠图、深度、姿态或几何模型须单列依赖，不得冒充 Qwen LoRA。'],
] as const;

export default function SkillPublishingDeclaration() {
  const [open, setOpen] = useState(false);
  return (
    <section className="border-2 border-black bg-[#f7f1df]" aria-label="Skill 发布声明">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="skill-publishing-rules"
        onClick={() => setOpen((value) => !value)}
        className="grid w-full grid-cols-[38px_1fr_auto] items-center gap-2 p-2.5 text-left active:translate-y-px"
      >
        <span className="grid h-9 w-9 place-items-center border-2 border-black bg-[#00ff88]">
          <ShieldCheck className="h-4 w-4" strokeWidth={2.6} />
        </span>
        <span className="min-w-0">
          <b className="block font-pixel text-[8px]">SKILL 发布声明</b>
          <small className="mt-1 block text-[8px] text-black/50">三层架构 · 8 条硬规则 · 全部通过才可发布</small>
        </span>
        <span className="flex items-center gap-2">
          <span className="border border-black bg-white px-1.5 py-1 font-pixel text-[5px]">{open ? '收起' : '必读'}</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div id="skill-publishing-rules" className="border-t-2 border-black p-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div className="border-2 border-black bg-white p-2">
              <div className="font-pixel text-[7px] text-[#18784b]">01 · MAPPING SKILL</div>
              <p className="mb-0 mt-1 text-[8.5px] font-bold leading-relaxed text-black/65">MD / JSON / RAG / 工具 / 地图数据，不训练模型，内容可独立更新。</p>
            </div>
            <div className="border-2 border-black bg-[#eef3df] p-2">
              <div className="font-pixel text-[7px] text-[#18784b]">02 · LORA SKILL</div>
              <p className="mb-0 mt-1 text-[8.5px] font-bold leading-relaxed text-black/65">统一 Qwen 底座上的可切换权重，必须经协议安装和真实盲测。</p>
            </div>
          </div>

          <ol className="mt-2 border-2 border-black bg-white">
            {SKILL_PUBLISHING_RULES.map(([title, body], index) => (
              <li key={title} className="grid grid-cols-[28px_1fr] border-b border-black/25 last:border-b-0">
                <span className="grid min-h-[42px] place-items-center border-r border-black/25 bg-[#f0ead8] font-pixel text-[6px]">{String(index + 1).padStart(2, '0')}</span>
                <span className="p-2 text-[8.5px] leading-relaxed text-black/65">
                  <strong className="mr-1 text-black">{title}。</strong>{body}
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-2 border-2 border-black bg-[#00ff88] px-2 py-1.5 text-center font-pixel text-[6px] tracking-wider">
            8 / 8 PASS · 才能进入 SKILLS PLAZA
          </div>
        </div>
      )}
    </section>
  );
}
