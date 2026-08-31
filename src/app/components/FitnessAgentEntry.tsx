import { FROST_AVATAR } from '../lib/skill/avatars';

export default function FitnessAgentEntry({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      aria-label="Open the Fitness Agent main router"
      data-agent-entry="fitness"
      onClick={onOpen}
      className="grid w-full grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-2.5 border-2 border-black bg-[#fff0b5] p-2.5 text-left transition-colors hover:bg-[#ffe08a] active:translate-y-px"
    >
      <span className="grid h-[52px] w-[52px] place-items-center overflow-hidden border-2 border-black bg-[#fffaf0]">
        <img src={FROST_AVATAR.src} alt="Agent World caramel dachshund" className="h-full w-full object-cover" draggable={false} />
      </span>
      <span className="min-w-0">
        <span className="block font-pixel text-[11px] tracking-wider text-black">FITNESS AGENT</span>
        <span className="mt-0.5 block text-[10.5px] leading-snug text-black/60">Main router · reads your diet, training and recovery goals, then dispatches the Skills and sub-Agents you have equipped.</span>
        <span className="mt-1 block font-pixel text-[6px] text-[#326B55]">LOCAL PERSONA · NOT AN IDENTITY CREDENTIAL</span>
      </span>
      <span className="grid min-h-11 w-[76px] shrink-0 place-items-center border-2 border-black bg-[#ffd65a] px-1 text-center font-pixel text-[6px] leading-relaxed text-black shadow-[2px_2px_0_#000]">▶ RUN</span>
    </button>
  );
}
