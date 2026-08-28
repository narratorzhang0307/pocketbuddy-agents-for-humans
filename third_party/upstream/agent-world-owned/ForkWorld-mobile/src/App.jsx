import { useMemo, useState } from 'react'
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  BatteryMedium,
  BookOpen,
  Box,
  Camera,
  Check,
  ChevronRight,
  Circle,
  Clock3,
  Coffee,
  Copy,
  Cpu,
  Eraser,
  Eye,
  Flag,
  Footprints,
  GitBranch,
  Grip,
  Hand,
  Image as ImageIcon,
  Images,
  Layers3,
  Lock,
  Map,
  MapPinned,
  Move,
  Navigation,
  Pencil,
  Play,
  Plus,
  Radio,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  Scissors,
  Search,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Ticket,
  TrainFront,
  Trash2,
  Undo2,
  Upload,
  Users,
  Volume2,
  WandSparkles,
  Wifi,
  X,
  ZoomIn,
} from 'lucide-react'
import { BRANCH_EVENTS, CAPTURE_STEPS, INITIAL_AGENTS, VISITOR, WORLD_THEMES } from './data'
import { DoodleTree, IsometricBuilding, ObjectAgent, TinyPlant } from './lineArt'

const mainScreens = ['dock', 'world', 'gallery', 'worldline']

function BackHeader({ title, eyebrow, onBack, action }) {
  return <header className="sub-header">
    <button className="icon-button" onClick={onBack} aria-label="返回"><ArrowLeft size={21} /></button>
    <div><small>{eyebrow}</small><strong>{title}</strong></div>
    {action || <span className="header-spacer" />}
  </header>
}

function PaperButton({ children, onClick, tone = 'ink', disabled = false, className = '' }) {
  return <button className={`paper-button paper-button--${tone} ${className}`} onClick={onClick} disabled={disabled}>{children}</button>
}

function BottomNavigation({ active, onNavigate, onCapture, badge }) {
  const items = [
    { id: 'dock', label: '世界', icon: Flag },
    { id: 'world', label: '城市', icon: Map },
    { id: 'capture', label: '造物', icon: Plus, center: true },
    { id: 'worldline', label: '世界线', icon: GitBranch },
    { id: 'gallery', label: '图鉴', icon: BookOpen },
  ]
  return <nav className="bottom-navigation" aria-label="主要导航">
    {items.map(({ id, label, icon: Icon, center }) => <button
      key={id}
      className={`${active === id ? 'is-active' : ''} ${center ? 'is-capture' : ''}`}
      onClick={() => center ? onCapture() : onNavigate(id)}
      aria-label={center ? '拍照创造物灵' : label}
    >
      <span className="nav-icon"><Icon size={center ? 28 : 20} />{id === 'worldline' && badge && <i />}</span>
      <small>{label}</small>
    </button>)}
  </nav>
}

function DoodleTitle({ children, note }) {
  return <div className="doodle-title"><h1>{children}</h1>{note && <span>{note}</span>}</div>
}

function WorldMiniature({ theme }) {
  const typeA = theme.id === 'everyday' ? 'cafe' : theme.id === 'stardom' ? 'stage' : 'lab'
  const typeB = theme.id === 'everyday' ? 'library' : theme.id === 'stardom' ? 'tower' : 'energy'
  const agentA = theme.id === 'everyday' ? 'mug' : theme.id === 'stardom' ? 'mic' : 'rocket'
  const agentB = theme.id === 'everyday' ? 'book' : theme.id === 'stardom' ? 'camera' : 'bot'
  return <div className={`world-miniature world-theme--${theme.id}`} style={{ '--paper': theme.paper, '--line': theme.line, '--accent': theme.accent, '--accent-2': theme.accent2 }}>
    <svg viewBox="0 0 260 140" className="mini-ground" aria-hidden="true">
      <path d="m24 70 104-53 108 52-106 57z" />
      <path className="mini-road" d="M43 79 147 27m-18 91 88-47" />
      {theme.id === 'future' && <><path className="mini-orbit" d="M25 62q102-48 207 0" /><circle cx="130" cy="22" r="4" /></>}
      {theme.id === 'stardom' && <><path className="mini-spot" d="m130 18-42 96h86z" /><circle cx="129" cy="18" r="5" /></>}
    </svg>
    <IsometricBuilding type={typeA} accent={theme.accent} className="mini-building mini-building--a" />
    <IsometricBuilding type={typeB} accent={theme.accent2} className="mini-building mini-building--b" />
    <ObjectAgent type={agentA} accent={theme.accent} className="mini-agent mini-agent--a" />
    <ObjectAgent type={agentB} accent={theme.accent2} className="mini-agent mini-agent--b" />
  </div>
}

function WorldDock({ onOpen, onPublic }) {
  return <main className="paper-page dock-page">
    <div className="dock-heading">
      <div><p className="eyebrow">FORKWORLD · WORLD DOCK</p><DoodleTitle note="3 个世界">我的世界们</DoodleTitle></div>
      <button className="avatar-stamp" aria-label="个人设置">ZC</button>
    </div>
    <p className="manifesto">我的创造即我，我创造的世界即我。</p>
    <div className="world-stack">
      {Object.values(WORLD_THEMES).map((theme, index) => <article className="world-dock-card" key={theme.id} style={{ '--paper': theme.paper, '--line': theme.line, '--accent': theme.accent, '--accent-2': theme.accent2 }}>
        <button className="world-card-open" onClick={() => onOpen(theme.id)} aria-label={`打开${theme.name}`}>
          <WorldMiniature theme={theme} />
          <div className="world-card-copy">
            <div><small>WORLD 0{index + 1}</small><h2>{theme.name}</h2><p>{theme.english}</p></div>
            <ChevronRight size={21} />
          </div>
        </button>
        <div className="dna-strip"><span>{theme.architecture}</span><span>{theme.terrain}</span><span>{theme.time}</span></div>
      </article>)}
    </div>
    <section className="dna-note">
      <div><Sparkles size={18} /><strong>World DNA Design System</strong></div>
      <p>纸张、线宽、建筑包、地形与动作共同决定世界气质。即使隐藏文字，三座城也不会长得一样。</p>
      <div className="dna-swatches"><i /><i /><i /><span>1—3 个强调色 / 世界</span></div>
    </section>
    <button className="text-link" onClick={onPublic}><Eye size={16} /> 查看我的公开世界镜像</button>
  </main>
}

