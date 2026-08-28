import { rememberStravaAnswer } from '../lib/frostSkillAnswer';
import { useEffect, useMemo, useState } from 'react';
import { Activity, Camera, ChefHat, CloudSun, Dumbbell, ExternalLink, FileJson, Moon, Search, Utensils } from 'lucide-react';
import { searchCnFoods } from '../../../frost-agent/skills/health/cnFoodLibrary';
import { recordMealWithTaskmaster } from '../lib/frostHealthTaskmaster';
import type { FrostSkillPageReporter } from '../../../frost-agent/harness/skillPageResult';
import FrostSkillResultButton from './FrostSkillResultButton';

interface Props {
  skillId: string;
  taskmasterTaskId?: string;
  report?: FrostSkillPageReporter;
}

type OutdoorResult = {
  city: string;
  temperature: number;
  apparent: number;
  precipitation: number;
  wind: number;
  aqi: number | null;
  uv: number | null;
  band: 'green' | 'yellow' | 'red';
  recommendation: string;
  reasons: string[];
  observedAt: string;
};

type SleepEntry = { id: string; hours: number; quality: number; coffee: boolean; alcohol: boolean; lateTraining: boolean };

const ACCENT = '#00ee86';
const CARD = 'mt-3 border-2 border-black bg-white p-3';
const INPUT = 'border-2 border-black bg-[#f7f1df] px-2 py-2 text-[10px] outline-none';
const SLEEP_KEY = 'frost.sleep-detective.v1';

function Button({ children, onClick, disabled = false }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className="border-2 border-black px-3 py-2 text-[9px] font-black disabled:cursor-not-allowed disabled:opacity-35 active:translate-y-px" style={{ background: disabled ? '#ddd' : ACCENT }}>{children}</button>;
}

