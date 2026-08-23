import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Barcode, Camera, Check, ChevronRight, CircleHelp, Droplets, Eye, ImagePlus,
  Leaf, Pencil, Plus, ScanLine, Sparkles, UtensilsCrossed, X,
} from 'lucide-react';
import { recordMealWithTaskmaster } from '../lib/healthTaskmasterRuntime';

type FoodItem = {
  name: string;
  detail: string;
  grams: [number, number];
  kcal: [number, number];
  confidence: number;
  box: string;
};

type DemoMeal = {
  id: string;
  title: string;
  time: string;
  image: string;
  route: string;
  kcal: [number, number];
  macros: { protein: number; carbs: number; fat: number; fiber: number };
  question: string;
  items: FoodItem[];
};

const DEMO_MEALS: DemoMeal[] = [
  {
    id: 'lunch',
    title: '香草鸡肉考伯碗',
    time: '午餐 · 12:36',
    image: '/assets/food-demo/food-sense-cobb-bowl.jpg',
    route: 'SAM 3 区 → Qwen → 营养库',
    kcal: [480, 590],
    macros: { protein: 45, carbs: 28, fat: 24, fiber: 9 },
    question: '沙拉酱是否全部吃完？这会让整餐相差约 80 kcal。',
    items: [
      { name: '香草鸡胸', detail: '烤制 · 去皮', grams: [120, 150], kcal: [190, 250], confidence: 94, box: 'left-[42%] top-[34%] h-[43%] w-[27%]' },
      { name: '鸡蛋与混合生菜', detail: '水煮 · 生食', grams: [180, 235], kcal: [130, 175], confidence: 96, box: 'left-[28%] top-[16%] h-[72%] w-[54%]' },
      { name: '橄榄与奶酪', detail: '沙拉配料', grams: [55, 80], kcal: [160, 215], confidence: 89, box: 'right-[20%] top-[27%] h-[48%] w-[25%]' },
    ],
  },
  {
    id: 'breakfast',
    title: '菠菜芝士欧姆蛋与莓果',
    time: '早餐 · 08:12',
    image: '/assets/food-demo/food-sense-omelette-fruit.jpg',
    route: 'SAM 2 区 → Qwen → 营养库',
    kcal: [390, 470],
    macros: { protein: 27, carbs: 24, fat: 25, fiber: 6 },
    question: '欧姆蛋里的芝士夹心是否全部吃完？',
    items: [
      { name: '菠菜芝士欧姆蛋', detail: '煎制 · 芝士夹心', grams: [180, 225], kcal: [315, 385], confidence: 95, box: 'left-[19%] top-[37%] h-[50%] w-[65%]' },
      { name: '莓果与菠萝', detail: '生食', grams: [105, 145], kcal: [65, 95], confidence: 97, box: 'left-[19%] top-[6%] h-[34%] w-[42%]' },
    ],
  },
  {
    id: 'fruit',
    title: '草莓蓝纹芝士沙拉',
    time: '加餐 · 昨天 16:20',
    image: '/assets/food-demo/food-sense-strawberry-salad.jpg',
    route: 'SAM 3 区 → Qwen → 营养库',
    kcal: [320, 410],
    macros: { protein: 12, carbs: 27, fat: 26, fiber: 8 },
    question: '蓝纹芝士和松子是否全部吃完？',
    items: [
      { name: '混合生菜', detail: '生食', grams: [115, 155], kcal: [25, 40], confidence: 97, box: 'left-[29%] top-[18%] h-[70%] w-[67%]' },
      { name: '草莓与圣女果', detail: '生食', grams: [130, 175], kcal: [45, 70], confidence: 96, box: 'left-[49%] top-[28%] h-[50%] w-[42%]' },
      { name: '蓝纹芝士与松子', detail: '沙拉配料', grams: [45, 65], kcal: [230, 310], confidence: 91, box: 'right-[9%] top-[18%] h-[45%] w-[34%]' },
    ],
  },
  {
    id: 'salad',
    title: '煎三文鱼芦笋餐盘',
    time: '晚餐 · 周一 18:46',
    image: '/assets/food-demo/food-sense-salmon-asparagus.jpg',
    route: 'SAM 3 区 → Qwen → 营养库',
    kcal: [510, 620],
    macros: { protein: 42, carbs: 32, fat: 28, fiber: 7 },
    question: '土豆泥里是否加了黄油或奶油？',
    items: [
      { name: '香煎三文鱼', detail: '煎制', grams: [130, 165], kcal: [280, 360], confidence: 96, box: 'left-[17%] top-[39%] h-[38%] w-[31%]' },
      { name: '烤芦笋', detail: '烤制', grams: [90, 120], kcal: [20, 35], confidence: 98, box: 'left-[40%] top-[35%] h-[42%] w-[19%]' },
      { name: '奶油土豆泥', detail: '脂肪用量待确认', grams: [160, 210], kcal: [190, 250], confidence: 90, box: 'right-[12%] top-[17%] h-[42%] w-[32%]' },
    ],
  },
];