const tileRows = [
  [68, 116], [118, 91], [168, 66], [218, 41],
  [18, 143], [68, 168], [118, 143], [168, 118], [218, 93], [268, 68],
  [18, 195], [68, 220], [118, 195], [168, 170], [218, 145], [268, 120], [318, 95],
  [68, 272], [118, 247], [168, 222], [218, 197], [268, 172], [318, 147],
  [118, 299], [168, 274], [218, 249], [268, 224], [318, 199],
]

function CityGround({ theme, branch }) {
  return <svg className="city-ground" viewBox="0 0 430 420" aria-hidden="true">
    <defs><pattern id={`dots-${theme.id}`} width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".7" fill={theme.line} opacity=".14" /></pattern></defs>
    <rect x="0" y="0" width="430" height="420" fill={`url(#dots-${theme.id})`} />
    <g className="city-tiles">{tileRows.map(([x, y], index) => <path key={index} d={`M${x} ${y}l48-24 48 24-48 25z`} className={index % 4 === 0 ? 'tile-accent' : ''} />)}</g>
    {theme.id === 'everyday' && <g className="everyday-roads"><path d="M27 181 213 88l190 96M77 258l189-94 93 48M121 316l187-92" /><path className="water-line" d="M20 235q55-28 110 2t110 0" /></g>}
    {theme.id === 'stardom' && <g className="stardom-ground"><path className="spotlight" d="M213 13 100 307h224z" /><path d="M24 181 215 87l190 95M76 257l189-94 94 48" /><circle cx="214" cy="87" r="8" /><path d="m205 87 9-18 9 18" /></g>}
    {theme.id === 'future' && <g className="future-ground"><path d="M25 181 214 87l190 95M75 258l191-95 93 49" /><ellipse cx="215" cy="188" rx="179" ry="92" /><ellipse cx="215" cy="188" rx="116" ry="58" /><path className="energy-path" d="M43 239 162 180 259 229 379 169" /></g>}
    {branch && <path className="visitor-path" style={{ stroke: VISITOR.accent }} d="M38 276q65-62 127-10t105-27q43-43 111 0" />}
  </svg>
}

const cityConfig = {
  everyday: {
    buildings: [
      ['cafe', 'building-a', '纸杯咖啡店'], ['library', 'building-b', '折页图书馆'], ['house', 'building-c', '北巷住宅'], ['station', 'building-d', '南站台'],
    ],
    agents: [
      ['nana', 'plush', 'Nana', '正在陪小鸟发呆', 'agent-a'], ['kiki', 'camera', 'Kiki', '去广场记录演出', 'agent-b'], ['page', 'book', 'Page', '整理一段新故事', 'agent-c'], ['lumi', 'lamp', 'Lumi', '白天休息中', 'agent-d'], ['echo', 'headphones', 'Echo', '收集清晨声音', 'agent-e'],
    ],
  },
  stardom: {
    buildings: [['stage', 'building-a', '主舞台'], ['tower', 'building-b', '热搜塔'], ['house', 'building-c', '后台'], ['station', 'building-d', '媒体通道']],
    agents: [['stella', 'mic', 'Stella', '正在走台', 'agent-a'], ['flash', 'camera', 'Flash', '记录红毯入口', 'agent-b'], ['halo', 'headphones', 'Halo', '检查返听', 'agent-c'], ['page', 'book', '合同夹', '等待签字', 'agent-d']],
  },
  future: {
    buildings: [['lab', 'building-a', '量子实验室'], ['energy', 'building-b', '能源塔'], ['pod', 'building-c', '殖民舱'], ['station', 'building-d', '轨道站']],
    agents: [['nova', 'rocket', 'Nova', '校准轨道参数', 'agent-a'], ['bit', 'bot', 'Bit', '搬运电子零件', 'agent-b'], ['log', 'book', 'Log-17', '记录风暴数据', 'agent-c'], ['scope', 'camera', 'Scope', '观测地平线', 'agent-d']],
  },
}

