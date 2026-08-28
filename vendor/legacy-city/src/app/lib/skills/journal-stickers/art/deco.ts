// 手帐贴纸 · 挂件·标签美术（内联 SVG，自包含）—— 由 draw-journal-stickers 工作流成套绘制
// 每条 key 对应 manifest.ts 的贴纸 id；改画风只动这里，上层零改动。
export const DECO_ART: Record<string, string> = {
  'plush-star': `<svg viewBox="0 0 90 100" xmlns="http://www.w3.org/2000/svg">
<defs>
<filter id="plush-star-sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.18"/></filter>
<path id="plush-star-p" d="M45,16 53.8,39.9 79.2,40.9 59.3,56.6 66.2,81.1 45,67 23.8,81.1 30.7,56.6 10.8,40.9 36.2,39.9Z"/>
</defs>
<g filter="url(#plush-star-sh)" transform="translate(1.35,8) scale(0.97)" stroke-linecap="round" stroke-linejoin="round">
<circle cx="45" cy="9" r="5.2" fill="none" stroke="#ffffff" stroke-width="6" style="paint-order:stroke"/>
<circle cx="45" cy="9" r="5.2" fill="none" stroke="#b8bcc0" stroke-width="2.6"/>
<rect x="53" y="3" width="15" height="12" rx="3" fill="#6d8bab" stroke="#ffffff" stroke-width="7" style="paint-order:stroke"/>
<rect x="53" y="3" width="15" height="12" rx="3" fill="#6d8bab" stroke="#4a4540" stroke-width="1.4"/>
<circle cx="57" cy="9" r="1.3" fill="#f4ecd8"/>
<use href="#plush-star-p" fill="#ffffff" stroke="#ffffff" stroke-width="12" style="paint-order:stroke"/>
<use href="#plush-star-p" fill="none" stroke="#f2c14e" stroke-width="8" stroke-dasharray="1.5 4"/>
<use href="#plush-star-p" fill="#f2c14e" stroke="#4a4540" stroke-width="1.6"/>
<circle cx="33" cy="55" r="2.6" fill="#f0b8c0"/>
<circle cx="57" cy="55" r="2.6" fill="#f0b8c0"/>
<circle cx="38" cy="50" r="2.1" fill="#4a4540"/>
<circle cx="52" cy="50" r="2.1" fill="#4a4540"/>
<path d="M40,55 Q45,60.5 50,55" fill="none" stroke="#4a4540" stroke-width="1.8"/>
</g>
</svg>`,
  'label-archive': `<svg viewBox="0 0 100 72" xmlns="http://www.w3.org/2000/svg">
<defs>
<filter id="label-archive-sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.18"/></filter>
</defs>
<g filter="url(#label-archive-sh)" stroke-linecap="round" stroke-linejoin="round">
<rect x="6" y="6" width="88" height="60" rx="9" fill="#ffffff"/>
<rect x="12" y="12" width="76" height="48" rx="6" fill="#e7ddc7"/>
<rect x="12" y="12" width="76" height="48" rx="6" fill="none" stroke="#4a4540" stroke-width="1.7"/>
<rect x="16.5" y="16.5" width="67" height="39" rx="4" fill="none" stroke="#4a4540" stroke-width="0.8"/>
<text x="50" y="33.5" font-family="sans-serif" font-weight="700" font-size="13" fill="#4a4540" text-anchor="middle" letter-spacing="1">ARCHIVE</text>
<line x1="24" y1="41" x2="76" y2="41" stroke="#a08a6f" stroke-width="1.1"/>
<text x="50" y="51.5" font-family="sans-serif" font-weight="700" font-size="8" fill="#6d8bab" text-anchor="middle" letter-spacing="1.5">NO. 001</text>
</g>
</svg>`,
  'heart': `<svg viewBox="0 0 100 94" xmlns="http://www.w3.org/2000/svg">
<defs>
<filter id="heart-sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.18"/></filter>
<path id="heart-p" d="M50,30 C45,20 33,12 24,20 C13,29 15,48 28,60 C37,69 46,77 50,82 C54,77 63,69 72,60 C85,48 87,29 76,20 C67,12 55,20 50,30Z"/>
</defs>
<g filter="url(#heart-sh)" transform="rotate(-4 50 48)" stroke-linecap="round" stroke-linejoin="round">
<use href="#heart-p" fill="#ffffff" stroke="#ffffff" stroke-width="12" style="paint-order:stroke"/>
<use href="#heart-p" fill="#e8695a" stroke="#4a4540" stroke-width="1.8"/>
<ellipse cx="34" cy="31" rx="6" ry="10.5" transform="rotate(-35 34 31)" fill="#ffffff" opacity="0.55"/>
</g>
</svg>`,
  'sparkle': `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
<defs>
<filter id="sparkle-sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.18"/></filter>
<radialGradient id="sparkle-g" cx="50%" cy="50%" r="55%">
<stop offset="0" stop-color="#ffffff"/>
<stop offset="0.55" stop-color="#f2c14e"/>
<stop offset="1" stop-color="#f0a04b"/>
</radialGradient>
<path id="sparkle-p" d="M44,10 Q48,42 80,46 Q48,50 44,82 Q40,50 8,46 Q40,42 44,10Z"/>
<path id="sparkle-p2" d="M76,12 Q77.5,22.5 88,24 Q77.5,25.5 76,36 Q74.5,25.5 64,24 Q74.5,22.5 76,12Z"/>
</defs>
<g filter="url(#sparkle-sh)" stroke-linecap="round" stroke-linejoin="round">
<use href="#sparkle-p" fill="#ffffff" stroke="#ffffff" stroke-width="12" style="paint-order:stroke"/>
<use href="#sparkle-p" fill="url(#sparkle-g)" stroke="#4a4540" stroke-width="1.5"/>
<use href="#sparkle-p2" fill="#ffffff" stroke="#ffffff" stroke-width="9" style="paint-order:stroke"/>
<use href="#sparkle-p2" fill="url(#sparkle-g)" stroke="#4a4540" stroke-width="1.3"/>
<circle cx="44" cy="46" r="5.5" fill="#ffffff" opacity="0.9"/>
</g>
</svg>`,
};
