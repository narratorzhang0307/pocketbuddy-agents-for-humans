// 地图左下角「Skill 图层控制台」：只呈现注册表状态和开关，不挂载任何图层。
// 图层运行由 MapSkillLayerHost 负责；两者拆开后，控制台收起/换皮不会影响地图内容。
import { memo, useEffect, useReducer, useState } from 'react';
import {
  MAP_LAYER_SKILLS,
  type MapLayerSkillDescriptor,
} from '../lib/skills/mapLayers';
import {
  installCitySkill,
  isCitySkillInstalled,
  isCitySkillPublished,
  publishInstalledCitySkill,
  subscribeCitySkills,
  unpublishCitySkill,
} from '../lib/city-world/skills';
import type { WorldLayer } from '../lib/city-world/types';
import {
  isMapSkillAvailableInWorld,
  isMapSkillRelevantInWorld,
} from '../lib/skills/worldLayer';

const YAHEI = "'Microsoft YaHei','微软雅黑','PingFang SC','Heiti SC',sans-serif";

type MapSkillsLegendProps = {
  skills?: readonly MapLayerSkillDescriptor[];
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string;
  worldLayer?: WorldLayer;
  focusSkillId?: string | null;
  onInstallToPersonal?: (skillId: string) => void;
  onFocusSkill?: (skill: MapLayerSkillDescriptor) => void;
  position?: 'left' | 'right';
};