function CityCanvas({ theme, visitorStatus, onAgent, edit = false, mikoPlaced = true, compact = false }) {
  const config = cityConfig[theme.id]
  const branch = visitorStatus === 'active' || visitorStatus === 'merged'
  return <div className={`city-canvas world-theme--${theme.id} ${edit ? 'is-editing' : ''} ${compact ? 'is-compact' : ''}`} style={{ '--paper': theme.paper, '--line': theme.line, '--accent': theme.accent, '--accent-2': theme.accent2, '--accent-3': theme.accent3 }}>
    <CityGround theme={theme} branch={branch} />
    {config.buildings.map(([type, cls, label], index) => <button className={`city-building ${cls} ${edit && index === 0 ? 'is-selected' : ''}`} key={label} aria-label={label} onClick={() => {}}><IsometricBuilding type={type} accent={index % 2 ? theme.accent2 : theme.accent} label={label} />{edit && index === 0 && <span className="rotate-handle"><RotateCw size={13} /></span>}</button>)}
    {theme.id === 'everyday' && <><DoodleTree accent={theme.accent} className="tree-a" /><DoodleTree accent={theme.accent2} className="tree-b" /><TinyPlant className="plant-a" /><TinyPlant className="plant-b" /><TinyPlant className="plant-c" /></>}
    {theme.id === 'stardom' && <><DoodleTree accent={theme.accent} className="tree-a" /><DoodleTree accent={theme.accent3} className="tree-b" /></>}
    {config.agents.map(([id, type, name, action, cls], index) => <button className={`city-agent ${cls}`} key={id} onClick={() => onAgent?.(INITIAL_AGENTS.find((item) => item.id === id) || { id, type, name, role: theme.places[index], home: theme.places[index], action, memory: 18, captured: '世界创建时', ability: '由物件用途转化的世界能力', privacy: '仅公开经确认的资料' })} aria-label={`查看${name}`}>
      <ObjectAgent type={type} accent={index % 2 ? theme.accent2 : theme.accent} />
      {index < 2 && !compact && <span className="action-bubble">{action}</span>}
    </button>)}
    {theme.id === 'everyday' && mikoPlaced && <button className="city-agent agent-miko" onClick={() => onAgent?.(INITIAL_AGENTS[0])} aria-label="查看Miko"><ObjectAgent type="mug" accent={theme.accent} /><span className="action-bubble">咖啡店需要更多热水。</span></button>}
    {branch && <button className="city-agent visitor-agent" onClick={() => onAgent?.({ ...VISITOR, home: '访问支线', action: '寻找不以热度衡量的演出', memory: 3, captured: '来自其他世界', ability: '生成可携带的纪念照片', privacy: '遵守当前世界通行证' })} aria-label="查看访客Iris"><ObjectAgent type="camera" accent={VISITOR.accent} /><span className="visitor-origin">来自聚光星区</span></button>}
    {!compact && <div className="map-hint"><Move size={14} /> 双指缩放 · 单指漫游</div>}
  </div>
}

function LivingCity({ theme, mode, visitorStatus, onMode, onDock, onBuilder, onCapture, onWorldline, onVisitor, onAgent, onFamiliar, onPublic, mikoPlaced }) {
  return <main className={`living-page world-theme--${theme.id}`} style={{ '--paper': theme.paper, '--line': theme.line, '--accent': theme.accent, '--accent-2': theme.accent2, '--accent-3': theme.accent3 }}>
    <header className="living-header">
      <button className="world-name-button" onClick={onDock}><small>{theme.english}</small><strong>{theme.name}</strong><ChevronRight size={16} /></button>
      <div className="edge-actions">
        <button onClick={onPublic} aria-label="公开镜像"><Share2 size={18} /></button>
        <button onClick={onFamiliar} aria-label="World Familiar"><Cpu size={18} /></button>
      </div>
    </header>
    <div className="world-status-row">
      <span><Clock3 size={14} /> {theme.time}</span>
      <button onClick={onWorldline} className={visitorStatus === 'active' ? 'branch-live' : ''}><GitBranch size={14} /> {visitorStatus === 'active' ? 'VISITOR BRANCH' : visitorStatus === 'merged' ? 'CANON · v.129' : 'CANON · v.126'}</button>
    </div>
    <div className="mode-switch"><button className={mode === 'run' ? 'is-active' : ''} onClick={() => onMode('run')}><Play size={14} /> 运行</button><button className={mode === 'edit' ? 'is-active' : ''} onClick={onBuilder}><Pencil size={14} /> 编辑</button></div>
    <CityCanvas theme={theme} visitorStatus={visitorStatus} onAgent={onAgent} mikoPlaced={mikoPlaced} />
    {visitorStatus === 'pending' && <button className="arrival-note" onClick={onVisitor}><span className="arrival-icon"><TrainFront size={21} /></span><span><small>南站台传来一声短笛</small><strong>一位跨世界访客正在等待</strong></span><ChevronRight size={18} /></button>}
    {visitorStatus === 'active' && <button className="arrival-note arrival-note--branch" onClick={onVisitor}><span className="arrival-icon"><GitBranch size={21} /></span><span><small>红色支线正在运行</small><strong>Iris 与 Page 刚刚交换故事</strong></span><ChevronRight size={18} /></button>}
    <button className="floating-capture" onClick={onCapture} aria-label="拍照新增物灵"><Camera size={22} /><span>新增物灵</span></button>
  </main>
}

function CaptureHeader({ step, onBack }) {
  const meta = CAPTURE_STEPS[step]
  return <><BackHeader title={meta.title} eyebrow={`${meta.index} / 07 · ${meta.english}`} onBack={onBack} /><div className="capture-progress">{CAPTURE_STEPS.map((_, index) => <i key={index} className={index <= step ? 'is-done' : ''} />)}</div></>
}

function PhotoMug({ cutout = false, line = false, alive = false }) {
  return <div className={`photo-mug ${cutout ? 'is-cutout' : ''} ${line ? 'is-line' : ''} ${alive ? 'is-alive' : ''}`}>
    <span className="mug-body"><i className="mug-handle" />{alive && <><i className="mug-eye mug-eye--a" /><i className="mug-eye mug-eye--b" /><i className="mug-leg mug-leg--a" /><i className="mug-leg mug-leg--b" /></>}</span>
    {!cutout && <><i className="photo-shadow" /><span className="photo-caption">今天早晨的杯子</span></>}
  </div>
}

