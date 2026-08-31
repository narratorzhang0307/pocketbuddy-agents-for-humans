import { useState } from 'react';
import { ChevronDown, ShieldCheck } from 'lucide-react';

const SKILL_PUBLISHING_RULES = [
  ['Three layers', 'Models such as PP-OCR and Qwen 2B belong to the host capability layer; a Skill composes abilities, rules, permissions and quality gates; LoRA is only one optional specialist asset.'],
  ['No training by default', 'Anything a prompt, MD / JSON, RAG, the shared base or a rule can do reliably is built as a composed Skill; facts that will change must never be baked into a LoRA.'],
  ['LoRA has a bar', 'Train only when Base + Prompt is still unreliable and the target is repeated visual/physical perception, unusual layout recognition or fixed structured behaviour.'],
  ['One host base', 'PP-OCR and Qwen3-VL-2B are installed once by the host and routed by profile; a Skill never ships its own copy of the base, and swaps in a compatible LoRA only when it clearly pays off.'],
  ['Protocol before weights', 'A LoRA must install through the Skill Protocol Runtime, declaring its base, inputs and outputs, permissions, dependencies, checksums, version and error handling.'],
  ['Traceable data and privacy', 'Training and blind-test sets are isolated per subject with their sources recorded; the user local photos, notes and traces must not enter training by default.'],
  ['Publish only if it beats the base', 'Compare Base and LoRA on the same real blind-test set; keep failure samples, confidence and quality gates, and mark anything unreadable as □ or a candidate.'],
  ['On-device results must be honest', 'Verify MNN size, latency and memory on a real device; SME2 only means acceleration. Cutout, depth, pose and geometry models must be listed as separate dependencies and never passed off as a Qwen LoRA.'],
] as const;

export default function SkillPublishingDeclaration() {
  const [open, setOpen] = useState(false);
  return (
    <section className="border-2 border-black bg-[#f7f1df]" aria-label="Skill publishing declaration">
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
          <b className="block font-pixel text-[8px]">SKILL DECLARATION</b>
          <small className="mt-1 block text-[8px] text-black/50">Three layers · 8 hard rules · all must pass before publishing</small>
        </span>
        <span className="flex items-center gap-2">
          <span className="border border-black bg-white px-1.5 py-1 font-pixel text-[5px]">{open ? 'Close' : 'Must read'}</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div id="skill-publishing-rules" className="border-t-2 border-black p-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div className="border-2 border-black bg-white p-2">
              <div className="font-pixel text-[7px] text-[#18784b]">01 · MAPPING SKILL</div>
              <p className="mb-0 mt-1 text-[8.5px] font-bold leading-relaxed text-black/65">MD / JSON / RAG / tools / map data. No model training, and the content can be updated on its own.</p>
            </div>
            <div className="border-2 border-black bg-[#eef3df] p-2">
              <div className="font-pixel text-[7px] text-[#18784b]">02 · LORA SKILL</div>
              <p className="mb-0 mt-1 text-[8.5px] font-bold leading-relaxed text-black/65">Swappable weights on the shared Qwen base. Must be installed through the protocol and pass a real blind test.</p>
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
            8 / 8 PASS · required to enter SKILLS PLAZA
          </div>
        </div>
      )}
    </section>
  );
}
