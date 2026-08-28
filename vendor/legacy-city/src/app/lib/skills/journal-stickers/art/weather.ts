// 手帐贴纸 · 天气美术（内联 SVG，自包含）—— 由 draw-journal-stickers 工作流成套绘制
// 每条 key 对应 manifest.ts 的贴纸 id；改画风只动这里，上层零改动。
export const WEATHER_ART: Record<string, string> = {
  'sun': `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
<defs>
<filter id="sun-sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.18"/></filter>
<g id="sun-rays">
<line x1="76" y1="50" x2="90" y2="50"/>
<line x1="72.5" y1="63" x2="80.3" y2="67.5"/>
<line x1="63" y1="72.5" x2="70" y2="84.6"/>
<line x1="50" y1="76" x2="50" y2="85"/>
<line x1="37" y1="72.5" x2="30" y2="84.6"/>
<line x1="27.5" y1="63" x2="19.7" y2="67.5"/>
<line x1="24" y1="50" x2="10" y2="50"/>
<line x1="27.5" y1="37" x2="19.7" y2="32.5"/>
<line x1="37" y1="27.5" x2="30" y2="15.4"/>
<line x1="50" y1="24" x2="50" y2="15"/>
<line x1="63" y1="27.5" x2="70" y2="15.4"/>
<line x1="72.5" y1="37" x2="80.3" y2="32.5"/>
</g>
</defs>
<g filter="url(#sun-sh)" stroke="#4a4540" stroke-linecap="round" stroke-linejoin="round">
<use href="#sun-rays" stroke="#ffffff" stroke-width="8"/>
<use href="#sun-rays" stroke="#f0a04b" stroke-width="5"/>
<circle cx="50" cy="50" r="24" fill="#f2c14e" stroke="#ffffff" stroke-width="6" style="paint-order:stroke"/>
<circle cx="40" cy="55" r="3.6" fill="#f0b8c0" stroke="none"/>
<circle cx="60" cy="55" r="3.6" fill="#f0b8c0" stroke="none"/>
<circle cx="42" cy="47" r="2" fill="#4a4540" stroke="none"/>
<circle cx="58" cy="47" r="2" fill="#4a4540" stroke="none"/>
<path d="M44 55 Q50 61 56 55" fill="none" stroke="#4a4540" stroke-width="2"/>
</g>
</svg>`,
  'cloud': `<svg viewBox="0 0 100 76" xmlns="http://www.w3.org/2000/svg">
<defs>
<filter id="cloud-sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.18"/></filter>
<path id="cloud-p" d="M23 65 Q9 65 9 52 Q9 40 20 36 Q20 21 36 25 Q45 13 54 19 Q66 12 73 26 Q89 27 90 42 Q90 57 77 65 Z"/>
<clipPath id="cloud-clip"><use href="#cloud-p"/></clipPath>
</defs>
<g filter="url(#cloud-sh)" stroke-linecap="round" stroke-linejoin="round">
<use href="#cloud-p" fill="#ffffff" stroke="#ffffff" stroke-width="6" style="paint-order:stroke"/>
<g clip-path="url(#cloud-clip)"><ellipse cx="50" cy="68" rx="45" ry="17" fill="#a9c2d6"/></g>
<use href="#cloud-p" fill="none" stroke="#4a4540" stroke-width="2"/>
<circle cx="35" cy="43" r="3.6" fill="#f0b8c0"/>
<circle cx="64" cy="43" r="3.6" fill="#f0b8c0"/>
<circle cx="42" cy="38" r="2.2" fill="#4a4540"/>
<circle cx="57" cy="38" r="2.2" fill="#4a4540"/>
<path d="M42 42 Q49.5 48 57 42" fill="none" stroke="#4a4540" stroke-width="2"/>
</g>
</svg>`,
  'partly-cloudy': `<svg viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg">
<defs>
<filter id="partly-cloudy-sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.18"/></filter>
<g id="partly-cloudy-rays">
<line x1="34" y1="16" x2="34" y2="9"/>
<line x1="22" y1="21" x2="17.2" y2="16.2"/>
<line x1="17" y1="33" x2="10" y2="33"/>
<line x1="46" y1="21" x2="50.8" y2="16.2"/>
<line x1="51" y1="33" x2="58" y2="33"/>
</g>
<path id="partly-cloudy-p" d="M30 79 Q18 79 17 68 Q15 58 27 57 Q26 42 41 45 Q48 39 58 45 Q70 41 74 54 Q87 55 86 67 Q88 79 75 79 Z"/>
<clipPath id="partly-cloudy-clip"><use href="#partly-cloudy-p"/></clipPath>
</defs>
<g filter="url(#partly-cloudy-sh)" stroke="#4a4540" stroke-linecap="round" stroke-linejoin="round">
<use href="#partly-cloudy-rays" stroke="#ffffff" stroke-width="7"/>
<use href="#partly-cloudy-rays" stroke="#f0a04b" stroke-width="4"/>
<circle cx="34" cy="33" r="15" fill="#f2c14e" stroke="#ffffff" stroke-width="6" style="paint-order:stroke"/>
<circle cx="34" cy="33" r="15" fill="none" stroke="#4a4540" stroke-width="2"/>
<use href="#partly-cloudy-p" fill="#ffffff" stroke="#ffffff" stroke-width="6" style="paint-order:stroke"/>
<g clip-path="url(#partly-cloudy-clip)"><ellipse cx="52" cy="87" rx="40" ry="14" fill="#a9c2d6"/></g>
<use href="#partly-cloudy-p" fill="none" stroke="#4a4540" stroke-width="2"/>
<circle cx="46" cy="63" r="2" fill="#4a4540"/>
<circle cx="61" cy="63" r="2" fill="#4a4540"/>
<path d="M49 67 Q53.5 71 58 67" fill="none" stroke="#4a4540" stroke-width="2"/>
</g>
</svg>`,
  'rainbow': `<svg viewBox="0 0 100 72" xmlns="http://www.w3.org/2000/svg">
<defs>
<filter id="rainbow-sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.18"/></filter>
<path id="rainbow-cloud" d="M11 61 Q9 56 14 54 Q14 49 22 51 Q27 46 31 51 Q38 49 40 54 Q45 56 43 61 Z"/>
</defs>
<g filter="url(#rainbow-sh)" stroke-linecap="round" stroke-linejoin="round">
<path d="M6 58 A44 44 0 0 1 94 58 L55 58 A5 5 0 0 0 45 58 Z" fill="#ffffff"/>
<g fill="none" stroke-linecap="butt" stroke-width="6.8">
<path d="M15 58 A35 35 0 0 1 85 58" stroke="#e8695a"/>
<path d="M21.1 58 A28.9 28.9 0 0 1 78.9 58" stroke="#f0a04b"/>
<path d="M27.2 58 A22.8 22.8 0 0 1 72.8 58" stroke="#f2c14e"/>
<path d="M33.3 58 A16.7 16.7 0 0 1 66.7 58" stroke="#8fd0bf"/>
<path d="M39.4 58 A10.6 10.6 0 0 1 60.6 58" stroke="#6d8bab"/>
</g>
<use href="#rainbow-cloud" fill="#ffffff" stroke="#ffffff" stroke-width="6" style="paint-order:stroke"/>
<use href="#rainbow-cloud" fill="#ffffff" stroke="#4a4540" stroke-width="1.6"/>
<use href="#rainbow-cloud" transform="translate(100,0) scale(-1,1)" fill="#ffffff" stroke="#ffffff" stroke-width="6" style="paint-order:stroke"/>
<use href="#rainbow-cloud" transform="translate(100,0) scale(-1,1)" fill="#ffffff" stroke="#4a4540" stroke-width="1.6"/>
</g>
</svg>`,
};