function MapSkillsLegend({
  skills = MAP_LAYER_SKILLS,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  title = '地图 SKILLS',
  worldLayer,
  focusSkillId = null,
  onInstallToPersonal,
  onFocusSkill,
  position = 'left',
}: MapSkillsLegendProps) {
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    const offs = [
      ...skills.map((skill) => skill.subscribe(refresh)),
      subscribeCitySkills(refresh),
    ];
    return () => offs.forEach((off) => off());
  }, [skills]);
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (nextOpen: boolean) => {
    setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };
  useEffect(() => {
    if (focusSkillId) setOpen(true);
  }, [focusSkillId]);

  const isInCurrentWorld = (skill: MapLayerSkillDescriptor) =>
    isMapSkillAvailableInWorld(skill, worldLayer, {
      isInstalled: isCitySkillInstalled,
      isPublished: isCitySkillPublished,
    });
  const relevantSkills = skills.filter((skill) =>
    isMapSkillRelevantInWorld(skill, worldLayer),
  );
  const loaded = skills.filter(
    (skill) => skill.isLoaded(worldLayer) && isInCurrentWorld(skill),
  );
  const unloaded = relevantSkills.filter(
    (skill) => !skill.isLoaded(worldLayer) || !isInCurrentWorld(skill),
  );
  const urgentTotal = loaded.reduce((n, s) => n + (s.urgentCount?.() ?? 0), 0);
  const offCount = loaded.filter((s) => !s.isVisible(worldLayer)).length;
  const onCount = loaded.length - offCount;
  const legendCounts = relevantSkills.reduce(
    (counts, skill) => {
      const nested = skill.legendItemCounts?.(worldLayer);
      if (nested) {
        counts.loaded += nested.loaded;
        counts.total += nested.total;
      } else {
        counts.loaded += skill.isLoaded(worldLayer) && isInCurrentWorld(skill) ? 1 : 0;
        counts.total += 1;
      }
      return counts;
    },
    { loaded: 0, total: 0 },
  );
  const setEveryLayerVisible = (visible: boolean) => {
    loaded.forEach((skill) => skill.setVisible(visible, worldLayer));
  };
  const loadSkillIntoCurrentWorld = (skill: MapLayerSkillDescriptor) => {
    const personalNative = skill.worldScope === 'personal';
    const globalNative = skill.worldScope === 'global';

    if (!worldLayer || personalNative || globalNative) {
      skill.setLoaded(true, worldLayer);
      skill.setVisible(true, worldLayer);
      if (skill.focus?.(worldLayer)) onFocusSkill?.(skill);
      return;
    }

    if (worldLayer === 'public') {
      // 公共 COSMOS 自己管理自己的地图：在这里加载就直接安装、发布、
      // 聚焦于公共地图，绝不能借 onInstallToPersonal 跳去私人知识地图。
      if (!isCitySkillInstalled(skill.id)) installCitySkill(skill.id);
      if (!isCitySkillPublished(skill.id)) publishInstalledCitySkill(skill.id);
      skill.setLoaded(true, worldLayer);
      skill.setVisible(true, worldLayer);
      if (skill.focus?.(worldLayer)) onFocusSkill?.(skill);
      return;
    }

    if (!isCitySkillInstalled(skill.id)) installCitySkill(skill.id);
    onInstallToPersonal?.(skill.id);
    skill.setLoaded(true, worldLayer);
    skill.setVisible(true, worldLayer);
    if (skill.focus?.(worldLayer)) onFocusSkill?.(skill);
  };
  const positionClass = position === 'right' ? 'right-3' : 'left-3';

  return (
    <>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          aria-expanded={false}
          className={`map-skills-legend absolute bottom-3 ${positionClass} z-20 flex h-[42px] w-[calc(50%_-_18px)] max-w-[176px] min-w-0 items-center gap-1 border-2 border-black bg-[#f5efdf] px-2 pointer-events-auto select-none active:translate-y-px`}
        >
          <span className="min-w-0 truncate whitespace-nowrap font-pixel text-[6px] tracking-wide text-black/65">▸ {title}</span>
          <span className="font-pixel text-[6px] bg-[#00ff88] text-black border border-black px-1 py-0.5">
            {worldLayer
              ? `${legendCounts.loaded}/${legendCounts.total}`
              : `${onCount}/${loaded.length}`}
          </span>
          {urgentTotal > 0 && (
            <span className="font-pixel text-[6px] bg-[#ff5a5a] text-white border border-black px-1 py-0.5">⏳{urgentTotal}</span>
          )}
          {offCount > 0 && <span className="font-pixel text-[6px] text-black/40">{offCount} OFF</span>}
        </button>
      ) : (
        <div className={`map-skills-legend absolute bottom-3 ${positionClass} z-20 w-[calc(100%_-_24px)] sm:w-[224px] max-h-[58%] sm:max-h-[calc(100%_-_24px)] overflow-y-auto overscroll-contain bg-[#f5efdf] border-2 border-black shadow-[3px_3px_0_#000] p-2 pointer-events-auto select-none`}>
          <button onClick={() => setOpen(false)} aria-expanded className="w-full flex items-center font-pixel text-[7px] tracking-widest text-black/65 active:translate-y-px">
            <span>▾ {title}</span>
            <span className="ml-auto text-black/40">收起</span>
          </button>
          <div className="mt-1 text-[9px] leading-snug text-black/50" style={{ fontFamily: YAHEI }}>
            当前地图自己的 Skill 图层；显示、定位和移除互不串页。
          </div>

          <div className="mt-2 space-y-1.5">
            {loaded.map((s) => {
              const on = s.isVisible(worldLayer);
              const focus = s.focus?.(worldLayer) ?? null;
              const urgent = s.urgentCount?.() ?? 0;
              const personalNative = s.worldScope === 'personal';
              const globalNative = s.worldScope === 'global';
              const installed =
                personalNative || globalNative || isCitySkillInstalled(s.id);
              const published =
                globalNative || (!personalNative && isCitySkillPublished(s.id));
              const focused = focusSkillId === s.id;
              return (
                <article
                  key={s.id}
                  className={`border bg-white/80 shadow-[1px_1px_0_rgba(0,0,0,0.35)] ${
                    focused
                      ? 'border-[#00a965] ring-2 ring-[#00ff88]'
                      : 'border-black'
                  } ${on ? '' : 'opacity-55'}`}
                >
                  <div className="flex flex-wrap items-stretch">
                    <button
                      onClick={() => {
                        s.setVisible(!on, worldLayer);
                        if (!on && focus) onFocusSkill?.(s);
                      }}
                      aria-pressed={on}
                      aria-label={`开关 ${s.legendLabel} 图层`}
                      className="flex min-w-0 basis-full items-center gap-2 px-2 py-1.5 text-left active:translate-y-px"
                    >
                      <span
                        className="w-3.5 h-3.5 shrink-0 border-2 border-black"
                        style={{ background: on ? s.color : '#fff' }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[10px] leading-none font-bold truncate" style={{ fontFamily: YAHEI }}>
                          {s.legendLabel}
                        </span>
                        <span className="block mt-1 font-pixel text-[5.5px] tracking-wider text-black/45 truncate">
                          {focused ? 'NEW · 刚刚从日报剪入' : on ? `ON · ${focus?.pointCount ?? 0} POINTS` : 'OFF · 已解耦'}
                        </span>
                      </span>
                      {urgent > 0 && (
                        <span className="shrink-0 font-pixel text-[5px] bg-[#ff5a5a] text-white border border-black px-0.5 py-0.5">⏳{urgent}</span>
                      )}
                      <span className="text-[8px] text-black/70 leading-none shrink-0 font-bold" style={{ fontFamily: YAHEI }}>{s.count(worldLayer)}</span>
                    </button>
                    {focus && (
                      <button
                        type="button"
                        onClick={() => onFocusSkill?.(s)}
                        aria-label={`定位 ${s.displayName}`}
                        title={`定位 ${focus.pointCount} 个地点`}
                        className="h-8 min-w-0 flex-1 border-t border-r border-black bg-white px-1 font-pixel text-[6px] text-black/65 active:bg-[#00ff88]"
                      >
                        定位查看
                      </button>
                    )}
                    {s.openBrowser && (
                      <button
                        onClick={() => {
                          s.openBrowser?.();
                          setOpen(false);
                        }}
                        aria-label={`打开 ${s.displayName}`}
                        title={s.displayName}
                        className="h-8 min-w-0 flex-1 border-t border-r border-black bg-[#f5efdf] px-1 font-pixel text-[6px] text-black/65 active:bg-[#00ff88]"
                      >
                        打开内容
                      </button>
                    )}
                    {s.canUnload !== false && (
                      <button
                        type="button"
                        onClick={() => s.setLoaded(false, worldLayer)}
                        aria-label={`卸载 ${s.displayName}`}
                        title="从地图卸载"
                        className="h-8 min-w-0 flex-1 border-t border-black bg-[#f5efdf] px-1 font-pixel text-[6px] text-black/55 active:bg-[#ffcfba]"
                      >
                        从地图移除
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1 border-t border-black/20 bg-[#f5efdf]/75 px-2 py-1">
                    <span
                      className="min-w-0 flex-1 truncate text-[7px] font-semibold text-black/55"
                      style={{ fontFamily: YAHEI }}
                    >
                      {!worldLayer
                        ? '内置地图图层'
                        : personalNative
                          ? '我的街道 · 设备现场记录'
                        : globalNative
                          ? 'Mapping 古籍内容 · 双层常驻'
                        : worldLayer === 'public'
                        ? published
                          ? '公共街道 · 已由我的街道发布'
                          : '公共目录 · 可剪入自己的街道'
                        : published
                          ? '我的街道 · 已发布到公共街道'
                          : installed
                            ? '我的街道 · 私有安装'
                            : '内置图层 · 尚未归入我的街道'}
                    </span>
                    {worldLayer &&
                      !personalNative &&
                      !globalNative &&
                      (worldLayer === 'personal' || !installed) && (
                      <button
                        type="button"
                        className={`shrink-0 border border-black px-1.5 py-1 font-pixel text-[5.5px] ${
                          published
                            ? 'bg-white text-black/60'
                            : 'bg-[#00ff88] text-black'
                        }`}
                        onClick={() => {
                          if (!installed) {
                            installCitySkill(s.id);
                            onInstallToPersonal?.(s.id);
                          } else if (published) {
                            unpublishCitySkill(s.id);
                          } else {
                            publishInstalledCitySkill(s.id);
                          }
                        }}
                      >
                        {!installed
                          ? worldLayer === 'public'
                            ? '剪入我的街道'
                            : '装入'
                          : published
                            ? '撤下公开'
                            : '发布公开'}
                      </button>
                    )}
                  </div>
                  {s.LegendControls && (
                    <s.LegendControls
                      onFocus={() => onFocusSkill?.(s)}
                      worldLayer={worldLayer}
                    />
                  )}
                </article>
              );
            })}
            {loaded.length === 0 && (
              <div className="text-[9px] text-black/45 py-1" style={{ fontFamily: YAHEI }}>还没有加载中的图层技能</div>
            )}
          </div>

          {/* 可加载区：卸载过的 skill 在这里装回 */}
          {unloaded.length > 0 && (
            <>
              <div className="font-pixel text-[7px] tracking-widest mt-2 mb-1.5 text-black/65">
                ＋ AVAILABLE · {worldLayer === 'public' ? '公共目录' : '可装入'}
              </div>
              <div className="space-y-1">
                {unloaded.map((s) => {
                  const personalNative = s.worldScope === 'personal';
                  const globalNative = s.worldScope === 'global';
                  const installed =
                    personalNative || globalNative || isCitySkillInstalled(s.id);
                  const published =
                    globalNative ||
                    (!personalNative && isCitySkillPublished(s.id));
                  return (
                    <div key={s.id} className="flex items-center gap-2 w-full">
                      <div className="w-3 h-3 shrink-0 border-2 border-black bg-white ml-1.5" style={{ borderStyle: 'dashed' }} />
                      <span className="text-[9px] leading-none font-bold text-black/55 truncate flex-1" style={{ fontFamily: YAHEI }}>{s.legendLabel}</span>
                      <button
                        onClick={() => loadSkillIntoCurrentWorld(s)}
                        className="shrink-0 font-pixel text-[6px] border border-black bg-[#00ff88] text-black px-1.5 py-1 active:translate-y-px"
                      >
                        {!worldLayer
                          ? '加载'
                          : worldLayer === 'public'
                            ? published
                              ? '重新载入'
                              : '加载公共层'
                            : installed
                              ? '重载'
                              : '装入'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {loaded.length > 0 && (
            <div className="mt-2 pt-2 border-t border-black/25 flex gap-1.5">
              <button
                onClick={() => setEveryLayerVisible(true)}
                disabled={offCount === 0}
                className="flex-1 border border-black bg-[#00ff88] px-1 py-1.5 font-pixel text-[6px] tracking-wider disabled:opacity-35 active:translate-y-px"
              >
                全部显示
              </button>
              <button
                onClick={() => setEveryLayerVisible(false)}
                disabled={onCount === 0}
                className="flex-1 border border-black bg-white px-1 py-1.5 font-pixel text-[6px] tracking-wider disabled:opacity-35 active:translate-y-px"
              >
                全部关闭
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default memo(MapSkillsLegend);
