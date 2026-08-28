import modernPostboxPng from '../assets/world/modern/postbox.png';
import modernFountainPng from '../assets/world/modern/fountain.png';
import modernKioskPng from '../assets/world/modern/kiosk.png';
import type { ThemedWorldDecoration, ThemedWorldKey } from './ThemedWorldScenes';

const INK = '#1C1911';
const P_WARM = '#EAE5DA';

function TreeAsset() {
  return (
    <svg width="58" height="72" viewBox="0 0 58 72" style={{ overflow: 'visible' }}>
      <circle cx="29" cy="26" r="22" fill="#B8D4A0" stroke={INK} strokeWidth="1.8"/>
      <circle cx="18" cy="32" r="14" fill="#A8C890" stroke={INK} strokeWidth="1.5"/>
      <circle cx="40" cy="30" r="13" fill="#B0CC98" stroke={INK} strokeWidth="1.5"/>
      <circle cx="29" cy="20" r="12" fill="#C0D8A8" stroke={INK} strokeWidth="1.2"/>
      <rect x="23" y="44" width="12" height="26" rx="4" fill="#C8A882" stroke={INK} strokeWidth="1.8"/>
      <path d="M25,50 C27,52 25,56 27,58" stroke="#A08060" strokeWidth="1" fill="none"/>
      <path d="M33,48 C31,52 33,54 31,58" stroke="#A08060" strokeWidth="1" fill="none"/>
      <circle cx="22" cy="22" r="2.5" fill="#E8634A" stroke={INK} strokeWidth="1"/>
      <circle cx="36" cy="17" r="2.5" fill="#E8634A" stroke={INK} strokeWidth="1"/>
      <circle cx="29" cy="32" r="2" fill="#E8634A" stroke={INK} strokeWidth="0.8"/>
    </svg>
  );
}

function BenchAsset() {
  return (
    <svg width="64" height="42" viewBox="0 0 64 42" style={{ overflow: 'visible' }}>
      <rect x="6" y="8" width="52" height="10" rx="3" fill="#D4B896" stroke={INK} strokeWidth="1.6"/>
      <rect x="6" y="14" width="52" height="8" rx="2" fill="#C8A882" stroke={INK} strokeWidth="1.4"/>
      <rect x="4" y="22" width="56" height="10" rx="3" fill="#D4B896" stroke={INK} strokeWidth="1.6"/>
      <rect x="4" y="26" width="56" height="6" rx="2" fill="#C8A882" stroke={INK} strokeWidth="1.4"/>
      <line x1="20" y1="22" x2="20" y2="32" stroke="#B8926A" strokeWidth="1"/>
      <line x1="34" y1="22" x2="34" y2="32" stroke="#B8926A" strokeWidth="1"/>
      <line x1="48" y1="22" x2="48" y2="32" stroke="#B8926A" strokeWidth="1"/>
      <rect x="8" y="30" width="6" height="12" rx="2" fill="#C8A882" stroke={INK} strokeWidth="1.5"/>
      <rect x="50" y="30" width="6" height="12" rx="2" fill="#C8A882" stroke={INK} strokeWidth="1.5"/>
      <rect x="2" y="12" width="8" height="22" rx="2" fill={P_WARM} stroke={INK} strokeWidth="1.4"/>
      <rect x="54" y="12" width="8" height="22" rx="2" fill={P_WARM} stroke={INK} strokeWidth="1.4"/>
    </svg>
  );
}

function MailboxAsset() {
  return (
    <svg width="36" height="72" viewBox="0 0 36 72" style={{ overflow: 'visible' }}>
      <path d="M6,22 Q18,12 30,22" fill="#E8191A" stroke={INK} strokeWidth="1.5"/>
      <rect x="6" y="20" width="24" height="30" rx="4" fill="#E8191A" stroke={INK} strokeWidth="1.8"/>
      <rect x="10" y="32" width="16" height="3" rx="1.5" fill={INK}/>
      <circle cx="18" cy="26" r="4" fill="#C80010" stroke={INK} strokeWidth="1.2"/>
      <rect x="15" y="50" width="6" height="22" rx="2" fill="#C8C2B4" stroke={INK} strokeWidth="1.5"/>
      <ellipse cx="18" cy="72" rx="10" ry="3" fill={P_WARM} stroke={INK} strokeWidth="1.2"/>
    </svg>
  );
}

function FountainAsset() {
  return (
    <svg width="72" height="64" viewBox="0 0 72 64" style={{ overflow: 'visible' }}>
      {[-14, -8, 0, 8, 14].map((dx, index) => (
        <path key={dx} d={`M36,20 Q${36 + dx * 0.6},${12 + Math.abs(dx) * 0.2} ${36 + dx},6`} stroke="#9BBFCF" strokeWidth="1.2" fill="none" opacity="0.7" style={{ animation: `waterSway ${1.5 + index * 0.2}s ease-in-out infinite alternate` }}/>
      ))}
      <ellipse cx="36" cy="20" rx="14" ry="5" fill="#C8E0E8" stroke={INK} strokeWidth="1.5"/>
      <ellipse cx="36" cy="18" rx="13" ry="4" fill="#D8EEF5" stroke={INK} strokeWidth="1.2"/>
      <rect x="32" y="20" width="8" height="18" rx="2" fill="#EAE5DA" stroke={INK} strokeWidth="1.5"/>
      <path d="M6,42 Q36,52 66,42 L62,50 Q36,60 10,50 Z" fill="#C8E0E8" stroke={INK} strokeWidth="1.6"/>
      <ellipse cx="36" cy="42" rx="30" ry="8" fill="#D8EEF5" stroke={INK} strokeWidth="1.5"/>
      <ellipse cx="36" cy="44" rx="12" ry="3" fill="none" stroke="#9BBFCF" strokeWidth="0.8" opacity="0.6"/>
      <ellipse cx="36" cy="44" rx="20" ry="5" fill="none" stroke="#9BBFCF" strokeWidth="0.6" opacity="0.4"/>
      <ellipse cx="36" cy="52" rx="26" ry="6" fill={P_WARM} stroke={INK} strokeWidth="1.5"/>
    </svg>
  );
}

