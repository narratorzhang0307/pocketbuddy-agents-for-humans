import { useState } from 'react';
import type { Planet } from '../data/planets';
import {
  ROAMING_KNOWLEDGE_SKILLS,
  type KnowledgeSkillDefinition,
} from '../lib/knowledge/skills';
import { X } from 'lucide-react';

// 地球左下角图例 + 图层开关（知识库视图专属）：标明每种颜色代表什么，点一下开/闭该类点。
// 上段=基础各类（从 MARKER_KINDS 自动列出），下段=用户建立的「星球」（圆点，可开关 / 删除）。
// 默认折叠成一枚小标签（不挡地图），点头部展开/收起。
// 舆图（mapping 视图）的图层面板是另一套（AtlasLegend：城市 + 存续筛选）——两套 LAYERS 不混。

// 图例文字字体：微软雅黑（Windows）→ 其它平台对应黑体兜底
const YAHEI = "'Microsoft YaHei','微软雅黑','PingFang SC','Heiti SC',sans-serif";

interface Props {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  loadedSkillIds: Set<string>;
  onToggleSkill: (skillId: string) => void;
  allOn?: boolean;
  onToggleAll?: () => void;
  onFocusSkill?: (skillId: string) => void;
  skillPointCounts?: ReadonlyMap<string, number>;
  planets?: Planet[];
  onTogglePlanet?: (id: string) => void;
  onRemovePlanet?: (id: string) => void;
}