function CaptureWizard({ step, setStep, onClose, onFinish, lineStyle, setLineStyle, rigParts, setRigParts, identity, setIdentity, movement, setMovement }) {
  const next = () => setStep(Math.min(6, step + 1))
  const back = () => step === 0 ? onClose() : setStep(step - 1)
  const togglePart = (part) => setRigParts((current) => current.includes(part) ? current.filter((item) => item !== part) : [...current, part])
  return <main className="paper-page capture-page">
    <CaptureHeader step={step} onBack={back} />
    {step === 0 && <section className="capture-stage">
      <DoodleTitle>拍下一个你想带进世界的东西</DoodleTitle>
      <div className="camera-frame"><div className="camera-corners" /><PhotoMug /><div className="camera-guide">请只拍一个物件</div></div>
      <div className="privacy-inline"><Lock size={15} /><span>只保留你选择的物件，背景不会成为公开内容。</span></div>
      <div className="capture-controls"><button><Images size={20} /><small>导入相册</small></button><button className="shutter" onClick={next} aria-label="拍摄杯子"><span /></button><button><RotateCcw size={20} /><small>翻转</small></button></div>
      <div className="recent-captures"><small>最近捕获</small><span><ObjectAgent type="camera" /><ObjectAgent type="plush" /><ObjectAgent type="book" /></span></div>
    </section>}
    {step === 1 && <section className="wizard-stage">
      <DoodleTitle note="背景仅留在本机草稿">只留下它</DoodleTitle>
      <div className="extract-compare"><div><small>原始照片</small><PhotoMug /></div><div className="cutout-board"><small>物件蒙版 · 92%</small><PhotoMug cutout /><i className="mask-edge" /></div></div>
      <div className="tool-row"><button className="is-active"><Scissors size={18} />自动抠图</button><button><Eraser size={18} />擦除</button><button><Pencil size={18} />恢复</button><button><RotateCw size={18} />旋转</button><button><ZoomIn size={18} />缩放</button></div>
      <div className="edge-slider"><span>边缘清理</span><input type="range" defaultValue="68" /><b>68</b></div>
      <PaperButton onClick={next}>确认轮廓 <ChevronRight size={18} /></PaperButton>
    </section>}
    {step === 2 && <section className="wizard-stage">
      <DoodleTitle>让真实轮廓变成世界线稿</DoodleTitle>
      <div className="transform-stage"><div><small>REAL OBJECT</small><PhotoMug cutout /></div><span><WandSparkles size={22} /></span><div><small>WORLD FORM</small><PhotoMug cutout line /></div></div>
      <div className="style-picker">{['极简钢笔', '柔软铅笔', '漫画线条', '工程线稿', '儿童涂鸦'].map((style) => <button key={style} className={lineStyle === style ? 'is-selected' : ''} onClick={() => setLineStyle(style)}><span className={`line-sample sample-${style.length}`} />{style}<i>{lineStyle === style && <Check size={12} />}</i></button>)}</div>
      <p className="wizard-note"><AlertCircle size={15} />核心轮廓保持不变，因此你仍能认出这是自己的杯子。</p>
      <PaperButton onClick={next}>使用「{lineStyle}」 <ChevronRight size={18} /></PaperButton>
    </section>}
    {step === 3 && <section className="wizard-stage rig-stage">
      <DoodleTitle note="所有结构都可以移动或删除">给它一点生命</DoodleTitle>
      <div className="rig-canvas"><ObjectAgent type="mug" accent="#d96d5f" selected /><span className="rig-handle rig-eye-a"><i /></span><span className="rig-handle rig-eye-b"><i /></span><span className="rig-handle rig-leg-a"><i /></span><span className="rig-handle rig-leg-b"><i /></span><p>拖动圆点调整位置</p></div>
      <div className="part-picker">{['眼睛', '嘴', '手臂', '腿', '触角', '围裙'].map((part) => <button key={part} className={rigParts.includes(part) ? 'is-selected' : ''} onClick={() => togglePart(part)}><Circle size={13} />{part}{rigParts.includes(part) && <Check size={13} />}</button>)}</div>
      <div className="ai-suggestion"><Sparkles size={16} /><p><strong>结构建议</strong>杯把已经像一只手臂，因此只添加一只自由手。</p></div>
      <PaperButton onClick={next}>生命结构完成 <ChevronRight size={18} /></PaperButton>
    </section>}
    {step === 4 && <section className="wizard-stage identity-stage">
      <DoodleTitle>确认它是谁，而不是让系统替你定义</DoodleTitle>
      <div className="identity-hero"><ObjectAgent type="mug" accent="#d96d5f" /><div><small>角色建议 · 可修改</small><strong>温暖的店主型居民</strong><p>建议来自“盛装饮品”这一物件用途，不是心理诊断。</p></div></div>
      <label>名字<input value={identity.name} onChange={(e) => setIdentity({ ...identity, name: e.target.value })} /></label>
      <div className="form-grid"><label>自称<input value={identity.pronoun} onChange={(e) => setIdentity({ ...identity, pronoun: e.target.value })} /></label><label>社会角色<input value={identity.role} onChange={(e) => setIdentity({ ...identity, role: e.target.value })} /></label></div>
      <label>当前目标<textarea value={identity.goal} onChange={(e) => setIdentity({ ...identity, goal: e.target.value })} /></label>
      <div className="identity-chips"><button>性格 · 稳定</button><button>能力 · 保存温度</button><button>愿望 · 经营咖啡店</button><button>害怕 · 摔碎</button></div>
      <div className="privacy-groups"><span><Eye size={15} /><b>访客可见</b>名字、角色、公开记忆</span><span><Lock size={15} /><b>不允许读取</b>原始照片、私人来源</span></div>
      <PaperButton onClick={next}>我确认这是 {identity.name} <ChevronRight size={18} /></PaperButton>
    </section>}
    {step === 5 && <section className="wizard-stage motion-stage">
      <DoodleTitle>它会怎样在世界里移动？</DoodleTitle>
      <div className={`motion-preview move-${movement}`}><span className="motion-floor" /><ObjectAgent type="mug" accent="#d96d5f" /><div className="motion-lines"><i /><i /><i /></div><small>{identity.name} · {movement}</small></div>
      <div className="motion-actions">{['Idle', 'Walk', 'Look', 'Talk', 'Work', 'Sleep', 'React', 'Carry'].map((action, index) => <button key={action} className={index === 1 ? 'is-active' : ''}><ObjectAgent type="mug" />{action}</button>)}</div>
      <div className="movement-picker">{['走', '跳', '滚', '飘', '爬', '小车'].map((item) => <button key={item} className={movement === item ? 'is-selected' : ''} onClick={() => setMovement(item)}><Footprints size={15} />{item}</button>)}</div>
      <div className="motion-caption"><Coffee size={17} /><span><strong>工作动作预览</strong>{identity.name} 可以走到水壶旁，再把饮料倒进另一个杯子。</span></div>
      <PaperButton onClick={next}>动作看起来很好 <ChevronRight size={18} /></PaperButton>
    </section>}
    {step === 6 && <section className="wizard-stage place-stage">
      <DoodleTitle>把 {identity.name} 放进你的世界</DoodleTitle>
      <div className="place-city"><CityCanvas theme={WORLD_THEMES.everyday} visitorStatus="idle" compact /><div className="placement-target"><ObjectAgent type="mug" accent="#d96d5f" selected /><span>拖到纸杯咖啡店</span></div></div>
      <div className="object-mode-list">{[['agent', '活体 Agent', '会行动、记忆与社交'], ['object', '普通城市物件', '保留形态，不自主行动'], ['building', '建筑的一部分', '成为咖啡店固定组件'], ['familiar', 'ESP32 Familiar', '在现实硬件中继续生活']].map(([id, title, copy], index) => <button className={index === 0 ? 'is-selected' : ''} key={id}><span>{index === 0 ? <ObjectAgent type="mug" /> : index === 3 ? <Cpu size={19} /> : <Box size={19} />}</span><div><strong>{title}</strong><small>{copy}</small></div>{index === 0 && <Check size={17} />}</button>)}</div>
      <PaperButton onClick={onFinish}><MapPinned size={18} /> 放进纸杯咖啡店</PaperButton>
    </section>}
  </main>
}

