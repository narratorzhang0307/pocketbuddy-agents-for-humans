import { useState } from 'react';
import SkillAvatar from './SkillAvatar';
import { ArrowLeft, Footprints, MapPin, Route, Timer } from 'lucide-react';
import {
  type RunRouteGoal,
  type RunRoutePreference,
  type RunRouteShape,
} from '../lib/runRouteSkill';
import { startRunRouteTask } from '../lib/frostHealthTaskmaster';

interface Props { onBack: () => void }

const PREFERENCES: Array<{ id: RunRoutePreference; label: string }> = [
  { id: 'scenic', label: '风景好' },
  { id: 'flat', label: '少爬坡' },
  { id: 'low_crossings', label: '少路口' },
  { id: 'lakeside', label: '沿水' },
  { id: 'quiet', label: '安静' },
];

export default function RunRouteSkillPage({ onBack }: Props) {
  const [goalType, setGoalType] = useState<RunRouteGoal['type']>('distance');
  const [distanceKm, setDistanceKm] = useState(5);
  const [durationMin, setDurationMin] = useState(30);
  const [destination, setDestination] = useState('西湖');
  const [shape, setShape] = useState<RunRouteShape>('loop');
  const [preferences, setPreferences] = useState<RunRoutePreference[]>(['scenic', 'flat']);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState('');
  const goalSummary = goalType === 'distance'
    ? `${distanceKm || 0} KM`
    : goalType === 'duration'
      ? `${durationMin || 0} MIN`
      : destination.trim() || '选择目的地';

  const togglePreference = (preference: RunRoutePreference) => {
    setPreferences((current) => current.includes(preference)
      ? current.filter((item) => item !== preference)
      : [...current, preference]);
  };
  const launch = async () => {
    if (launching) return;
    const goal: RunRouteGoal = goalType === 'distance'
      ? { type: 'distance', distance_m: Math.max(0.5, distanceKm) * 1000 }
      : goalType === 'duration'
        ? { type: 'duration', duration_min: Math.max(5, durationMin) }
        : { type: 'destination', query: destination.trim() || '西湖' };
    const routeShape = goalType === 'destination' && shape === 'loop' ? 'one_way' : shape;
    const requestText = goal.type === 'distance'
      ? `帮我规划一条 ${Math.max(0.5, distanceKm)} 公里的${routeShape === 'loop' ? '环线' : routeShape === 'out_and_back' ? '往返' : '单程'}跑步路线`
      : goal.type === 'duration'
        ? `帮我规划一条 ${Math.max(5, durationMin)} 分钟的跑步路线`
        : `帮我规划一条跑到${goal.query}的路线`;
    setLaunching(true);
    setLaunchError('');
    try {
      const task = await startRunRouteTask({
        activity: 'running', start: 'current_location', goal,
        shape: routeShape, preferences, source: 'user', request_text: requestText,
      });
      if (task.status === 'failed' || task.status === 'safe_stopped') throw new Error(task.error || 'Taskmaster 没有启动路线任务');
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : '路线任务启动失败');
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#EAEAEA] text-black">
      <header className="flex items-center gap-3 border-b-[3px] border-black bg-white px-3 py-3">
        <button type="button" aria-label="返回 Skills" onClick={onBack} className="grid h-10 w-10 place-items-center border-2 border-black bg-white"><ArrowLeft className="h-5 w-5" strokeWidth={3} /></button>
        <SkillAvatar skillId="frost.run-route" size={42} />
        <div className="min-w-0"><h1 className="font-pixel text-[13px]">RUN ROUTE</h1><p className="mt-1 text-[9px] font-bold text-black/50">高德路线规划 · GPS 轨迹跟随</p></div>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <section className="border-[3px] border-black bg-[#e8f8ef] p-3">
          <div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-full border-2 border-black bg-[#7CFF6B]"><Route className="h-6 w-6" strokeWidth={2.5} /></span><span><b className="block font-pixel text-[10px]">跑步路线规划</b><small className="mt-1 block text-[9px] leading-relaxed text-black/55">输入目标，Skill 创建 RouteSession 并直接交给中间的行动地图。</small></span></div>
        </section>

        <section className="mt-4 border-2 border-black bg-white">
          <div className="border-b-2 border-black bg-black px-3 py-2 font-pixel text-[7px] text-[#7CFF6B]">01 · 今天想怎么跑</div>
          <div className="grid grid-cols-3 gap-2 p-3">
            {([
              ['distance', Footprints, '按距离'],
              ['duration', Timer, '按时间'],
              ['destination', MapPin, '跑到哪'],
            ] as const).map(([id, Icon, label]) => <button key={id} type="button" onClick={() => { setGoalType(id); if (id === 'destination' && shape === 'loop') setShape('one_way'); }} className={`grid min-h-[68px] place-items-center border-2 border-black px-1 py-2 text-[9px] font-bold ${goalType === id ? 'bg-[#7CFF6B]' : 'bg-white'}`}><Icon className="h-5 w-5" /><span>{label}</span></button>)}
          </div>
          <div className="border-t border-black/20 p-3">
            {goalType === 'distance' && <label className="block text-[9px] font-bold">目标距离<div className="mt-2 flex items-center border-2 border-black bg-[#f7f1df]"><input aria-label="目标公里数" type="number" min="0.5" max="50" step="0.5" value={distanceKm} onChange={(event) => setDistanceKm(Number(event.target.value))} className="min-w-0 flex-1 bg-transparent px-3 py-3 text-[18px] font-black outline-none" /><span className="border-l-2 border-black px-3 py-3 font-pixel text-[8px]">KM</span></div></label>}
            {goalType === 'duration' && <label className="block text-[9px] font-bold">目标时间<div className="mt-2 flex items-center border-2 border-black bg-[#f7f1df]"><input aria-label="目标分钟数" type="number" min="5" max="240" step="5" value={durationMin} onChange={(event) => setDurationMin(Number(event.target.value))} className="min-w-0 flex-1 bg-transparent px-3 py-3 text-[18px] font-black outline-none" /><span className="border-l-2 border-black px-3 py-3 font-pixel text-[8px]">MIN</span></div></label>}
            {goalType === 'destination' && <label className="block text-[9px] font-bold">目的地<input aria-label="跑步目的地" value={destination} onChange={(event) => setDestination(event.target.value)} className="mt-2 w-full border-2 border-black bg-[#f7f1df] px-3 py-3 text-[13px] font-bold outline-none focus:bg-white" placeholder="例如：西湖断桥" /></label>}
          </div>
        </section>

        <section className="mt-3 border-2 border-black bg-white">
          <div className="border-b-2 border-black px-3 py-2 font-pixel text-[7px]">02 · 路线形状</div>
          <div className="grid grid-cols-3 gap-2 p-3">
            {([['loop', '环线'], ['out_and_back', '往返'], ['one_way', '单程']] as const).map(([id, label]) => <button key={id} type="button" disabled={goalType !== 'destination' && id === 'one_way'} onClick={() => setShape(id)} className={`border-2 border-black px-2 py-2 text-[9px] font-bold disabled:opacity-25 ${shape === id ? 'bg-[#ffd65a]' : 'bg-white'}`}>{label}</button>)}
          </div>
        </section>

        <section className="mt-3 border-2 border-black bg-white">
          <div className="border-b-2 border-black px-3 py-2 font-pixel text-[7px]">03 · 路线偏好</div>
          <div className="flex flex-wrap gap-2 p-3">{PREFERENCES.map((item) => <button key={item.id} type="button" aria-pressed={preferences.includes(item.id)} onClick={() => togglePreference(item.id)} className={`border-2 border-black px-3 py-2 text-[9px] font-bold ${preferences.includes(item.id) ? 'bg-[#b8f0ff]' : 'bg-white'}`}>{item.label}</button>)}</div>
          <p className="border-t border-black/20 px-3 py-2 text-[8px] leading-relaxed text-black/45">高德负责道路可通行与折线；照明、人流与治安偏好不会被冒充为可验证事实。</p>
        </section>
      </div>

      <div className="border-t-[3px] border-black bg-[#fff0b5] p-3">
        <div className="mb-2 flex items-center justify-between gap-3 text-[8px] font-bold"><span className="truncate">{shape === 'loop' ? '环线' : shape === 'out_and_back' ? '往返' : '单程'} · {preferences.length} 项偏好</span><b className="shrink-0 font-pixel text-[7px]">{goalSummary}</b></div>
        {launchError && <p role="alert" className="mb-2 border-2 border-[#b3261e] bg-[#fff0ed] px-3 py-2 text-[11px] text-[#b3261e]">{launchError}</p>}
        <button type="button" disabled={launching} onClick={() => void launch()} className="flex w-full items-center justify-center gap-2 border-[3px] border-black bg-[#00ff88] px-4 py-3 font-pixel text-[8px] disabled:opacity-50"><Route className="h-5 w-5" strokeWidth={3} />{launching ? 'TASKMASTER 正在交给行动地图' : '交给 TASKMASTER 并打开行动地图'}</button>
      </div>
    </div>
  );
}