const PORTIONS = [
  { label: '吃了一半', value: 0.5 },
  { label: '约 3/4', value: 0.75 },
  { label: '全部吃完', value: 1 },
];

function scaleRange(range: [number, number], scale: number) {
  return range.map((value) => Math.round(value * scale)) as [number, number];
}

function Macro({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <div className="border-r border-black/20 px-1 text-center last:border-r-0">
      <div className="font-pixel text-[10px] leading-none">{value}<span className="ml-0.5 text-[6px]">{unit}</span></div>
      <div className="mt-1 flex items-center justify-center gap-1 text-[7px] text-black/50">
        <span className="h-1.5 w-1.5 rounded-full border border-black" style={{ background: color }} />{label}
      </div>
    </div>
  );
}

function SegmentOverlay({ items }: { items: FoodItem[] }) {
  return <>{items.map((item, index) => (
    <div key={item.name} className={`absolute border-2 ${index === 0 ? 'border-[#7CFF6B]' : index === 1 ? 'border-[#ffe45c]' : 'border-[#ff70c9]'} ${item.box}`}>
      <span className="absolute -left-0.5 -top-4 border border-black bg-black px-1 font-pixel text-[6px] text-white">{index + 1}</span>
    </div>
  ))}</>;
}

interface FoodPhotosTabProps { embedded?: boolean }