function Builder({ theme, visitorStatus, onBack, onRun, onAgent }) {
  const [tool, setTool] = useState('Buildings')
  return <main className={`builder-page world-theme--${theme.id}`} style={{ '--paper': theme.paper, '--line': theme.line, '--accent': theme.accent, '--accent-2': theme.accent2 }}>
    <BackHeader title={`${theme.name} · 编辑`} eyebrow="WORLD BUILDER · 32×16 TILES" onBack={onBack} action={<button className="run-button" onClick={onRun}><Play size={15} /> 运行</button>} />
    <div className="builder-toolbar-top"><button><Undo2 size={18} /></button><button><Redo2 size={18} /></button><span>建筑已选择</span><button><Copy size={17} /></button><button><RotateCw size={17} /></button><button><Layers3 size={17} /></button><button className="danger"><Trash2 size={17} /></button></div>
    <CityCanvas theme={theme} visitorStatus={visitorStatus} onAgent={onAgent} edit />
    <div className="collision-note"><AlertCircle size={15} /><span><strong>道路连接提示</strong>咖啡店入口距离道路 1 个地块，可以通行。</span></div>
    <section className="builder-drawer">
      <div className="drawer-handle" />
      <div className="builder-tabs">{['Terrain', 'Buildings', 'Objects', 'Agents', 'Roads', 'Portals', 'Decor'].map((item) => <button key={item} className={tool === item ? 'is-active' : ''} onClick={() => setTool(item)}>{item}</button>)}</div>
      <div className="builder-parts"><button><IsometricBuilding type="cafe" accent={theme.accent} /><small>咖啡店</small></button><button><IsometricBuilding type="library" accent={theme.accent2} /><small>图书馆</small></button><button><IsometricBuilding type="house" accent={theme.accent} /><small>住宅</small></button><button><IsometricBuilding type="station" accent={theme.accent2} /><small>站台</small></button></div>
      <p><Hand size={14} /> 长按拾取 · 拖动放置 · 双指缩放 · 90° 旋转</p>
    </section>
  </main>
}