export default function MapLegend({ open: controlledOpen, onOpenChange, loadedSkillIds, onToggleSkill, allOn, onToggleAll, onFocusSkill, skillPointCounts, planets = [], onTogglePlanet, onRemovePlanet }: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (nextOpen: boolean) => {
    setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };
  const offCount = ROAMING_KNOWLEDGE_SKILLS.length - loadedSkillIds.size;
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-expanded={false}
        className="absolute bottom-3 left-3 z-20 flex h-[42px] w-[calc(50%_-_18px)] max-w-[176px] min-w-0 items-center gap-1 border-2 border-black bg-[#f5efdf] px-2 shadow-[2px_2px_0_#000] pointer-events-auto select-none active:translate-y-px"
      >
        <span className="min-w-0 truncate whitespace-nowrap font-pixel text-[6px] tracking-wide text-black/65">▸ KNOWLEDGE MAP</span>
        <span className="font-pixel text-[6px] border border-black bg-[#00ff88] px-1 py-0.5">{loadedSkillIds.size}/{ROAMING_KNOWLEDGE_SKILLS.length}</span>
        {offCount > 0 && <span className="font-pixel text-[6px] text-black/40">{offCount} OFF</span>}
      </button>
    );
  }
  return (
    <div className="absolute bottom-3 left-3 z-20 w-[calc(100%_-_24px)] sm:w-[224px] max-h-[58%] sm:max-h-[calc(100%_-_24px)] overflow-y-auto overscroll-contain bg-[#f5efdf] border-2 border-black shadow-[3px_3px_0_#000] p-2 pointer-events-auto select-none">
      <button onClick={() => setOpen(false)} aria-expanded className="w-full flex items-center font-pixel text-[7px] tracking-widest mb-1.5 text-black/65 active:translate-y-px">
        <span>▾ KNOWLEDGE MAP · 私人层</span>
        <span className="ml-auto text-black/40">收起</span>
      </button>
      <p className="mb-1.5 text-[8px] leading-snug text-black/55" style={{ fontFamily: YAHEI }}>
        已加载内容的显示开关；新增 Skill 请前往 Skills Plaza。
      </p>

      {/* 知识库总开关：一键把音乐/书/照片等涂上的所有内容全关/全开 */}
      {onToggleAll && (
        <button
          onClick={onToggleAll}
          aria-pressed={!!allOn}
          className="flex items-center gap-2 w-full min-h-[26px] mb-1 border-b border-black/15 pb-1 active:translate-y-px"
        >
          <div className={`w-3 h-3 shrink-0 border-2 border-black ${allOn ? 'bg-[#00ff88]' : 'bg-white'}`} />
          <span className="text-[9px] leading-none font-bold" style={{ fontFamily: YAHEI }}>个人知识地图</span>
          <span className="ml-auto pl-2 font-pixel text-[6px] text-black/70 leading-none">
            {allOn ? 'ALL ON' : loadedSkillIds.size > 0 ? 'PARTIAL' : 'ALL OFF'}
          </span>
        </button>
      )}

      <div className="space-y-1">
        {ROAMING_KNOWLEDGE_SKILLS.map((skill: KnowledgeSkillDefinition) => {
          const on = loadedSkillIds.has(skill.id);
          const pointCount = skillPointCounts?.get(skill.id) ?? 0;
          return (
            <div key={skill.id} className={`flex flex-wrap items-stretch border border-black/20 bg-white ${on ? '' : 'opacity-45'}`}>
              <button
                onClick={() => {
                  onToggleSkill(skill.id);
                  if (!on && pointCount > 0) onFocusSkill?.(skill.id);
                }}
                aria-pressed={on}
                aria-label={`开关 ${skill.label} Skill`}
                className="flex min-w-0 basis-full items-center gap-2 px-1.5 py-1.5 text-left active:translate-y-px"
              >
                <div className="w-3 h-3 shrink-0 border-2 border-black" style={{ background: on ? skill.color : '#fff' }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[9px] leading-none font-bold" style={{ fontFamily: YAHEI }}>{skill.label}</span>
                  <span className="mt-1 block truncate font-pixel text-[5px] text-black/45">{skill.english} · {pointCount} POINTS · {on ? '已显示' : '已隐藏'}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onToggleSkill(skill.id);
                  if (!on && pointCount > 0) onFocusSkill?.(skill.id);
                }}
                className={`h-8 min-w-0 flex-1 border-t border-r border-black/20 px-1 font-pixel text-[6px] active:bg-[#00ff88] ${on ? 'bg-[#3f3f3f] text-[#7CFF6B]' : 'bg-[#00ff88] text-black'}`}
              >
                {on ? '隐藏内容' : '显示内容'}
              </button>
              <button
                type="button"
                disabled={!on || pointCount <= 0 || !onFocusSkill}
                onClick={() => onFocusSkill?.(skill.id)}
                aria-label={`定位查看 ${skill.label}`}
                className="h-8 min-w-0 flex-1 border-t border-black/20 bg-[#f5efdf] px-1 font-pixel text-[6px] active:bg-[#00ff88] disabled:cursor-not-allowed disabled:text-black/30"
              >
                {pointCount > 0 ? '定位查看' : '暂无落点'}
              </button>
            </div>
          );
        })}
      </div>

      {/* 星球段（圆点，区别于基础类的方块）*/}
      {planets.length > 0 && (
        <>
          <div className="font-pixel text-[7px] tracking-widest mt-2 mb-1.5 text-black/65">PLANETS · 星球</div>
          <div className="space-y-1">
            {planets.map((p) => (
              <div key={p.id} className={`flex items-center gap-2 w-full ${p.visible ? '' : 'opacity-45'}`}>
                <button onClick={() => onTogglePlanet?.(p.id)} aria-pressed={!!p.visible} className="flex items-center gap-2 min-w-0 flex-1 min-h-[24px] active:translate-y-px">
                  <div className="w-3 h-3 shrink-0 rounded-full border-[1.5px] border-black" style={{ background: p.color }} />
                  <span className="text-[9px] leading-none truncate font-bold" style={{ fontFamily: YAHEI }}>{p.name}</span>
                  <span className="ml-auto pl-1 text-[7px] text-black/70 leading-none shrink-0 font-bold" style={{ fontFamily: YAHEI }}>{p.photos.length}</span>
                </button>
                {onRemovePlanet && (
                  <button onClick={() => onRemovePlanet(p.id)} aria-label={`删除星球 ${p.name}`} className="shrink-0 inline-flex items-center justify-center min-w-[24px] min-h-[24px] text-black/55 hover:text-[#d23b3b] active:translate-y-px"><X className="w-2.5 h-2.5" strokeWidth={3} /></button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
