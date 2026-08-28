import { useMemo, useState, type CSSProperties, type DragEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Check, GripVertical, Plus, RotateCcw, Sparkles, X } from 'lucide-react';
import type {
  SkillBlockCapability,
  SkillCanvasDraft,
  SkillCanvasNode,
} from '../../../frost-agent/skill-canvas';
import './SkillDeckBuilder.css';

export interface SkillCardDefinition {
  capability: SkillBlockCapability;
  label: string;
  detail: string;
  family: string;
  color: string;
  icon: LucideIcon;
  serial: string;
  description: string;
  input: string;
  output: string;
  permission: string;
  metrics: {
    speed: number;
    reliability: number;
    privacy: number;
    energy: number;
  };
}

export interface SkillDeckTemplate {
  id: string;
  label: string;
  detail: string;
  accent: string;
}

interface Props {
  draft: SkillCanvasDraft;
  cards: SkillCardDefinition[];
  templates: SkillDeckTemplate[];
  onChange: (draft: SkillCanvasDraft) => void;
  onTemplate: (id: string) => void;
  onAdd: (capability: SkillBlockCapability, targetIndex?: number) => void;
  onRemove: (id: string) => void;
  onReorder: (id: string, targetIndex: number) => void;
}

type SelectedCard = { card: SkillCardDefinition; node?: SkillCanvasNode };

const CARD_MIME = 'application/x-pocket-skill-card';
const FAMILY_ORDER = ['全部', '触发', '感知', '思考', '守护', '行动', '记忆'];

function cardByCapability(cards: SkillCardDefinition[], capability: SkillBlockCapability) {
  return cards.find((card) => card.capability === capability)!;
}

function MiniArtwork({ card }: { card: SkillCardDefinition }) {
  const Icon = card.icon;
  return <div className="sdb-mini-art" style={{ '--sdb-accent': card.color } as CSSProperties}>
    <span className="sdb-mini-sun" />
    <span className="sdb-mini-path" />
    <Icon aria-hidden="true" />
  </div>;
}

function LibraryCard({ card, onOpen }: { card: SkillCardDefinition; onOpen: () => void }) {
  return <button
    type="button"
    draggable
    className="sdb-library-card"
    style={{ '--sdb-accent': card.color } as CSSProperties}
    onDragStart={(event) => {
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData(CARD_MIME, `capability:${card.capability}`);
      event.dataTransfer.setData('text/plain', `capability:${card.capability}`);
    }}
    onClick={onOpen}
    aria-label={`查看 ${card.label} 能力卡`}
  >
    <MiniArtwork card={card} />
    <span className="sdb-library-copy">
      <small>NO.{card.serial} · {card.family}</small>
      <b>{card.label}</b>
      <span>{card.detail}</span>
    </span>
  </button>;
}

function DeckSlot({
  index,
  node,
  card,
  active,
  onDropCard,
  onOpen,
  onRemove,
}: {
  index: number;
  node?: SkillCanvasNode;
  card?: SkillCardDefinition;
  active: boolean;
  onDropCard: (payload: string, index: number) => void;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const acceptDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const payload = event.dataTransfer.getData(CARD_MIME) || event.dataTransfer.getData('text/plain');
    if (payload) onDropCard(payload, index);
  };

  if (!node || !card) {
    return <button
      type="button"
      className={`sdb-slot is-empty${active ? ' is-active' : ''}`}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }}
      onDrop={acceptDrop}
      onClick={onOpen}
      aria-label={`空白卡槽 ${index + 1}`}
    >
      <span className="sdb-empty-art"><Plus /></span>
      <b>DROP CARD</b>
      <small>空白卡槽 {String(index + 1).padStart(2, '0')}</small>
    </button>;
  }

  return <article
    className="sdb-slot is-filled"
    style={{ '--sdb-accent': card.color } as CSSProperties}
    draggable
    onDragStart={(event) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(CARD_MIME, `node:${node.id}`);
      event.dataTransfer.setData('text/plain', `node:${node.id}`);
    }}
    onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
    onDrop={acceptDrop}
  >
    <button type="button" className="sdb-slot-main" onClick={onOpen} aria-label={`放大 ${node.label} 卡牌`}>
      <MiniArtwork card={card} />
      <span className="sdb-slot-copy"><small>{String(index + 1).padStart(2, '0')} · {card.family}</small><b>{node.label}</b></span>
    </button>
    <GripVertical className="sdb-slot-grip" aria-hidden="true" />
    <button type="button" className="sdb-slot-remove" onClick={onRemove} aria-label={`移除 ${node.label}`}><X /></button>
  </article>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="sdb-metric"><span>{label}</span><div>{Array.from({ length: 5 }, (_, index) => <i key={index} className={index < value ? 'is-on' : ''} />)}</div><b>{value}/5</b></div>;
}