export default function FoodPhotosTab({ embedded = false }: FoodPhotosTabProps) {
  const [section, setSection] = useState<'today' | 'history'>('today');
  const [mealId, setMealId] = useState(DEMO_MEALS[0].id);
  const [portion, setPortion] = useState(1);
  const [answer, setAnswer] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState('');
  const [uploadedImage, setUploadedImage] = useState('');
  const [colorPreviewOpen, setColorPreviewOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const meal = DEMO_MEALS.find((candidate) => candidate.id === mealId) || DEMO_MEALS[0];
  const image = uploadedImage || meal.image;
  const totalKcal = scaleRange(meal.kcal, portion);
  const totalGrams = useMemo(() => meal.items.reduce((sum, item) => sum + Math.round((item.grams[0] + item.grams[1]) / 2 * portion), 0), [meal, portion]);

  useEffect(() => () => { if (uploadedImage.startsWith('blob:')) URL.revokeObjectURL(uploadedImage); }, [uploadedImage]);
  useEffect(() => { if (contentRef.current) contentRef.current.scrollTop = 0; }, [section, mealId]);

  const selectMeal = (id: string) => {
    if (uploadedImage.startsWith('blob:')) URL.revokeObjectURL(uploadedImage);
    setUploadedImage(''); setMealId(id); setSection('today'); setPortion(1); setAnswer(''); setConfirmed(false); setNotice('');
  };

  const choosePhoto = (file?: File) => {
    if (!file) return;
    if (uploadedImage.startsWith('blob:')) URL.revokeObjectURL(uploadedImage);
    setUploadedImage(URL.createObjectURL(file));
    setConfirmed(false);
    setNotice('照片已载入。当前是 UI 演示版，下一步再接真实 SAM / Qwen 推理接口。');
    setSection('today');
  };

  const confirmMeal = async () => {
    if (confirmed || confirming) return;
    setConfirming(true);
    setNotice('Taskmaster 正在校验餐食事实并写入 Effect Ledger…');
    try {
      const confidence = meal.items.reduce((sum, item) => sum + item.confidence, 0) / meal.items.length / 100;
      const completed = await recordMealWithTaskmaster({
        facts: {
          meal_id: meal.id,
          title: meal.title,
          dishes: meal.items.map((item) => item.name),
          portion,
          answer: answer || '未回答',
          grams_estimate: totalGrams,
          calories_kcal_range: totalKcal,
          macros_g: {
            protein: Math.round(meal.macros.protein * portion),
            carbs: Math.round(meal.macros.carbs * portion),
            fat: Math.round(meal.macros.fat * portion),
            fiber: Math.round(meal.macros.fiber * portion),
          },
          source: uploadedImage ? 'local-photo-ui-observation' : 'foodsense-demo-observation',
        },
        confidence,
        model_version: uploadedImage ? 'ui-observation/no-model' : 'foodsense-demo/v1',
        tool_version: 'photos-taskmaster-adapter/1.0.0',
        input_hash: `${meal.id}:${portion}:${answer || 'unknown'}:${uploadedImage ? 'upload' : 'demo'}`,
      });
      if (completed.status !== 'completed') throw new Error(`task_not_completed:${completed.status}`);
      setConfirmed(true);
      setNotice(`Taskmaster 已完成 · ${completed.source_event_ids.length} 条健康事实 · 写入只执行一次`);
    } catch (error) {
      setNotice(`记录失败：${error instanceof Error ? error.message : 'taskmaster_error'}`);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className={`relative h-full bg-[#EAEAEA] font-sans ${embedded ? 'overflow-y-auto' : 'flex flex-col overflow-hidden'}`}>
      <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(event) => choosePhoto(event.target.files?.[0])} />

      {!embedded && <div className="flex h-[30px] shrink-0 items-center justify-between border-b-2 border-black bg-[#EAEAEA] px-4">
        <span className="font-pixel text-[8px] tracking-[0.14em]">POCKET EARTH</span>
        <span className="flex items-center gap-1 font-pixel text-[6px] text-[#087a43]"><span className="h-1.5 w-1.5 rounded-full bg-[#00dd77]" />HEALTH AGENT</span>
      </div>}

      <header className="shrink-0 border-b-2 border-black bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-pixel text-[18px] uppercase leading-none tracking-wider">PHOTOS</h1>
            <p className="mt-1.5 text-[10px] font-medium tracking-wide text-black/55">看懂一餐，记进今天，再决定怎么动</p>
          </div>
          <button type="button" onClick={() => setNotice('搭子已读取今天的饮食与运动上下文。')} className="relative h-10 w-10 overflow-hidden border-2 border-black bg-[#7CFF6B]">
            <img src="/assets/animal-agent-avatars/animal-001-r04-c02.png" alt="健康搭子" className="h-full w-full object-cover" />
            <span className="absolute bottom-0 right-0 h-2 w-2 border-l border-t border-black bg-[#00e979]" />
          </button>
        </div>
      </header>

      <div className="shrink-0 border-b-2 border-black bg-black px-3 py-2">
        <div className="grid grid-cols-2 gap-1.5">
          {([['today', '识别'], ['history', '餐食记录']] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setSection(id)} className={`border px-2 py-1.5 font-pixel text-[7px] ${section === id ? 'border-[#00ff88] bg-[#00ff88] text-black' : 'border-white/50 text-white/70'}`}>{label}</button>
          ))}
        </div>
      </div>

      <div ref={contentRef} className={embedded ? 'overflow-visible' : 'min-h-0 flex-1 overflow-y-auto overscroll-contain'}>
        {section === 'today' ? <div className="space-y-3 p-3 pb-8">
          <section className="border-2 border-black bg-[#f5f0e4] p-2.5">
            <div className="flex items-end justify-between">
              <div><div className="font-pixel text-[7px] text-black/50">TODAY · AUG 19</div><div className="mt-1 text-[12px] font-bold">今天的能量账本</div></div>
              <div className="text-right"><span className="font-pixel text-[18px]">1,326</span><span className="text-[8px] text-black/45"> / 2,100 kcal</span></div>
            </div>
            <div className="mt-2 h-2 overflow-hidden border border-black bg-white"><div className="h-full w-[63%] border-r border-black bg-[#7CFF6B]" /></div>
            <div className="mt-2 grid grid-cols-3 gap-1 text-[7px]">
              <div className="border border-black/30 bg-white px-1.5 py-1"><b>蛋白质 74g</b><span className="float-right text-black/40">67%</span></div>
              <div className="border border-black/30 bg-white px-1.5 py-1"><b>蔬果 4份</b><span className="float-right text-black/40">80%</span></div>
              <div className="border border-black/30 bg-white px-1.5 py-1"><b>饮水 1.4L</b><span className="float-right text-black/40">56%</span></div>
            </div>
          </section>

          <div className="grid grid-cols-3 gap-1.5">
            <button type="button" onClick={() => fileInput.current?.click()} className="flex items-center justify-center gap-1.5 border-2 border-black bg-[#7CFF6B] py-2 text-[8px] font-bold"><Camera className="h-3.5 w-3.5" />拍一餐</button>
            <button type="button" onClick={() => fileInput.current?.click()} className="flex items-center justify-center gap-1.5 border-2 border-black bg-white py-2 text-[8px] font-bold"><ImagePlus className="h-3.5 w-3.5" />从相册</button>
            <button type="button" onClick={() => setNotice('包装食品将走“条码优先 + OCR 兜底”，不占用食物识别模型。')} className="flex items-center justify-center gap-1.5 border-2 border-black bg-[#fff3b8] py-2 text-[8px] font-bold"><Barcode className="h-3.5 w-3.5" />扫包装</button>
          </div>

          {notice && <div className="border-l-4 border-black bg-white px-2.5 py-2 text-[8px] leading-relaxed text-black/65">{notice}</div>}

          <section className="overflow-hidden border-2 border-black bg-white">
            <div className="flex items-center justify-between border-b-2 border-black bg-black px-2.5 py-2 text-white">
              <div><div className="font-pixel text-[8px]">{meal.time}</div><div className="mt-1 text-[8px] text-white/60">{uploadedImage ? '本地照片 · 待接真实推理' : 'DATASET UI SAMPLE · FOODSENSE'}</div></div>
              <span className="border border-[#7CFF6B] px-1.5 py-1 font-pixel text-[6px] text-[#7CFF6B]">{uploadedImage ? 'PREVIEW' : `${meal.items.length} REGIONS`}</span>
            </div>

            <button type="button" onClick={() => setColorPreviewOpen(true)} aria-label={`查看${meal.title}原图`} className="relative block h-[205px] w-full overflow-hidden border-b-2 border-black bg-[#c9c9c4] text-left">
              <img src={image} alt={meal.title} className="h-full w-full object-cover" />
              {!uploadedImage && <SegmentOverlay items={meal.items} />}
              <div className="absolute bottom-2 left-2 border-2 border-black bg-[#f5f0e4]/95 px-2 py-1.5">
                <div className="font-pixel text-[7px]">{meal.route}</div>
              </div>
              <span className="absolute right-2 top-2 border border-black bg-[#7CFF6B] px-1.5 py-1 font-pixel text-[6px]">需确认 1 项</span>
              <span className="absolute bottom-2 right-2 flex items-center gap-1 border border-white/70 bg-black/80 px-1.5 py-1 font-pixel text-[6px] text-white"><Eye className="h-2.5 w-2.5" />查看原图</span>
            </button>

            <div className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div><div className="text-[13px] font-black">{meal.title}</div><div className="mt-1 text-[8px] text-black/45">估计食用 {totalGrams}g · 不是伪精确值</div></div>
                <div className="shrink-0 text-right"><div className="font-pixel text-[17px] text-[#087a43]">{totalKcal[0]}–{totalKcal[1]}</div><div className="mt-1 text-[7px] text-black/45">KCAL · 营养库计算</div></div>
              </div>

              <div className="mt-3 grid grid-cols-4 border-y border-black/20 py-2">
                <Macro label="蛋白质" value={Math.round(meal.macros.protein * portion)} unit="g" color="#7CFF6B" />
                <Macro label="碳水" value={Math.round(meal.macros.carbs * portion)} unit="g" color="#ffe45c" />
                <Macro label="脂肪" value={Math.round(meal.macros.fat * portion)} unit="g" color="#ff70c9" />
                <Macro label="膳食纤维" value={Math.round(meal.macros.fiber * portion)} unit="g" color="#9fdcff" />
              </div>

              <div className="mt-3 space-y-1.5">
                {meal.items.map((item, index) => {
                  const grams = scaleRange(item.grams, portion); const kcal = scaleRange(item.kcal, portion);
                  return <button type="button" key={item.name} onClick={() => setNotice(`编辑“${item.name}”：正式版可修改菜名、克重范围与食用比例。`)} className="grid w-full grid-cols-[22px_1fr_auto_18px] items-center gap-2 border border-black/25 bg-[#f8f8f4] px-2 py-2 text-left">
                    <span className={`flex h-5 w-5 items-center justify-center border border-black font-pixel text-[7px] ${index === 0 ? 'bg-[#7CFF6B]' : index === 1 ? 'bg-[#ffe45c]' : 'bg-[#ffb9e5]'}`}>{index + 1}</span>
                    <span><b className="block text-[9px]">{item.name}</b><small className="block text-[7px] text-black/45">{item.detail} · 置信 {item.confidence}%</small></span>
                    <span className="text-right"><b className="block font-pixel text-[8px]">{grams[0]}–{grams[1]}g</b><small className="block text-[7px] text-black/45">{kcal[0]}–{kcal[1]} kcal</small></span>
                    <Pencil className="h-3 w-3 text-black/35" />
                  </button>;
                })}
              </div>
            </div>
          </section>

          <section className="border-2 border-black bg-[#fff3b8] p-3">
            <div className="flex items-start gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-black bg-white"><CircleHelp className="h-4 w-4" /></div>
              <div><div className="font-pixel text-[8px]">搭子只问最关键的一题</div><p className="mt-1 text-[9px] font-medium leading-relaxed">{meal.question}</p></div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1">
              {['是', '没有 / 去皮', '不确定'].map((value) => <button type="button" key={value} onClick={() => { setAnswer(value); setConfirmed(false); }} className={`border border-black px-1 py-1.5 text-[7px] font-bold ${answer === value ? 'bg-black text-white' : 'bg-white'}`}>{value}</button>)}
            </div>
          </section>

          <section className="border-2 border-black bg-white p-3">
            <div className="flex items-center justify-between"><span className="font-pixel text-[8px]">实际吃了多少？</span><span className="text-[7px] text-black/40">点选后即时重算</span></div>
            <div className="mt-2 grid grid-cols-3 gap-1">
              {PORTIONS.map((item) => <button type="button" key={item.value} onClick={() => { setPortion(item.value); setConfirmed(false); }} className={`border-2 border-black py-2 text-[7px] font-bold ${portion === item.value ? 'bg-[#7CFF6B]' : 'bg-[#f2f2ee]'}`}>{item.label}</button>)}
            </div>
          </section>

          <button type="button" disabled={confirming} onClick={() => void confirmMeal()} className={`flex w-full items-center justify-center gap-2 border-2 border-black py-3 font-pixel text-[8px] disabled:opacity-60 ${confirmed ? 'bg-black text-[#7CFF6B]' : 'bg-[#7CFF6B] text-black'}`}>
            {confirmed ? <><Check className="h-4 w-4" />已由 TASKMASTER 写入健康记忆</> : confirming ? 'TASKMASTER 执行中…' : <><Plus className="h-4 w-4" />确认并记入今天</>}
          </button>

          <section className="border-2 border-black bg-[#eaf8ff] p-3">
            <div className="flex items-center justify-between"><span className="flex items-center gap-1.5 font-pixel text-[8px]"><Sparkles className="h-3.5 w-3.5" />AGENT NEXT</span><span className="border border-black bg-white px-1 py-0.5 text-[6px]">基于今日记录</span></div>
            <p className="mt-2 text-[9px] leading-relaxed">午餐蛋白质充足。晚间可优先安排 <b>25 分钟轻松跑走</b>；完成后路线会回到地图，种下一棵今天的树。</p>
            <button type="button" onClick={() => setNotice('运动建议将由统一 Agent 路由到已安装的跑走 Skill。')} className="mt-2 flex w-full items-center justify-between border border-black bg-white px-2 py-2 text-[8px] font-bold"><span>查看建议的运动 Skill</span><ChevronRight className="h-3.5 w-3.5" /></button>
          </section>
        </div> : <div className="space-y-3 p-3 pb-8">
          <section className="border-2 border-black bg-[#7CFF6B] p-3">
            <div className="font-pixel text-[8px]">THIS WEEK / 本周</div>
            <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
              <div className="border border-black bg-white p-2"><b className="font-pixel text-[14px]">12</b><span className="mt-1 block text-[7px] text-black/45">已确认餐食</span></div>
              <div className="border border-black bg-white p-2"><b className="font-pixel text-[14px]">86%</b><span className="mt-1 block text-[7px] text-black/45">蛋白质达成</span></div>
              <div className="border border-black bg-white p-2"><b className="font-pixel text-[14px]">7</b><span className="mt-1 block text-[7px] text-black/45">蔬果份数</span></div>
            </div>
          </section>

          <div className="flex items-center justify-between border-b-2 border-black pb-2"><span className="font-pixel text-[9px]">MEAL MEMORY / 餐食记忆</span><span className="text-[7px] text-black/45">真实样图 · FoodSense</span></div>
          <div className="grid grid-cols-2 gap-2.5">
            {DEMO_MEALS.map((entry) => <button type="button" key={entry.id} onClick={() => selectMeal(entry.id)} className="overflow-hidden border-2 border-black bg-white text-left">
              <div className="relative h-[120px] overflow-hidden border-b-2 border-black"><img src={entry.image} alt={entry.title} className="h-full w-full object-cover" /><span className="absolute left-1.5 top-1.5 border border-black bg-[#7CFF6B] px-1 py-0.5 font-pixel text-[6px]">{entry.kcal[0]}–{entry.kcal[1]}</span></div>
              <div className="p-2"><b className="block text-[9px]">{entry.title}</b><span className="mt-1 block text-[7px] text-black/45">{entry.time}</span><span className="mt-2 flex items-center justify-between border-t border-black/15 pt-1.5 text-[7px]"><span>{entry.items.length} 个食物区域</span><ChevronRight className="h-3 w-3" /></span></div>
            </button>)}
          </div>

          <section className="border-2 border-black bg-white p-3">
            <div className="font-pixel text-[8px]">四种入口，一份健康记忆</div>
            <div className="mt-2 space-y-1.5 text-[8px]">
              <div className="flex items-center gap-2 border border-black/20 p-2"><UtensilsCrossed className="h-4 w-4" /><b>单道菜 / 餐盘</b><span className="ml-auto text-black/40">Qwen</span></div>
              <div className="flex items-center gap-2 border border-black/20 p-2"><Leaf className="h-4 w-4" /><b>散装食材</b><span className="ml-auto text-black/40">Qwen 食材适配</span></div>
              <div className="flex items-center gap-2 border border-black/20 p-2"><ScanLine className="h-4 w-4" /><b>多菜 / 混合餐盘</b><span className="ml-auto text-black/40">SAM → Qwen</span></div>
              <div className="flex items-center gap-2 border border-black/20 p-2"><Barcode className="h-4 w-4" /><b>包装食品</b><span className="ml-auto text-black/40">条码 → OCR</span></div>
            </div>
          </section>

          <div className="flex items-center justify-center gap-1.5 py-2 text-[7px] text-black/35"><Droplets className="h-3 w-3" />原始饮食照片默认私有 · 只有确认后的结构化事件进入记忆</div>
        </div>}
      </div>

      {colorPreviewOpen && <div className="fixed inset-0 z-[200] flex items-center justify-center bg-transparent p-4" role="dialog" aria-modal="true" aria-label={`${meal.title}原图`} onClick={() => setColorPreviewOpen(false)}>
        <div className="w-full max-w-[560px] border-2 border-black bg-white p-2" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-black/20 pb-2 text-black">
            <div><div className="font-pixel text-[8px]">PHOTO ORIGINAL</div><div className="mt-1 text-[9px] text-black/50">{meal.title}</div></div>
            <button type="button" onClick={() => setColorPreviewOpen(false)} aria-label="关闭原图" className="grid h-8 w-8 place-items-center border-2 border-black bg-white"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-2 max-h-[70dvh] overflow-hidden border-2 border-black bg-[#eaeaea]">
            <img src={image} alt={`${meal.title}原图`} className="max-h-[70dvh] w-full object-contain" />
          </div>
          <div className="pt-2 text-center font-pixel text-[6px] text-black/40">点击外部返回识别结果</div>
        </div>
      </div>}
    </div>
  );
}
