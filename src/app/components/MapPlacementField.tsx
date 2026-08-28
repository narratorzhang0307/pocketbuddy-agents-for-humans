import { Loader2, LocateFixed, MapPin } from 'lucide-react';
import { useState } from 'react';
import { resolvePlace, type GeoHit } from '../lib/skills/resolvePlace';

export interface MapPlacementRoleOption { value: string; label: string }

interface MapPlacementFieldProps {
  place: string;
  hit: { place: string; lng: number; lat: number } | null;
  role: string;
  roles: MapPlacementRoleOption[];
  accent: string;
  sourceLabel?: string;
  evidence?: string;
  suggesting?: boolean;
  onPlaceChange: (place: string) => void;
  onRoleChange: (role: string) => void;
  onResolved: (hit: GeoHit) => void;
  placeholder?: string;
}

export default function MapPlacementField({
  place, hit, role, roles, accent, sourceLabel, evidence, suggesting,
  onPlaceChange, onRoleChange, onResolved, placeholder = '输入城市或地区',
}: MapPlacementFieldProps) {
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState('');

  const search = async () => {
    const query = place.trim();
    if (!query || resolving) return;
    setResolving(true); setError('');
    const next = await resolvePlace(query);
    if (next) onResolved(next);
    else setError('没有找到这个地点，请换成更完整的城市或地区名。');
    setResolving(false);
  };

  return (
    <section className="border-2 border-black bg-[#f7f1df] p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: accent }} strokeWidth={2.7} />
          <span className="font-pixel text-[7px] tracking-wide">地图落位 · 自动建议可手动改</span>
        </div>
        <span className="shrink-0 font-pixel text-[6px] text-black/45">{suggesting ? '端侧判断中…' : sourceLabel || '手动选择'}</span>
      </div>
      {roles.length > 1 && (
        <div className="mt-2 grid" style={{ gridTemplateColumns: `repeat(${roles.length}, minmax(0, 1fr))` }}>
          {roles.map((option) => (
            <button key={option.value} type="button" onClick={() => onRoleChange(option.value)}
              className={`border-2 border-black py-1.5 text-[8px] font-bold [&+&]:border-l-0 ${role === option.value ? 'text-black' : 'bg-white text-black/55'}`}
              style={role === option.value ? { background: accent } : undefined}>{option.label}</button>
          ))}
        </div>
      )}
      <div className="mt-2 flex gap-1.5">
        <div className="relative min-w-0 flex-1">
          <LocateFixed className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-black/35" />
          <input value={place} onChange={(event) => { onPlaceChange(event.target.value); setError(''); }}
            onKeyDown={(event) => { if (event.key === 'Enter') void search(); }} placeholder={placeholder}
            className="w-full border-2 border-black bg-white py-1.5 pl-7 pr-2 text-[9px] outline-none" />
        </div>
        <button type="button" onClick={() => void search()} disabled={!place.trim() || resolving || suggesting}
          className="grid w-9 shrink-0 place-items-center border-2 border-black bg-black disabled:opacity-35" style={{ color: accent }} aria-label="解析地点">
          {resolving || suggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
        </button>
      </div>
      {evidence && <p className="mb-0 mt-1.5 text-[7.5px] leading-relaxed text-black/48">建议依据：{evidence}</p>}
      {error && <p className="mb-0 mt-1.5 text-[8px] text-[#a21c3b]">{error}</p>}
      <div className="mt-1.5 text-[7.5px] text-black/45">
        {hit ? `✓ ${hit.place} · 坐标已找到；点击页面确认按钮后才写地图` : suggesting ? '正在本机寻找明确地点证据；没有证据会保持为空。' : '地点仍未确认；自动建议和手动输入都不会直接写地图。'}
      </div>
    </section>
  );
}