function CardDetail({ selected, onClose, onAdd, onRemove }: {
  selected: SelectedCard;
  onClose: () => void;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const { card, node } = selected;
  const Icon = card.icon;

  return <div className="sdb-modal" role="dialog" aria-modal="true" aria-label={`${card.label} 能力卡详情`} onClick={onClose}>
    <div className="sdb-modal-panel" onClick={(event) => event.stopPropagation()}>
      <div className={`sdb-detail-shell${flipped ? ' is-flipped' : ''}`} style={{ '--sdb-accent': card.color } as CSSProperties}>
        <div className="sdb-detail-rotor">
          <article className="sdb-detail-face sdb-detail-front">
            <header><span>POCKET BUDDY · SKILL CANVAS</span><b>NO.{card.serial}</b></header>
            <div className="sdb-detail-art"><span className="sdb-detail-orbit" /><span className="sdb-detail-ground" /><Icon /></div>
            <div className="sdb-detail-copy">
              <div><h2>{node?.label || card.label}</h2><span>{card.family}能力</span></div>
              <p>{card.description}</p>
              <small>{card.detail}</small>
            </div>
          </article>
          <article className="sdb-detail-face sdb-detail-back">
            <header><span>ABILITY RECORD</span><b>NO.{card.serial}</b></header>
            <div className="sdb-back-title"><span className="sdb-back-icon"><Icon /></span><div><small>{card.family} / {card.capability}</small><h2>{node?.label || card.label}</h2></div></div>
            <div className="sdb-metrics">
              <Metric label="响应" value={card.metrics.speed} />
              <Metric label="可靠" value={card.metrics.reliability} />
              <Metric label="隐私" value={card.metrics.privacy} />
              <Metric label="能耗" value={card.metrics.energy} />
            </div>
            <dl className="sdb-data-list"><div><dt>INPUT</dt><dd>{card.input}</dd></div><div><dt>OUTPUT</dt><dd>{card.output}</dd></div><div><dt>ACCESS</dt><dd>{card.permission}</dd></div></dl>
            <div className="sdb-local-note"><Check />数值来自能力契约，运行时仍由 Taskmaster 验证</div>
          </article>
        </div>
      </div>
      <div className="sdb-modal-actions">
        <button type="button" onClick={() => setFlipped((value) => !value)}><RotateCcw />{flipped ? '看正面' : '翻到背面'}</button>
        {node
          ? <button type="button" className="is-danger" onClick={onRemove}>移出画布</button>
          : <button type="button" className="is-primary" onClick={onAdd}><Plus />加入画布</button>}
      </div>
      <button type="button" className="sdb-modal-close" onClick={onClose} aria-label="关闭卡牌详情"><X /></button>
    </div>
  </div>;
}

export default function SkillDeckBuilder({ draft, cards, templates, onChange, onTemplate, onAdd, onRemove, onReorder }: Props) {
  const [family, setFamily] = useState('全部');
  const [selected, setSelected] = useState<SelectedCard | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(true);
  const filteredCards = useMemo(() => family === '全部' ? cards : cards.filter((card) => card.family === family), [cards, family]);
  const slotCount = Math.max(8, draft.nodes.length + 2);

  const handleDrop = (payload: string, index: number) => {
    if (payload.startsWith('node:')) onReorder(payload.slice(5), index);
    if (payload.startsWith('capability:')) onAdd(payload.slice(11) as SkillBlockCapability, index);
  };

  return <section className="sdb-builder">
    <header className="sdb-identity">
      <div className="sdb-title-fields">
        <span className="sdb-kicker">技能画布 · SKILL CANVAS</span>
        <input aria-label="Skill 名字" value={draft.title} maxLength={28} onChange={(event) => onChange({ ...draft, title: event.target.value })} placeholder="给这个 Skill 起个名字" />
        <textarea aria-label="告诉 Frost 想做什么" value={draft.prompt} maxLength={120} onChange={(event) => onChange({ ...draft, prompt: event.target.value })} placeholder="用一句话告诉 Frost，这个 Skill 要完成什么…" />
      </div>
      <div className="sdb-templates">
        <small>画布模板 · STARTERS</small>
        <div>{templates.map((template) => <button key={template.id} type="button" onClick={() => onTemplate(template.id)} style={{ '--sdb-accent': template.accent } as CSSProperties}><i /><span><b>{template.label}</b><small>{template.detail}</small></span></button>)}</div>
      </div>
    </header>

    <section className="sdb-workbench">
      <div className="sdb-section-head"><span><small>01 · YOUR SKILL</small><h2>把能力放进画布</h2></span><span className="sdb-count">{draft.nodes.length} CARDS</span></div>
      <p className="sdb-instruction"><Sparkles />拖入空白卡框，或点下面的小卡放大查看。顺序可以很粗糙，Frost 会继续整理。</p>
      <div className="sdb-slots">{Array.from({ length: slotCount }, (_, index) => {
        const node = draft.nodes[index];
        const card = node ? cardByCapability(cards, node.capability) : undefined;
        return <DeckSlot key={node?.id || `empty-${index}`} index={index} node={node} card={card} active={index === draft.nodes.length} onDropCard={handleDrop} onOpen={() => node && card ? setSelected({ card, node }) : setLibraryOpen(true)} onRemove={() => node && onRemove(node.id)} />;
      })}</div>
    </section>

    <section className="sdb-library">
      <button type="button" className="sdb-library-toggle" onClick={() => setLibraryOpen((value) => !value)} aria-expanded={libraryOpen}><span><small>02 · CARD LIBRARY</small><b>能力卡牌库</b></span><span>{libraryOpen ? '收起' : '展开'}</span></button>
      {libraryOpen && <>
        <div className="sdb-filters">{FAMILY_ORDER.map((item) => <button key={item} type="button" className={family === item ? 'is-active' : ''} onClick={() => setFamily(item)}>{item}</button>)}</div>
        <div className="sdb-card-grid">{filteredCards.map((card) => <LibraryCard key={card.capability} card={card} onOpen={() => setSelected({ card })} />)}</div>
      </>}
    </section>

    {selected && <CardDetail selected={selected} onClose={() => setSelected(null)} onAdd={() => { onAdd(selected.card.capability); setSelected(null); }} onRemove={() => { if (selected.node) onRemove(selected.node.id); setSelected(null); }} />}
  </section>;
}