function OutdoorWindowPanel({ report }: { report?: FrostSkillPageReporter }) {
  const [city, setCity] = useState('杭州');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<OutdoorResult | null>(null);

  const check = async () => {
    setBusy(true); setError(''); setResult(null);
    try {
      const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh&format=json`);
      if (!geoResponse.ok) throw new Error('城市查询失败');
      const geo = await geoResponse.json() as { results?: Array<{ name: string; latitude: number; longitude: number }> };
      const place = geo.results?.[0];
      if (!place) throw new Error('没有找到这个城市');
      const params = `latitude=${place.latitude}&longitude=${place.longitude}`;
      const [weatherResponse, airResponse] = await Promise.all([
        fetch(`https://api.open-meteo.com/v1/forecast?${params}&current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m,weather_code&timezone=auto`),
        fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}&current=us_aqi,uv_index&timezone=auto`),
      ]);
      if (!weatherResponse.ok || !airResponse.ok) throw new Error('户外数据暂时不可用');
      const weather = await weatherResponse.json() as { current: Record<string, number | string> };
      const air = await airResponse.json() as { current?: Record<string, number | string> };
      const temperature = Number(weather.current.temperature_2m);
      const apparent = Number(weather.current.apparent_temperature);
      const precipitation = Number(weather.current.precipitation);
      const wind = Number(weather.current.wind_speed_10m);
      const weatherCode = Number(weather.current.weather_code);
      const aqi = Number.isFinite(Number(air.current?.us_aqi)) ? Number(air.current?.us_aqi) : null;
      const uv = Number.isFinite(Number(air.current?.uv_index)) ? Number(air.current?.uv_index) : null;
      const hardStops: string[] = [];
      const cautions: string[] = [];
      if (weatherCode >= 95) hardStops.push('雷暴风险');
      if (aqi !== null && aqi >= 151) hardStops.push(`AQI ${aqi} 较差`);
      else if (aqi !== null && aqi >= 101) cautions.push(`AQI ${aqi}，建议降低强度`);
      if (apparent >= 35 || apparent <= -5) hardStops.push(`体感温度 ${apparent}°C`);
      else if (apparent >= 30) cautions.push(`体感温度 ${apparent}°C，注意补水`);
      if (precipitation >= 5) hardStops.push('当前降水较强');
      else if (precipitation > 0) cautions.push('当前有降水');
      if (wind >= 40) hardStops.push('风速较高');
      else if (wind >= 25) cautions.push('风力偏大');
      if ((uv ?? 0) >= 8) cautions.push(`UV ${uv}，需要防晒`);
      const reasons = [...hardStops, ...cautions];
      const red = hardStops.length > 0;
      const yellow = !red && cautions.length > 0;
      const band = red ? 'red' : yellow ? 'yellow' : 'green';
      const recommendation = red ? '建议改为室内活动或延后训练。' : yellow ? '可以轻松运动，缩短时长并注意补水、防晒。' : '适合户外跑步、散步或骑行。';
      setResult({ city: place.name, temperature, apparent, precipitation, wind, aqi, uv, band, recommendation, reasons, observedAt: String(weather.current.time || new Date().toISOString()) });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };

  return <section className={CARD}>
    <div className="flex items-center gap-2"><CloudSun className="h-5 w-5" /><h2 className="font-pixel text-[8px]">OUTDOOR WINDOW · LIVE</h2></div>
    <p className="mt-2 text-[8px] text-black/55">输入城市后读取 Open-Meteo 的当前天气、AQI 与 UV；无需账号，不读取精确定位。</p>
    <div className="mt-3 flex gap-2"><input value={city} onChange={(event) => setCity(event.target.value)} className={`${INPUT} min-w-0 flex-1`} placeholder="城市，例如：杭州" /><Button disabled={!city.trim() || busy} onClick={() => void check()}>{busy ? '读取中…' : '检查户外窗口'}</Button></div>
    {error && <p className="mt-2 text-[8px] font-bold text-red-700">{error}</p>}
    {result && <div className="mt-3 border-2 border-black p-3" style={{ background: result.band === 'green' ? '#dff5e9' : result.band === 'yellow' ? '#fff3cd' : '#ffd9d2' }}>
      <div className="flex items-center justify-between gap-2"><b className="font-pixel text-[8px]">{result.band.toUpperCase()} · {result.city}</b><span className="text-[8px]">{result.observedAt}</span></div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[9px]"><span>{result.temperature}°C</span><span>AQI {result.aqi ?? '?'}</span><span>UV {result.uv ?? '?'}</span><span>体感 {result.apparent}°C</span><span>降水 {result.precipitation}mm</span><span>风 {result.wind}km/h</span></div>
      <p className="mt-2 text-[9px] font-bold">{result.recommendation}</p>{result.reasons.length > 0 && <p className="mt-1 text-[8px]">触发：{result.reasons.join(' · ')}</p>}
    </div>}
    <FrostSkillResultButton report={report} result={error ? { status: 'failed', summary: '户外实时数据查询失败，没有生成可靠运动窗口。' }
      : result && !busy ? { status: 'completed', summary: `${result.city.slice(0, 30)}户外查询：${result.temperature}度，AQI ${result.aqi ?? '缺失'}。${result.recommendation}仅为当前查询，不代表已完成运动。` } : undefined} />
  </section>;
}

function StravaReplayPanel({ report }: { report?: FrostSkillPageReporter }) {
  const [activity, setActivity] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  const read = async (file?: File) => {
    if (!file) return;
    setError(''); setActivity(null);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const raw = (Array.isArray(parsed) ? parsed[0] : parsed) as Record<string, unknown>;
      if (!raw || typeof raw !== 'object') throw new Error('没有可读取的活动');
      const seconds = Number(raw.moving_time ?? raw.elapsed_time ?? 0);
      const meters = Number(raw.distance ?? 0);
      const summary = {
        name: String(raw.name ?? '未命名活动'), type: String(raw.sport_type ?? raw.type ?? 'Activity'),
        distanceKm: meters ? Number((meters / 1000).toFixed(2)) : null,
        durationMin: seconds ? Number((seconds / 60).toFixed(1)) : null,
        averageHeartrate: raw.average_heartrate ?? null, averageSpeed: raw.average_speed ?? null,
        elevationGain: raw.total_elevation_gain ?? null, activityId: raw.id ?? null,
        privacy: '精确 GPS、起终点与轨迹字段已从页面摘要中排除',
      };
      setActivity(summary); rememberStravaAnswer(summary);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '活动 JSON 无法读取'); }
  };
  return <section className={CARD}>
    <div className="flex items-center gap-2"><FileJson className="h-5 w-5" /><h2 className="font-pixel text-[8px]">STRAVA LOCAL REPLAY</h2></div>
    <p className="mt-2 text-[8px] text-black/55">选择 Strava API/导出 JSON。本页只读取活动摘要，不显示路线坐标，也不会连接或修改你的账号。摘要保存在本机，供你向 Frost 提问时分析；分析只发送摘要，不发送轨迹。</p>
    <input type="file" accept="application/json,.json" onChange={(event) => void read(event.target.files?.[0])} className="mt-3 w-full border-2 border-black bg-[#f7f1df] p-2 text-[8px]" />
    {error && <p className="mt-2 text-[8px] font-bold text-red-700">{error}</p>}
    {activity && <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap border-2 border-black bg-[#111] p-3 text-[9px] leading-relaxed text-[#7dffb8]">{JSON.stringify(activity, null, 2)}</pre>}
    <FrostSkillResultButton report={report} result={error ? { status: 'failed', summary: '活动 JSON 解析失败，没有读取或修改 Strava 账号。' }
      : activity ? { status: 'completed', summary: '已在手机解析所选 JSON 的活动摘要；来源为用户导入，未独立核实，也未读取或修改在线账号。' } : undefined} />
  </section>;
}

function SleepDetectivePanel({ report }: { report?: FrostSkillPageReporter }) {
  const [entries, setEntries] = useState<SleepEntry[]>(() => { try { return JSON.parse(localStorage.getItem(SLEEP_KEY) || '[]') as SleepEntry[]; } catch { return []; } });
  const [hours, setHours] = useState(7.5);
  const [quality, setQuality] = useState(7);
  const [coffee, setCoffee] = useState(false);
  const [alcohol, setAlcohol] = useState(false);
  const [lateTraining, setLateTraining] = useState(false);
  const save = () => {
    const next = [{ id: crypto.randomUUID(), hours, quality, coffee, alcohol, lateTraining }, ...entries].slice(0, 30);
    setEntries(next); localStorage.setItem(SLEEP_KEY, JSON.stringify(next));
  };
  const compare = (flag: keyof Pick<SleepEntry, 'coffee' | 'alcohol' | 'lateTraining'>) => {
    const yes = entries.filter((entry) => entry[flag]); const no = entries.filter((entry) => !entry[flag]);
    const average = (values: SleepEntry[]) => values.length ? values.reduce((sum, entry) => sum + entry.quality, 0) / values.length : null;
    return { yes: average(yes), no: average(no), yesN: yes.length, noN: no.length };
  };
  const labels = [['coffee', '下午咖啡'], ['alcohol', '饮酒'], ['lateTraining', '晚间训练']] as const;
  return <section className={CARD}>
    <div className="flex items-center gap-2"><Moon className="h-5 w-5" /><h2 className="font-pixel text-[8px]">SLEEP DETECTIVE · LOCAL</h2></div>
    <div className="mt-3 grid grid-cols-2 gap-2"><label className="text-[8px] font-bold">睡眠小时<input type="number" min={0} max={16} step={0.5} value={hours} onChange={(event) => setHours(Number(event.target.value))} className={`${INPUT} mt-1 w-full`} /></label><label className="text-[8px] font-bold">主观质量 0–10<input type="number" min={0} max={10} value={quality} onChange={(event) => setQuality(Number(event.target.value))} className={`${INPUT} mt-1 w-full`} /></label></div>
    <div className="mt-2 flex flex-wrap gap-2 text-[8px]">{labels.map(([key, label]) => <label key={key} className="flex items-center gap-1 border border-black bg-[#f7f1df] px-2 py-1.5"><input type="checkbox" checked={{ coffee, alcohol, lateTraining }[key]} onChange={(event) => ({ coffee: setCoffee, alcohol: setAlcohol, lateTraining: setLateTraining }[key])(event.target.checked)} />{label}</label>)}</div>
    <div className="mt-3 flex items-center gap-2"><Button onClick={save}>保存这一晚</Button><span className="text-[8px] text-black/45">本机记录 {entries.length}/30 晚</span></div>
    <div className="mt-3 grid gap-2 sm:grid-cols-3">{labels.map(([key, label]) => { const value = compare(key); return <div key={key} className="border-2 border-black bg-[#f5f1e8] p-2 text-[8px]"><b>{label}</b><div className="mt-1">有：{value.yes?.toFixed(1) ?? '?'} ({value.yesN}晚)</div><div>无：{value.no?.toFixed(1) ?? '?'} ({value.noN}晚)</div></div>; })}</div>
    <p className="mt-2 text-[8px] text-black/50">{entries.length < 7 ? '样本不足 7 晚：只展示记录，不输出趋势。' : '这里只比较分组均值；相关性不代表因果。'}</p>
    <FrostSkillResultButton report={report} result={entries.length ? { status: 'completed', summary: `手机有 ${entries.length} 晚用户录入的记录。${entries.length < 7 ? '样本不足7晚，只能展示记录，不输出趋势。' : '已在页面展示分组均值，相关性不代表因果。'}不代表传感器测量。` } : undefined} />
  </section>;
}

function MealLensPanel({ taskmasterTaskId }: { taskmasterTaskId?: string }) {
  const [imageUrl, setImageUrl] = useState('');
  const [query, setQuery] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [recording, setRecording] = useState(false);
  const [taskStatus, setTaskStatus] = useState('');
  const foods = useMemo(() => searchCnFoods(query), [query]);
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);
  const choose = (file?: File) => {
    if (!file) return;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(file)); setConfirmed(false);
  };
  const confirm = async () => {
    const food = foods[0];
    if (!food || recording) return;
    setRecording(true); setTaskStatus('Taskmaster 正在登记餐食事实…');
    try {
      const session = await recordMealWithTaskmaster({
        facts: {
          dishes: [food.name], brand: food.brand, portion: food.portion || food.energyBasis,
          calories_kcal: food.energyKcal, protein_g_text: food.proteinText,
          approximate: food.approximate, source: food.source,
        },
        confidence: food.approximate ? 0.72 : 0.9,
        model_version: 'cn-food-library/no-model',
        tool_version: 'meal-lens-taskmaster-adapter/1.0.0',
        input_hash: `${food.id}:${query.trim()}`,
      }, taskmasterTaskId);
      if (session.status !== 'completed') throw new Error(`task_not_completed:${session.status}`);
      setConfirmed(true); setTaskStatus('已由 Taskmaster 写入一次，并保留 Effect 与 Trace');
    } catch (error) { setTaskStatus(`记录失败：${error instanceof Error ? error.message : 'taskmaster_error'}`); }
    finally { setRecording(false); }
  };
  return <section className={CARD}>
    <div className="flex items-center gap-2"><Utensils className="h-5 w-5" /><h2 className="font-pixel text-[8px]">MEAL LENS · CONFIRM FIRST</h2></div>
    <p className="mt-2 text-[8px] text-black/55">照片只在本页本地预览。输入并确认菜名后才查询参考范围；当前不会上传图片或自动写入记录。</p>
    <div className="mt-3 grid gap-2 sm:grid-cols-[140px_1fr]">
      <label className="grid min-h-28 cursor-pointer place-items-center overflow-hidden border-2 border-black bg-[#f7f1df] text-center text-[8px]">{imageUrl ? <img src={imageUrl} alt="本地餐食预览" className="h-full w-full object-cover" /> : <><Camera className="h-6 w-6" />选择餐食照片</>}<input type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => choose(event.target.files?.[0])} /></label>
      <div><div className="flex gap-2"><input value={query} onChange={(event) => { setQuery(event.target.value); setConfirmed(false); setTaskStatus(''); }} placeholder="确认菜名，例如：宫保鸡丁" className={`${INPUT} min-w-0 flex-1`} /><span className="grid place-items-center border-2 border-black px-2 font-pixel text-[6px]"><Search className="h-4 w-4" /></span></div><div className="mt-2"><Button disabled={!query.trim() || foods.length === 0 || recording || confirmed} onClick={() => void confirm()}>{recording ? 'TASKMASTER 执行中…' : confirmed ? '已写入健康记忆' : '确认菜名与份量范围'}</Button></div>{taskStatus && <p className="mt-2 text-[8px] font-bold text-[#087a43]">{taskStatus}</p>}</div>
    </div>
    {confirmed && <div className="mt-3 space-y-2">{foods.slice(0, 5).map((food) => <div key={food.id} className="border border-black p-2 text-[8px]"><b>{food.name}</b> · {food.brand}<div className="mt-1">{food.portion || food.energyBasis}：{food.energyText} kcal {food.proteinText ? `· 蛋白 ${food.proteinText}g` : ''}</div><div className="mt-1 text-black/45">估算范围 · health-coach 中国食品库</div></div>)}</div>}
  </section>;
}

function OssConnectorPanel({ kind, report }: { kind: 'wger' | 'mealie'; report?: FrostSkillPageReporter }) {
  const config = kind === 'wger' ? {
    icon: Dumbbell,
    title: 'WGER · TRAINING PLANS',
    source: 'https://github.com/wger-project/wger',
    description: '训练、动作、计划与进度由你连接的 wger 提供。Frost 只加载结构化计划，并在开始训练前复核 readiness 与停止规则。',
    ready: ['Manifest 已登记', 'Frost 语义路由已接通', 'Taskmaster 权限与确认门已声明'],
    pending: '尚未配置 wger 服务与令牌，因此不会显示虚构计划。',
  } : {
    icon: ChefHat,
    title: 'MEALIE · RECOVERY KITCHEN',
    source: 'https://github.com/mealie-recipes/mealie',
    description: '食谱、餐食计划与购物清单来自你自己的 Mealie。Frost 只做恢复目标筛选，任何创建或修改都必须再次确认。',
    ready: ['Manifest 已登记', 'Frost 语义路由已接通', '写操作确认门已声明'],
    pending: '尚未配置 Mealie 服务与令牌，因此不会显示虚构食谱。',
  };
  const Icon = config.icon;
  return <section className={CARD}>
    <div className="flex items-center gap-2"><Icon className="h-5 w-5" /><h2 className="font-pixel text-[8px]">{config.title}</h2></div>
    <p className="mt-2 text-[9px] leading-relaxed text-black/65">{config.description}</p>
    <div className="mt-3 border-2 border-black bg-[#f7f1df] p-3">
      <div className="flex items-center justify-between gap-2"><b className="font-pixel text-[7px]">LOCAL ADAPTER</b><span className="border border-black bg-[#fff0b5] px-2 py-1 text-[8px] font-bold">待连接</span></div>
      <ul className="mt-2 space-y-1 text-[8px]">{config.ready.map((item) => <li key={item}>✓ {item}</li>)}</ul>
      <p className="mt-2 border-t border-black/20 pt-2 text-[8px] font-bold text-[#8a4b00]">{config.pending}</p>
    </div>
    <a href={config.source} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 border-2 border-black bg-white px-3 py-2 text-[8px] font-black active:translate-y-px">查看开源项目 <ExternalLink className="h-3.5 w-3.5" /></a>
    <FrostSkillResultButton report={report} result={{ status: 'blocked', summary: config.pending }} />
  </section>;
}

export const LIFESTYLE_SKILL_IDS = new Set([
  'frost.outdoor-window', 'frost.strava-replay', 'frost.sleep-detective',
  'frost.meal-lens', 'frost.wger-planner', 'frost.mealie-kitchen',
]);

export default function LifestyleSkillRuntimePanel({ skillId, taskmasterTaskId, report }: Props) {
  if (skillId === 'frost.outdoor-window') return <OutdoorWindowPanel report={report} />;
  if (skillId === 'frost.strava-replay') return <StravaReplayPanel report={report} />;
  if (skillId === 'frost.sleep-detective') return <SleepDetectivePanel report={report} />;
  if (skillId === 'frost.meal-lens') return <MealLensPanel taskmasterTaskId={taskmasterTaskId} />;
  if (skillId === 'frost.wger-planner') return <OssConnectorPanel kind="wger" report={report} />;
  if (skillId === 'frost.mealie-kitchen') return <OssConnectorPanel kind="mealie" report={report} />;
  return <section className={CARD}><Activity className="mr-2 inline h-4 w-4" />Lifestyle Skill 尚未登记。</section>;
}