function WellAsset() {
  return (
    <svg width="58" height="68" viewBox="0 0 58 68" style={{ overflow: 'visible' }}>
      <line x1="10" y1="24" x2="10" y2="10" stroke={INK} strokeWidth="2"/>
      <line x1="48" y1="24" x2="48" y2="10" stroke={INK} strokeWidth="2"/>
      <polygon points="6,12 29,2 52,12" fill="#E8634A22" stroke={INK} strokeWidth="1.6" strokeLinejoin="round"/>
      <line x1="8" y1="10" x2="50" y2="10" stroke={INK} strokeWidth="2"/>
      <circle cx="29" cy="10" r="3" fill={P_WARM} stroke={INK} strokeWidth="1.5"/>
      <line x1="29" y1="13" x2="29" y2="28" stroke={INK} strokeWidth="1.2" strokeDasharray="2,1.5"/>
      <rect x="24" y="28" width="10" height="10" rx="2" fill="#C8A882" stroke={INK} strokeWidth="1.4"/>
      <path d="M24,30 Q29,27 34,30" fill="none" stroke={INK} strokeWidth="1.2"/>
      <ellipse cx="29" cy="36" rx="22" ry="6" fill={P_WARM} stroke={INK} strokeWidth="1.6"/>
      <rect x="7" y="36" width="44" height="24" rx="2" fill={P_WARM} stroke={INK} strokeWidth="1.6"/>
      {[0, 1, 2].map((index) => <ellipse key={index} cx="29" cy={36 + index * 8} rx={22 - index * 0.5} ry="4" fill="none" stroke="#C8C2B4" strokeWidth="0.8"/>)}
      <ellipse cx="29" cy="60" rx="22" ry="6" fill={P_WARM} stroke={INK} strokeWidth="1.6"/>
      <ellipse cx="29" cy="38" rx="18" ry="3.5" fill="#9BBFCF" opacity="0.5"/>
    </svg>
  );
}

function GeneratedMapAsset({ src, alt }: { src: string; alt: string }) {
  return <img src={src} alt={alt} draggable={false} style={{ width: 92, height: 92, objectFit: 'contain', display: 'block', pointerEvents: 'none', userSelect: 'none' }}/>;
}

export function getWorldDecorations(worldKey: ThemedWorldKey): ThemedWorldDecoration[] {
  const presets: Record<ThemedWorldKey, Array<Omit<ThemedWorldDecoration, 'id' | 'preset'>>> = {
    fitness: [
      { label: '大树', x: 9, y: 32, scale: 0.72, art: <TreeAsset/> },
      { label: '大树', x: 91, y: 27, scale: 0.65, art: <TreeAsset/> },
      { label: '邮筒', x: 9, y: 63, scale: 0.54, art: <MailboxAsset/> },
      { label: '长椅', x: 35, y: 79, scale: 0.52, art: <BenchAsset/> },
      { label: '喷泉', x: 73, y: 79, scale: 0.55, art: <FountainAsset/> },
    ],
    learning: [
      { label: '大树', x: 9, y: 32, scale: 0.7, art: <TreeAsset/> },
      { label: '大树', x: 91, y: 27, scale: 0.64, art: <TreeAsset/> },
      { label: '邮筒', x: 91, y: 63, scale: 0.5, art: <MailboxAsset/> },
      { label: '长椅', x: 35, y: 79, scale: 0.5, art: <BenchAsset/> },
      { label: '水井', x: 73, y: 79, scale: 0.52, art: <WellAsset/> },
    ],
    maker: [
      { label: '大树', x: 9, y: 32, scale: 0.7, art: <TreeAsset/> },
      { label: '旧邮筒', x: 91, y: 28, scale: 0.48, art: <GeneratedMapAsset src={modernPostboxPng} alt="绣湖风格邮筒"/> },
      { label: '标本亭', x: 91, y: 63, scale: 0.47, art: <GeneratedMapAsset src={modernKioskPng} alt="绣湖风格小亭"/> },
      { label: '旧长椅', x: 35, y: 79, scale: 0.5, art: <BenchAsset/> },
      { label: '静默喷泉', x: 73, y: 79, scale: 0.5, art: <GeneratedMapAsset src={modernFountainPng} alt="绣湖风格喷泉"/> },
    ],
  };
  return presets[worldKey].map((decoration, index) => ({ ...decoration, id: -(index + 1), preset: true }));
}
