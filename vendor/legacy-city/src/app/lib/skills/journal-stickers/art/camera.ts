// 手帐贴纸 · 相机美术（内联 SVG，自包含）—— 由 draw-journal-stickers 工作流成套绘制
// 每条 key 对应 manifest.ts 的贴纸 id；改画风只动这里，上层零改动。
export const CAMERA_ART: Record<string, string> = {
  'camera-instant': `<svg viewBox="0 0 100 96" xmlns="http://www.w3.org/2000/svg">
<defs>
<filter id="camera-instant-sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.18"/></filter>
</defs>
<g filter="url(#camera-instant-sh)" fill="none" stroke="#4a4540" stroke-linecap="round" stroke-linejoin="round">
<rect x="15" y="12" width="70" height="72" rx="12" fill="#ec8140" stroke="#ffffff" stroke-width="6.5" style="paint-order:stroke"/>
<rect x="15" y="12" width="70" height="72" rx="12" stroke-width="2"/>
<rect x="24" y="19" width="13" height="9" rx="2.5" fill="#4f6f91" stroke-width="2"/>
<circle cx="73" cy="24" r="5.5" fill="#e8695a" stroke-width="2"/>
<g stroke-width="1.2">
<rect x="42" y="19" width="6.5" height="9" fill="#f0a04b"/>
<rect x="48.5" y="19" width="6.5" height="9" fill="#f2c14e"/>
<rect x="55" y="19" width="6.5" height="9" fill="#8fd0bf"/>
<rect x="61.5" y="19" width="6.5" height="9" fill="#6d8bab"/>
</g>
<circle cx="50" cy="52" r="21" fill="#4f6f91" stroke="#ffffff" stroke-width="4" style="paint-order:stroke"/>
<circle cx="50" cy="52" r="21" stroke-width="2"/>
<circle cx="50" cy="52" r="13" fill="#a9c2d6" stroke-width="1.5"/>
<circle cx="44" cy="46" r="4" fill="#ffffff" stroke="none"/>
<rect x="26" y="75" width="48" height="4.5" rx="2.2" fill="#f4ecd8" stroke-width="1.5"/>
</g>
</svg>`,
  'camera-retro': `<svg viewBox="0 0 100 78" xmlns="http://www.w3.org/2000/svg">
<defs>
<filter id="camera-retro-sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.18"/></filter>
<clipPath id="camera-retro-cl"><rect x="12" y="22" width="76" height="44" rx="8"/></clipPath>
</defs>
<g filter="url(#camera-retro-sh)" fill="none" stroke="#4a4540" stroke-linecap="round" stroke-linejoin="round">
<rect x="40" y="11" width="16" height="9" rx="1.5" fill="#9aa0a2" stroke="#ffffff" stroke-width="5" style="paint-order:stroke"/>
<rect x="40" y="11" width="16" height="9" rx="1.5" stroke-width="2"/>
<rect x="62" y="9" width="17" height="13" rx="3" fill="#a08a6f" stroke="#ffffff" stroke-width="5" style="paint-order:stroke"/>
<rect x="62" y="9" width="17" height="13" rx="3" stroke-width="2"/>
<rect x="12" y="22" width="76" height="44" rx="8" fill="#e7ddc7" stroke="#ffffff" stroke-width="6" style="paint-order:stroke"/>
<rect x="12" y="44" width="76" height="22" fill="#6d8bab" stroke="none" clip-path="url(#camera-retro-cl)"/>
<rect x="12" y="22" width="76" height="44" rx="8" stroke-width="2"/>
<rect x="19" y="48" width="14" height="12" rx="2" fill="#c8a97e" stroke-width="1.6"/>
<circle cx="49" cy="44" r="15" fill="#4a4540" stroke="#ffffff" stroke-width="4" style="paint-order:stroke"/>
<circle cx="49" cy="44" r="15" stroke="#b8bcc0" stroke-width="3"/>
<circle cx="49" cy="44" r="8" fill="#4f6f91" stroke-width="1.5"/>
<circle cx="45" cy="40" r="2.6" fill="#a9c2d6" stroke="none"/>
<rect x="68" y="27" width="12" height="9" rx="2" fill="#a9c2d6" stroke-width="2"/>
</g>
</svg>`,
  'camera-snap': `<svg viewBox="0 0 92 100" xmlns="http://www.w3.org/2000/svg">
<defs>
<filter id="camera-snap-sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.18"/></filter>
</defs>
<g filter="url(#camera-snap-sh)" fill="none" stroke="#4a4540" stroke-linecap="round" stroke-linejoin="round">
<g transform="rotate(-6 46 70)">
<rect x="26" y="48" width="40" height="40" rx="2.5" fill="#ffffff" stroke="#ffffff" stroke-width="5" style="paint-order:stroke"/>
<rect x="26" y="48" width="40" height="40" rx="2.5" stroke-width="2"/>
<rect x="30" y="52" width="32" height="26" fill="#b8bcc0" stroke-width="1.2"/>
</g>
<rect x="12" y="9" width="66" height="56" rx="12" fill="#8fd0bf" stroke="#ffffff" stroke-width="6.5" style="paint-order:stroke"/>
<rect x="12" y="9" width="66" height="56" rx="12" stroke-width="2"/>
<rect x="20" y="15" width="12" height="8" rx="2" fill="#4f6f91" stroke-width="2"/>
<circle cx="66" cy="19" r="4.5" fill="#e8695a" stroke-width="2"/>
<rect x="22" y="58" width="46" height="4" rx="2" fill="#f4ecd8" stroke-width="1.4"/>
<circle cx="45" cy="39" r="16" fill="#4f6f91" stroke="#ffffff" stroke-width="4" style="paint-order:stroke"/>
<circle cx="45" cy="39" r="16" stroke-width="2"/>
<circle cx="45" cy="39" r="9.5" fill="#a9c2d6" stroke-width="1.5"/>
<circle cx="40" cy="34" r="3" fill="#ffffff" stroke="none"/>
</g>
</svg>`,
  'film-strip': `<svg viewBox="0 0 54 100" xmlns="http://www.w3.org/2000/svg">
<defs>
<filter id="film-strip-sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.18"/></filter>
<clipPath id="film-strip-c1"><rect x="17" y="14" width="20" height="21" rx="1.5"/></clipPath>
<clipPath id="film-strip-c2"><rect x="17" y="39" width="20" height="21" rx="1.5"/></clipPath>
<clipPath id="film-strip-c3"><rect x="17" y="64" width="20" height="21" rx="1.5"/></clipPath>
</defs>
<g filter="url(#film-strip-sh)" stroke-linecap="round" stroke-linejoin="round">
<rect x="9" y="8" width="36" height="84" rx="5" fill="#4a4540" stroke="#ffffff" stroke-width="6" style="paint-order:stroke"/>
<g fill="#ffffff" stroke="none">
<rect x="11.5" y="14" width="4" height="6" rx="1"/>
<rect x="11.5" y="29" width="4" height="6" rx="1"/>
<rect x="11.5" y="44" width="4" height="6" rx="1"/>
<rect x="11.5" y="59" width="4" height="6" rx="1"/>
<rect x="11.5" y="74" width="4" height="6" rx="1"/>
<rect x="38.5" y="14" width="4" height="6" rx="1"/>
<rect x="38.5" y="29" width="4" height="6" rx="1"/>
<rect x="38.5" y="44" width="4" height="6" rx="1"/>
<rect x="38.5" y="59" width="4" height="6" rx="1"/>
<rect x="38.5" y="74" width="4" height="6" rx="1"/>
</g>
<g clip-path="url(#film-strip-c1)">
<rect x="17" y="14" width="20" height="21" fill="#a9c2d6"/>
<circle cx="31" cy="21" r="3" fill="#f2c14e"/>
<path d="M17 35 Q27 26 37 35 Z" fill="#8fae6f"/>
</g>
<g clip-path="url(#film-strip-c2)">
<rect x="17" y="39" width="20" height="21" fill="#f0a04b"/>
<circle cx="27" cy="47" r="4" fill="#e8695a"/>
<path d="M17 60 Q27 52 37 60 Z" fill="#ec8140"/>
</g>
<g clip-path="url(#film-strip-c3)">
<rect x="17" y="64" width="20" height="21" fill="#8fd0bf"/>
<path d="M17 85 Q22 76 27 82 Q32 88 37 80 L37 85 Z" fill="#6d8bab"/>
</g>
<g fill="none" stroke="#9aa0a2" stroke-width="1">
<rect x="17" y="14" width="20" height="21" rx="1.5"/>
<rect x="17" y="39" width="20" height="21" rx="1.5"/>
<rect x="17" y="64" width="20" height="21" rx="1.5"/>
</g>
</g>
</svg>`,
};