function Gallery({ onAgent, onFamiliar }) {
  const [filter, setFilter] = useState('Agents')
  return <main className="paper-page gallery-page">
    <div className="gallery-heading"><div><p className="eyebrow">CAPTURELINGS GALLERY</p><DoodleTitle note="[ 22 ]">物灵图鉴</DoodleTitle></div><button className="icon-button"><Search size={20} /></button></div>
    <div className="filter-scroll">{['Agents', 'Objects', 'Buildings', 'Visitors', 'Memories', 'Archived'].map((item) => <button key={item} className={filter === item ? 'is-active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>
    <div className="captureling-list">{INITIAL_AGENTS.map((agent, index) => <button className="captureling-card" key={agent.id} onClick={() => onAgent(agent)}>
      <span className="capture-date"><b>{agent.captured.split(' ')[0]}</b><small>{agent.captured.replace(agent.captured.split(' ')[0], '')}</small></span>
      <span className={`capture-photo capture-photo--${agent.type}`}><span /></span>
      <span className="capture-agent"><ObjectAgent type={agent.type} accent={index % 3 === 0 ? '#d96d5f' : index % 3 === 1 ? '#8aa58c' : '#8aa8bd'} /><strong>{agent.name}</strong><small>{agent.role}</small></span>
      <span className="capture-meta"><b>{agent.memory}</b><small>记忆</small>{agent.id === 'kiki' && <i><Cpu size={12} /> Familiar</i>}</span>
      <ChevronRight size={18} />
    </button>)}</div>
    <button className="familiar-banner" onClick={onFamiliar}><span><Cpu size={21} /></span><div><small>ESP32 WORLD FAMILIAR</small><strong>Kiki 正在现实里等待一次轻敲</strong></div><ChevronRight size={18} /></button>
  </main>
}

function AgentDetail({ agent, onBack, onFamiliar }) {
  return <main className="paper-page agent-detail-page">
    <BackHeader title={agent.name} eyebrow="OBJECT AGENT DETAIL" onBack={onBack} action={<button className="icon-button"><Archive size={18} /></button>} />
    <section className="agent-identity-paper">
      <div className={`capture-photo capture-photo--${agent.type}`}><span /></div>
      <div className="identity-arrow"><ChevronRight size={20} /><small>世界化</small></div>
      <ObjectAgent type={agent.type} accent="#d96d5f" />
      <div className="agent-title"><small>{agent.captured} 捕获 · 目前在 {agent.home}</small><h1>{agent.name}</h1><p>{agent.role}</p></div>
    </section>
    <section className="current-action-paper"><span className="scribble-dot" /><div><small>CURRENT ACTION · 正在执行</small><strong>{agent.action}</strong><p>先通过城市中的动作被看见，再由这张纸解释原因。</p></div></section>
    <section className="detail-grid">
      <article><small>WHAT IT NOTICED</small><strong>咖啡店的水壶温度正在下降</strong></article><article><small>CURRENT GOAL</small><strong>完成今天第一壶饮品</strong></article><article><small>INTENDED ACTION</small><strong>走到水壶旁并提醒 Page</strong></article><article><small>NEW MEMORY</small><strong>清晨第一位顾客留下的气味</strong></article>
    </section>
    <section className="relationship-paper"><div className="section-line-title"><Users size={17} /><strong>正在形成的关系</strong></div><div className="relation-line"><ObjectAgent type={agent.type} /><span className="hand-line" /><ObjectAgent type="book" /><small>正在接近 · 信任 +3</small></div></section>
    <section className="object-origin-paper"><div className="section-line-title"><Sparkles size={17} /><strong>物件如何成为能力</strong></div><p><b>原始物件：</b>{agent.type === 'mug' ? '一只日常使用的陶瓷杯' : '用户珍视的现实物件'}</p><p><b>经用户确认的能力：</b>{agent.ability}</p><p><b>边界：</b>这是用途联想，不是对用户的心理诊断。</p></section>
    <section className="privacy-paper"><span><Eye size={16} /><b>可向访客公开</b>角色、当前动作、公开记忆</span><span><Lock size={16} /><b>仅主世界可见</b>{agent.privacy}</span></section>
    {agent.id === 'kiki' && <PaperButton onClick={onFamiliar}><Cpu size={17} /> 查看它的 World Familiar</PaperButton>}
  </main>
}

function VisitorArrival({ theme, onBack, onAccept, onDecline }) {
  return <main className={`paper-page visitor-page world-theme--${theme.id}`} style={{ '--paper': theme.paper, '--line': theme.line, '--accent': theme.accent, '--accent-2': theme.accent2 }}>
    <BackHeader title="南站台来客" eyebrow="VISITOR ARRIVAL · WORLD PASSPORT" onBack={onBack} />
    <div className="visitor-station"><IsometricBuilding type="station" accent={theme.accent2} /><span className="station-track" /><ObjectAgent type="camera" accent={VISITOR.accent} /><span className="visitor-ticket"><Ticket size={15} /> #SD-IRIS-22</span></div>
    <section className="visitor-paper">
      <div className="visitor-profile"><ObjectAgent type="camera" accent={VISITOR.accent} /><div><small>来自 · {VISITOR.origin}</small><h1>{VISITOR.name}</h1><p>{VISITOR.role}</p></div></div>
      <blockquote>“{VISITOR.purpose}”</blockquote>
      <div className="adaptation-note"><span className="adapt-red" /><p><strong>世界适应</strong>保留来源世界的红色镜头标记，并换成小镇的手绘轮廓。</p></div>
      <div className="permission-grid"><span><Eye size={16} /><small>允许</small><b>探索 · 对话 · 生成纪念物</b></span><span><Lock size={16} /><small>禁止</small><b>读取原图 · 修改正史</b></span><span><Clock3 size={16} /><small>预算</small><b>12 轮行动 · 约 8 分钟</b></span><span><GitBranch size={16} /><small>结算</small><b>隔离支线 · 主人确认</b></span></div>
      <p className="passport-assurance"><Lock size={15} />你不必交出隐私，只需要邀请别人来你的世界看一眼。</p>
    </section>
    <div className="dual-actions"><PaperButton tone="plain" onClick={onDecline}>暂不邀请</PaperButton><PaperButton onClick={onAccept}><TrainFront size={17} /> 允许从站台进入</PaperButton></div>
  </main>
}

function VisitorBranch({ theme, onBack, onWorldline, onAgent }) {
  return <main className={`branch-page world-theme--${theme.id}`} style={{ '--paper': theme.paper, '--line': theme.line, '--accent': theme.accent, '--accent-2': theme.accent2 }}>
    <BackHeader title="访客支线" eyebrow="VISITOR BRANCH · LIVE" onBack={onBack} action={<span className="live-stamp"><i />运行中</span>} />
    <div className="branch-explainer"><span style={{ background: VISITOR.accent }} /><p>Iris 走过的路径使用其来源世界颜色。支线正在城市中发生，但不会直接改写正史。</p></div>
    <CityCanvas theme={theme} visitorStatus="active" onAgent={onAgent} />
    <section className="latest-event-paper"><small>刚刚 · 折页图书馆</small><strong>Iris 与 Page 交换了一段故事</strong><p>Page 注意到访客拍照前会先询问，于是信任提升了 4。</p><div><span><ImageIcon size={15} /> 可能生成新照片</span><span>关系 +4</span></div></section>
    <PaperButton onClick={onWorldline}><GitBranch size={17} /> 打开手绘世界线</PaperButton>
  </main>
}

function Worldline({ status, onBack, onResolve, onLocate }) {
  const branch = status === 'active' || status === 'merged'
  return <main className="paper-page worldline-page">
    <div className="worldline-heading"><div><p className="eyebrow">WORLDLINE · LIVING MAP</p><DoodleTitle note="主线 v.126">世界线地图</DoodleTitle></div><button className="icon-button"><SlidersHorizontal size={19} /></button></div>
    <p className="worldline-intro">它更像一张城市交通图：每个站点都对应真实发生过的地点、物件与关系变化。</p>
    <div className="worldline-map">
      <svg viewBox="0 0 390 610" aria-hidden="true">
        <path className="canon-line" d="M72 35v95q0 38 40 38h84q38 0 38 38v78q0 38-40 38h-40q-40 0-40 38v68q0 38 40 38h150" />
        {branch && <path className="branch-line" d="M234 246q81 3 82 72v136" />}
      </svg>
      <button className="station station-1" onClick={onLocate}><i /><small>纪元 121</small><strong>第一间咖啡店开门</strong><span>纸杯咖啡店</span></button>
      <button className="station station-2" onClick={onLocate}><i /><small>纪元 124</small><strong>Page 建立记忆索引</strong><span>折页图书馆</span></button>
      <button className="station station-3" onClick={onLocate}><i /><small>纪元 126</small><strong>Iris 从南站台到达</strong><span><TrainFront size={12} /> 访客分叉点</span></button>
      <button className="station station-4" onClick={onLocate}><i /><small>现在</small><strong>{status === 'merged' ? '照片已进入正史' : '主世界仍在呼吸'}</strong><span>Everyday Memory Town</span></button>
      {branch && <div className="branch-stations">{BRANCH_EVENTS.map((event, index) => <button key={event.id} style={{ top: `${275 + index * 105}px` }}><i /><small>{event.time} · {event.place}</small><strong>{event.title}</strong><span>{status === 'merged' && event.keep ? '已并入正史' : 'Visitor Branch'}</span></button>)}</div>}
    </div>
    {status === 'active' && <PaperButton onClick={onResolve}><GitBranch size={17} /> 结算这条访客支线</PaperButton>}
    {status === 'merged' && <div className="merged-stamp"><Check size={17} /><span><strong>已选择性合并</strong>只把纪念照片写入正史，其他事件留在平行版本。</span></div>}
  </main>
}

function BranchResolution({ onBack, onMerge }) {
  const [selected, setSelected] = useState(['photo'])
  const toggle = (id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  return <main className="paper-page resolution-page">
    <BackHeader title="支线结算" eyebrow="BRANCH RESOLUTION" onBack={onBack} />
    <DoodleTitle note="由你决定">哪些改变值得成为正史？</DoodleTitle>
    <p className="worldline-intro">未选事件仍会留在平行城市版本，不会抹去发生过的痕迹。</p>
    <div className="resolution-route"><span className="route-main">主线</span><i /><span className="route-branch">Iris 支线</span></div>
    <div className="resolution-list">{BRANCH_EVENTS.map((event) => { const checked = selected.includes(event.id); return <button key={event.id} className={checked ? 'is-selected' : ''} onClick={() => toggle(event.id)}><span className="check-box">{checked && <Check size={14} />}</span><div><small>{event.time} · {event.place}</small><strong>{event.title}</strong><p>{event.memory}</p><span>{event.relation}</span></div></button> })}</div>
    <section className="merge-choice"><ImageIcon size={20} /><div><strong>{selected.length} 个事件将进入正史</strong><p>{selected.length === 1 && selected[0] === 'photo' ? '当前只选择了纪念照片，正好对应流程 C。' : '你可以继续调整。'}</p></div></section>
    <div className="branch-options"><button><Save size={16} />保留为平行城市版本</button><button><Ticket size={16} />只保留纪念物</button><button><Trash2 size={16} />删除支线</button></div>
    <PaperButton disabled={!selected.length} onClick={() => onMerge(selected)}><GitBranch size={17} /> 合并所选内容</PaperButton>
  </main>
}

function Familiar({ onBack }) {
  return <main className="paper-page familiar-page">
    <BackHeader title="Kiki 在现实里" eyebrow="ESP32 WORLD FAMILIAR" onBack={onBack} action={<span className="online-dot"><i />在线</span>} />
    <DoodleTitle>这个物灵正在通过硬件生活</DoodleTitle>
    <div className="familiar-device"><div className="device-screen"><ObjectAgent type="camera" accent="#d96d5f" /><span>Kiki · 等待轻敲</span></div><div className="device-knob"><i /></div><div className="device-speaker">··········</div></div>
    <div className="secondary-device-meta"><span><Wifi size={15} />在线</span><span><BatteryMedium size={16} />82%</span><span><Radio size={15} />刚刚同步</span></div>
    <section className="familiar-life-paper">
      <div><small>当前世界</small><strong>日常记忆镇</strong></div><div><small>所在建筑</small><strong>旧光照相馆</strong></div><div><small>当前访客</small><strong>Iris · 支线中</strong></div><div><small>当前心情</small><strong>好奇，稍微兴奋</strong></div>
    </section>
    <section className="familiar-memory"><span><ObjectAgent type="camera" /></span><div><small>最近一段世界记忆</small><strong>“站台响起短笛时，我先看见了红色镜头。”</strong><p>3 分钟前 · 南站台</p></div></section>
    <section className="hardware-actions"><h2>现实动作 ↔ 世界回应</h2>{[[Hand, '轻敲', '唤醒 Kiki'], [Navigation, '摇杆左右', '选择不同世界线'], [Circle, '按下摇杆', '接受访客或确认合并'], [Move, '倾斜设备', '切换视角或让它睡觉'], [Volume2, '蜂鸣器', '提示访客与重大事件']].map(([Icon, label, copy]) => <div key={label}><Icon size={18} /><span><strong>{label}</strong><small>{copy}</small></span></div>)}</section>
  </main>
}

function PublicMirror({ theme, onBack }) {
  return <main className={`public-page world-theme--${theme.id}`} style={{ '--paper': theme.paper, '--line': theme.line, '--accent': theme.accent, '--accent-2': theme.accent2 }}>
    <BackHeader title="公开世界镜像" eyebrow="PUBLIC WORLD MIRROR · READ ONLY" onBack={onBack} action={<span className="read-only"><Eye size={14} />只读</span>} />
    <div className="mirror-intro"><DoodleTitle>{theme.name}</DoodleTitle><p>这是主人愿意让访客看见的世界切面，不包含原始照片、私聊、位置或未公开画像。</p></div>
    <CityCanvas theme={theme} visitorStatus="idle" compact />
    <section className="mirror-permissions"><span><Eye size={16} /><b>你可以看见</b>城市布局、公开角色、正在发生的动作</span><span><Lock size={16} /><b>你无法读取</b>原始物件照片、私密记忆、编辑历史</span></section>
    <blockquote>“你不必交出隐私，只需要邀请别人来你的世界看一眼。”</blockquote>
  </main>
}

function Toast({ message }) {
  return message ? <div className="toast"><Sparkles size={15} />{message}</div> : null
}

export default function App() {
  const [screen, setScreen] = useState('world')
  const [previousScreen, setPreviousScreen] = useState('world')
  const [worldId, setWorldId] = useState('everyday')
  const [mode, setMode] = useState('run')
  const [captureStep, setCaptureStep] = useState(0)
  const [lineStyle, setLineStyle] = useState('柔软铅笔')
  const [rigParts, setRigParts] = useState(['眼睛', '腿'])
  const [identity, setIdentity] = useState({ name: 'Miko', pronoun: '我', role: '咖啡店主人', goal: '为清晨的居民准备第一壶热饮' })
  const [movement, setMovement] = useState('走')
  const [mikoPlaced, setMikoPlaced] = useState(true)
  const [visitorStatus, setVisitorStatus] = useState('pending')
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [toast, setToast] = useState('')
  const theme = WORLD_THEMES[worldId]
  const activeNav = useMemo(() => mainScreens.includes(screen) ? screen : screen === 'visitor-branch' || screen === 'resolution' ? 'worldline' : 'world', [screen])

  const showToast = (message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2600)
  }
  const navigate = (next) => {
    setPreviousScreen(screen)
    setScreen(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const openAgent = (agent) => {
    setSelectedAgent(agent)
    navigate('agent')
  }
  const finishCapture = () => {
    setMikoPlaced(true)
    setWorldId('everyday')
    setScreen('world')
    setCaptureStep(0)
    showToast('Miko 已走进纸杯咖啡店')
  }
  const acceptVisitor = () => {
    setVisitorStatus('active')
    setScreen('visitor-branch')
    showToast('Iris 已通过南站台进入支线')
  }
  const mergeBranch = (selected) => {
    setVisitorStatus('merged')
    setScreen('worldline')
    showToast(`已把 ${selected.length} 个事件写入正史`)
  }

  let content = null
  if (screen === 'dock') content = <WorldDock onOpen={(id) => { setWorldId(id); setScreen('world') }} onPublic={() => navigate('public')} />
  else if (screen === 'world') content = <LivingCity theme={theme} mode={mode} visitorStatus={visitorStatus} onMode={setMode} onDock={() => navigate('dock')} onBuilder={() => { setMode('edit'); navigate('builder') }} onCapture={() => { setCaptureStep(0); navigate('capture') }} onWorldline={() => navigate('worldline')} onVisitor={() => navigate(visitorStatus === 'active' ? 'visitor-branch' : 'visitor-arrival')} onAgent={openAgent} onFamiliar={() => navigate('familiar')} onPublic={() => navigate('public')} mikoPlaced={mikoPlaced} />
  else if (screen === 'capture') content = <CaptureWizard step={captureStep} setStep={setCaptureStep} onClose={() => setScreen(previousScreen)} onFinish={finishCapture} lineStyle={lineStyle} setLineStyle={setLineStyle} rigParts={rigParts} setRigParts={setRigParts} identity={identity} setIdentity={setIdentity} movement={movement} setMovement={setMovement} />
  else if (screen === 'builder') content = <Builder theme={theme} visitorStatus={visitorStatus} onBack={() => setScreen('world')} onRun={() => { setMode('run'); setScreen('world'); showToast('城市已保存并恢复运行') }} onAgent={openAgent} />
  else if (screen === 'gallery') content = <Gallery onAgent={openAgent} onFamiliar={() => navigate('familiar')} />
  else if (screen === 'agent') content = <AgentDetail agent={selectedAgent || INITIAL_AGENTS[0]} onBack={() => setScreen(previousScreen)} onFamiliar={() => navigate('familiar')} />
  else if (screen === 'visitor-arrival') content = <VisitorArrival theme={theme} onBack={() => setScreen('world')} onAccept={acceptVisitor} onDecline={() => { setVisitorStatus('declined'); setScreen('world'); showToast('访客已被婉拒，主世界没有改变') }} />
  else if (screen === 'visitor-branch') content = <VisitorBranch theme={WORLD_THEMES.everyday} onBack={() => setScreen('world')} onWorldline={() => setScreen('worldline')} onAgent={openAgent} />
  else if (screen === 'worldline') content = <Worldline status={visitorStatus} onBack={() => setScreen('world')} onResolve={() => navigate('resolution')} onLocate={() => { setWorldId('everyday'); setScreen('world'); showToast('已定位到城市中的事件地点') }} />
  else if (screen === 'resolution') content = <BranchResolution onBack={() => setScreen('worldline')} onMerge={mergeBranch} />
  else if (screen === 'familiar') content = <Familiar onBack={() => setScreen(previousScreen)} />
  else if (screen === 'public') content = <PublicMirror theme={theme} onBack={() => setScreen(previousScreen)} />

  const showNav = mainScreens.includes(screen)
  return <div className={`app-shell world-theme--${worldId}`} style={{ '--paper': theme.paper, '--line': theme.line, '--accent': theme.accent, '--accent-2': theme.accent2, '--accent-3': theme.accent3 }}>
    {content}
    {showNav && <BottomNavigation active={activeNav} onNavigate={setScreen} onCapture={() => { setPreviousScreen(screen); setCaptureStep(0); setScreen('capture') }} badge={visitorStatus === 'active'} />}
    <Toast message={toast} />
  </div>
}
