import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { BookOpen, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import {
  THEMED_WORLDS,
  ThemedWorldPreview,
  ThemedWorldScreen,
  type ThemedWorldKey,
  type ThemedWorldResident,
} from './ThemedWorldScenes';
import { WORLD_STYLE_SKILL_ASSETS, type WorldStyleSkillAssetType } from './worldStyleSkills';
import { getWorldDecorations } from './AgentWorldDecorations';
import petDachshundPng from '../assets/world/pet-agents/sprites/dachshund.png';
import lakeArchivistPng from '../assets/world/style-skills/lake-mystery/archivist.png';
import lakeBotanistPng from '../assets/world/style-skills/lake-mystery/botanist.png';
import mikoSvg from '../assets/world/resident-svg/miko.svg';
import shutterSvg from '../assets/world/resident-svg/shutter.svg';
import nanaSvg from '../assets/world/resident-svg/nana.svg';
import folioSvg from '../assets/world/resident-svg/folio.svg';
import lumaSvg from '../assets/world/resident-svg/luma.svg';
import beatSvg from '../assets/world/resident-svg/beat.svg';
import sprigSvg from '../assets/world/resident-svg/sprig.svg';
import tockSvg from '../assets/world/resident-svg/tock.svg';
import keyloSvg from '../assets/world/resident-svg/keylo.svg';
import orbitSvg from '../assets/world/resident-svg/orbit.svg';
import joypadSvg from '../assets/world/resident-svg/joypad.svg';
import mizzleSvg from '../assets/world/resident-svg/mizzle.svg';

type Props = {
  onOpenPrivate: () => void;
  onOpenPublic: () => void;
};

const SVG_AGENTS: Record<string, string> = {
  miko: mikoSvg,
  shutter: shutterSvg,
  nana: nanaSvg,
  folio: folioSvg,
  luma: lumaSvg,
  beat: beatSvg,
  sprig: sprigSvg,
  tock: tockSvg,
  keylo: keyloSvg,
  orbit: orbitSvg,
  joypad: joypadSvg,
  mizzle: mizzleSvg,
};

const CAROUSEL_AGENTS = [
  { id: 'miko', name: 'Miko', role: '咖啡馆管理员', color: '#E8634A' },
  { id: 'shutter', name: 'Shutter', role: '档案记录员', color: '#4A7FA5' },
  { id: 'nana', name: 'Nana', role: '陪伴者', color: '#C890C0' },
  { id: 'folio', name: 'Folio', role: '记忆图书管理员', color: '#4A7FA5' },
  { id: 'luma', name: 'Luma', role: '夜间领跑员', color: '#D4A800' },
  { id: 'beat', name: 'Beat', role: '节奏领练员', color: '#6B9E7A' },
  { id: 'sprig', name: 'Sprig', role: '身体观察员', color: '#6B9E7A' },
  { id: 'tock', name: 'Tock', role: '恢复计时员', color: '#E88752' },
  { id: 'keylo', name: 'Keylo', role: '权限守护员', color: '#C99A31' },
  { id: 'orbit', name: 'Orbit', role: '链上天气员', color: '#00A7C7' },
  { id: 'joypad', name: 'Joypad', role: '任务主持人', color: '#E8191A' },
  { id: 'mizzle', name: 'Mizzle', role: '网络观察员', color: '#0070F3' },
];

function residentSvg(id: string) {
  return <img src={SVG_AGENTS[id]} alt="" draggable={false} style={{ width: 58, height: 62, objectFit: 'contain' }}/>;
}

function styleAgent(type: WorldStyleSkillAssetType) {
  const asset = WORLD_STYLE_SKILL_ASSETS.find((item) => item.type === type);
  return asset ? <img src={asset.src} alt="" draggable={false} style={{ width: 58, height: 62, objectFit: 'contain' }}/> : null;
}

function imageAgent(src: string) {
  return <img src={src} alt="" draggable={false} style={{ width: 58, height: 62, objectFit: 'contain' }}/>;
}

function getResidents(): Record<ThemedWorldKey, ThemedWorldResident[]> {
  return {
    fitness: [
      { id: 'dotti', name: 'Dotti', role: '腊肠犬健身伙伴', color: '#B67C42', art: imageAgent(petDachshundPng), recordSourceId: 'miko', featured: true },
      { id: 'miko', name: 'Miko', role: '动作教练', color: '#E8634A', art: residentSvg('miko'), recordSourceId: 'miko' },
      { id: 'shutter', name: 'Shutter', role: '姿态记录员', color: '#4A7FA5', art: residentSvg('shutter'), recordSourceId: 'shutter' },
      { id: 'nana', name: 'Nana', role: '恢复陪伴员', color: '#C890C0', art: residentSvg('nana'), recordSourceId: 'nana' },
      { id: 'folio', name: 'Folio', role: '训练档案员', color: '#4A7FA5', art: residentSvg('folio'), recordSourceId: 'folio' },
      { id: 'luma', name: 'Luma', role: '夜间领跑员', color: '#D4A800', art: residentSvg('luma'), recordSourceId: 'luma' },
      { id: 'beat', name: 'Beat', role: '节奏领练员', color: '#6B9E7A', art: residentSvg('beat'), recordSourceId: 'beat' },
      { id: 'sprig', name: 'Sprig', role: '身体观察员', color: '#6B9E7A', art: residentSvg('sprig'), recordSourceId: 'sprig' },
      { id: 'tock', name: 'Tock', role: '恢复计时员', color: '#E88752', art: residentSvg('tock'), recordSourceId: 'tock' },
    ],
    learning: [
      { id: 'atlas', name: 'Atlas', role: '学习路径规划员', color: '#579447', art: styleAgent('blockCartographer'), recordSourceId: 'luma', featured: true },
      { id: 'honey', name: 'Honey', role: '小组学习员', color: '#D4A800', art: styleAgent('blockBeekeeper'), recordSourceId: 'beat' },
      { id: 'puck', name: 'Puck', role: '知识传递员', color: '#8A6A3A', art: styleAgent('blockCourier'), recordSourceId: 'keylo' },
      { id: 'ember', name: 'Ember', role: '实验课程员', color: '#B05F42', art: styleAgent('blockAlchemist'), recordSourceId: 'folio' },
      { id: 'truffle', name: 'Truffle', role: '户外探索学员', color: '#B98565', art: styleAgent('blockPig'), recordSourceId: 'orbit' },
      { id: 'wooly', name: 'Wooly', role: '互助学习员', color: '#D8C9A4', art: styleAgent('blockSheep'), recordSourceId: 'nana' },
      { id: 'rivet', name: 'Rivet', role: '教具维护员', color: '#4A7FA5', art: styleAgent('blockMechanic'), recordSourceId: 'shutter' },
      { id: 'clover', name: 'Clover', role: '课程种子管理员', color: '#6B9E7A', art: styleAgent('blockFarmer'), recordSourceId: 'sprig' },
    ],
    maker: [
      { id: 'corvus', name: 'Corvus', role: '故障记录员', color: '#4A4A46', art: styleAgent('lakeCrow'), recordSourceId: 'orbit', featured: true },
      { id: 'ink', name: 'Ink', role: '安全边界员', color: '#6A6957', art: styleAgent('lakeCat'), recordSourceId: 'joypad' },
      { id: 'noct', name: 'Noct', role: '原型观察员', color: '#7D725F', art: styleAgent('lakeOwl'), recordSourceId: 'mizzle' },
      { id: 'lapin', name: 'Lapin', role: '零件信使', color: '#B8AFA0', art: styleAgent('lakeRabbit'), recordSourceId: 'miko' },
      { id: 'hart', name: 'Hart', role: '边界测试员', color: '#8A725A', art: styleAgent('lakeDeer'), recordSourceId: 'nana' },
      { id: 'moss', name: 'Moss', role: '材料回收员', color: '#6B7A55', art: styleAgent('lakeFrog'), recordSourceId: 'shutter' },
      { id: 'dale', name: 'Dale', role: '原型档案员', color: '#566052', art: imageAgent(lakeArchivistPng), recordSourceId: 'folio' },
      { id: 'iris', name: 'Iris', role: '材料培育员', color: '#7B6A45', art: imageAgent(lakeBotanistPng), recordSourceId: 'sprig' },
    ],
  };
}

function withVisitors(worldKey: ThemedWorldKey, residents: Record<ThemedWorldKey, ThemedWorldResident[]>) {
  const sources: Record<ThemedWorldKey, Array<[ThemedWorldKey, string]>> = {
    fitness: [['learning', 'atlas'], ['maker', 'corvus']],
    learning: [['fitness', 'dotti'], ['maker', 'corvus']],
    maker: [['fitness', 'dotti'], ['learning', 'atlas']],
  };
  return [
    ...residents[worldKey],
    ...sources[worldKey].map(([sourceWorld, residentId]) => {
      const source = residents[sourceWorld].find((resident) => resident.id === residentId)!;
      return {
        ...source,
        id: `visitor-${sourceWorld}-${source.id}`,
        role: `串门访客 · 来自 ${THEMED_WORLDS[sourceWorld].buildingName}`,
        featured: false,
        visitor: true,
      };
    }),
  ];
}

function SourceSceneControl({
  world,
  onWorldChange,
  onOpenPrivate,
  onOpenPlaza,
}: {
  world: ThemedWorldKey;
  onWorldChange: (world: ThemedWorldKey) => void;
  onOpenPrivate: () => void;
  onOpenPlaza: () => void;
}) {
  return (
    <div style={{ width: 340, display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 4, padding: 4, borderRadius: 0, background: 'rgba(28,25,17,.055)', border: '1px solid rgba(28,25,17,.08)' }}>
      <div className="relative flex items-center justify-center" style={{ height: 32, borderRadius: 0, background: THEMED_WORLDS[world].accent, color: 'white', boxShadow: '0 1px 4px rgba(28,25,17,.16)' }}>
        <span style={{ fontSize: 'var(--ui-font-caption)' }}>Scene</span>
        <ChevronDown size={12} aria-hidden="true" style={{ position: 'absolute', right: 8, color: 'white', pointerEvents: 'none' }}/>
        <select
          aria-label="Choose scene"
          value={world}
          onChange={(event) => onWorldChange(event.target.value as ThemedWorldKey)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', appearance: 'none', WebkitAppearance: 'none', opacity: 0, background: 'transparent', border: 'none', cursor: 'pointer', outline: 'none' }}
        >
          <option value="fitness">Vitality Gym</option>
          <option value="learning">Open School</option>
          <option value="maker">Maker Hall</option>
        </select>
      </div>
      <button type="button" onClick={onOpenPrivate} style={sourceTabStyle}>Skills</button>
      <button type="button" onClick={onOpenPlaza} style={sourceTabStyle}>Plaza</button>
      <button type="button" onClick={onOpenPrivate} style={{ ...sourceTabStyle, fontSize: 'var(--ui-font-micro)' }}>链上广场</button>
    </div>
  );
}

const sourceTabStyle: CSSProperties = {
  height: 32,
  border: 'none',
  borderRadius: 0,
  background: 'transparent',
  color: '#8E867A',
  cursor: 'pointer',
  fontSize: 'var(--ui-font-caption)',
};

function WorldHome({
  residents,
  onOpenWorld,
}: {
  residents: Record<ThemedWorldKey, ThemedWorldResident[]>;
  onOpenWorld: (world: ThemedWorldKey) => void;
}) {
  const worldCards: Array<{ key: ThemedWorldKey; houseId: string }> = [
    { key: 'fitness', houseId: 'H04' },
    { key: 'learning', houseId: 'H12' },
    { key: 'maker', houseId: 'H20' },
  ];
  return (
    <div className="flex h-full flex-col overflow-y-auto" style={{ background: '#F5F0E8', fontFamily: 'Press Start 2P,monospace' }}>
      <div className="px-5 pb-3 pt-4">
        <h1 style={{ fontFamily: 'Caveat,cursive', fontSize: 'var(--ui-font-display)', fontWeight: 700, color: '#1C1911', lineHeight: 1 }}>Pocket Earth Worlds</h1>
        <p style={{ fontSize: 'var(--ui-font-label)', color: '#7A7468', fontFamily: "'Fusion Pixel 10px Monospaced SC',sans-serif" }}>
          3 个链上场景 · 25 位 Agent · Injective 可验证协作
        </p>
      </div>

      <div className="px-5 pb-3">
        <div className="w-full p-3 text-left" style={{ background: 'linear-gradient(120deg, rgba(107,158,122,.14), rgba(74,127,165,.09))', border: '1.5px solid rgba(107,158,122,.32)' }}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center" style={{ background: '#FAF6EF', color: '#6B9E7A' }}><BookOpen size={17}/></div>
              <div>
                <p style={{ color: '#1C1911', fontSize: 'var(--ui-font-label)', fontFamily: "'Fusion Pixel 10px Monospaced SC',sans-serif" }}>Agent 正在链上协作</p>
                <p style={{ color: '#7A7468', fontSize: 'var(--ui-font-caption)', marginTop: 4, fontFamily: "'Fusion Pixel 10px Monospaced SC',sans-serif" }}>身份 · Skill · 回执 · 公共知识版次</p>
              </div>
            </div>
            <ChevronRight size={15} color="#6B9E7A"/>
          </div>
        </div>
      </div>

      <div className="pb-3">
        <div className="mb-2 flex items-end justify-between px-5">
          <div>
            <p style={{ fontSize: 'var(--ui-font-heading)', fontWeight: 700, color: '#1C1911' }}>World Residents</p>
            <p style={{ fontSize: 'var(--ui-font-caption)', color: '#7A7468', marginTop: 3, fontFamily: "'Fusion Pixel 10px Monospaced SC',sans-serif" }}>小小物件，也有鲜明人格</p>
          </div>
          <span style={{ color: '#E8634A', fontSize: 'var(--ui-font-body)', fontFamily: "'Fusion Pixel 10px Monospaced SC',sans-serif" }}>查看全部 →</span>
        </div>
        <div className="flex gap-2 overflow-x-auto px-5">
          {CAROUSEL_AGENTS.map((agent) => (
            <div key={agent.id} className="flex-shrink-0 overflow-hidden text-left" style={{ width: 76, background: '#FAF6EF', border: '1.5px solid rgba(28,25,17,.1)' }}>
              <div className="relative flex items-center justify-center" style={{ height: 58, background: `${agent.color}14` }}>
                <img src={SVG_AGENTS[agent.id]} alt="" draggable={false} style={{ width: 58, height: 58, objectFit: 'contain' }}/>
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5" style={{ background: agent.color }}/>
              </div>
              <div className="px-2 py-1.5">
                <p className="truncate" style={{ fontSize: 'var(--ui-font-body)', color: '#1C1911', fontWeight: 700 }}>{agent.name}</p>
                <p className="truncate" style={{ fontSize: 'var(--ui-font-caption)', color: agent.color, marginTop: 2, fontFamily: "'Fusion Pixel 10px Monospaced SC',sans-serif" }}>{agent.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 px-5 pb-4">
        {worldCards.map(({ key, houseId }) => (
          <button
            key={key}
            type="button"
            onClick={() => onOpenWorld(key)}
            className="relative overflow-hidden text-left"
            aria-label={`进入${THEMED_WORLDS[key].chineseName}`}
            style={{ padding: 0, border: `2px solid ${THEMED_WORLDS[key].accent}`, boxShadow: `0 0 0 4px ${THEMED_WORLDS[key].accent}0D, 0 5px 16px rgba(28,25,17,.09)`, background: THEMED_WORLDS[key].paper }}
          >
            <span style={{ position: 'absolute', zIndex: 10, top: 9, right: 9, padding: '5px 7px', color: '#FAF6EF', background: THEMED_WORLDS[key].accent, borderRadius: 0, fontFamily: "'Fusion Pixel 10px Monospaced SC',sans-serif", fontSize: 'var(--ui-font-micro)' }}>
              Plaza {houseId}
            </span>
            <ThemedWorldPreview config={THEMED_WORLDS[key]} residents={residents[key]}/>
          </button>
        ))}
      </div>

      <div className="px-5 pb-5">
        <div className="flex items-center justify-center gap-2 py-3.5" style={{ color: '#FAF6EF', background: 'linear-gradient(135deg,#E8634A,#D18A3D)', border: '1.5px solid rgba(28,25,17,.12)', boxShadow: '0 7px 18px rgba(232,99,74,.2)' }}>
          <Sparkles size={18}/>
          <span style={{ fontFamily: "'Fusion Pixel 10px Monospaced SC',sans-serif", fontSize: 'var(--ui-font-label)', fontWeight: 700 }}>创建自己的链上 Agent 世界</span>
        </div>
      </div>
    </div>
  );
}

export default function AgentWorldPlaza({ onOpenPrivate, onOpenPublic }: Props) {
  const residents = useMemo(getResidents, []);
  const [selectedWorld, setSelectedWorld] = useState<ThemedWorldKey | null>(null);

  if (!selectedWorld) {
    return <WorldHome residents={residents} onOpenWorld={setSelectedWorld}/>;
  }

  const sceneResidents = withVisitors(selectedWorld, residents);
  const sceneControl: ReactNode = (
    <SourceSceneControl
      world={selectedWorld}
      onWorldChange={setSelectedWorld}
      onOpenPrivate={onOpenPrivate}
      onOpenPlaza={() => setSelectedWorld(null)}
    />
  );

  return (
    <ThemedWorldScreen
      config={THEMED_WORLDS[selectedWorld]}
      residents={sceneResidents}
      sceneControl={sceneControl}
      decorations={getWorldDecorations(selectedWorld)}
      onOpenBuild={() => undefined}
      onCapture={() => undefined}
      onBack={() => setSelectedWorld(null)}
      onOpenWorldline={() => onOpenPublic()}
      onOpenVisitor={() => undefined}
      onOpenAgents={() => undefined}
    />
  );
}
