// 手帐贴纸 · 旅行美术（内联 SVG，自包含）—— 由 draw-journal-stickers 工作流成套绘制
// 每条 key 对应 manifest.ts 的贴纸 id；改画风只动这里，上层零改动。
export const TRAVEL_ART: Record<string, string> = {
  'boarding-pass': `<svg viewBox="0 0 72 100" xmlns="http://www.w3.org/2000/svg">
<defs><filter id="boarding-pass-sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.18"/></filter>
<clipPath id="boarding-pass-cl"><rect x="9" y="8" width="54" height="84" rx="6"/></clipPath></defs>
<g filter="url(#boarding-pass-sh)" stroke-linecap="round" stroke-linejoin="round">
<rect x="9" y="8" width="54" height="84" rx="6" fill="#ffffff" stroke="#ffffff" stroke-width="6" style="paint-order:stroke"/>
<g clip-path="url(#boarding-pass-cl)">
<rect x="9" y="8" width="54" height="20" fill="#6d8bab"/>
<circle cx="53" cy="16" r="6" fill="#ec8140"/>
<path d="M53 10.4q2.6 1 1.4 3.3" fill="none" stroke="#8fae6f" stroke-width="1.3"/>
<circle cx="53" cy="16" r="6" fill="none" stroke="#ffffff" stroke-width="1.3"/>
</g>
<text x="14" y="16" font-family="sans-serif" font-weight="700" font-size="4.6" fill="#ffffff">FLIGHT</text>
<text x="14" y="25" font-family="sans-serif" font-weight="700" font-size="4.6" fill="#ffffff">GATE 07</text>
<rect x="9" y="8" width="54" height="84" rx="6" fill="none" stroke="#4a4540" stroke-width="1.3"/>
<text x="36" y="43" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="8" fill="#4f6f91">SHANGHAI</text>
<path d="M36 47v8m0 0-2.4-4m2.4 4 2.4-4" fill="none" stroke="#ec8140" stroke-width="1.5"/>
<text x="36" y="66" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="8" fill="#4f6f91">JEJU</text>
<line x1="12" y1="72" x2="60" y2="72" stroke="#4a4540" stroke-width="0.9" stroke-dasharray="2 2"/>
<path d="M15 83h42" stroke="#4a4540" stroke-width="9" stroke-linecap="butt" stroke-dasharray="2 1.5 1 2 2.5 1 1.5 2 1 2.4 1.2 1.6"/>
</g>
</svg>`,
  'paperclip': `<svg viewBox="0 0 56 100" xmlns="http://www.w3.org/2000/svg">
<defs><filter id="paperclip-sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.18"/></filter></defs>
<g filter="url(#paperclip-sh)" transform="rotate(-9 28 52)" fill="none" stroke-linecap="round" stroke-linejoin="round">
<rect x="18" y="16" width="20" height="60" rx="10" stroke="#ffffff" stroke-width="14"/>
<rect x="23" y="26" width="10" height="60" rx="5" stroke="#ffffff" stroke-width="14"/>
<rect x="18" y="16" width="20" height="60" rx="10" stroke="#b8bcc0" stroke-width="4"/>
<rect x="23" y="26" width="10" height="60" rx="5" stroke="#b8bcc0" stroke-width="4"/>
<path d="M19 42 19 28" stroke="#ffffff" stroke-width="1.2"/>
<path d="M24 48 24 36" stroke="#ffffff" stroke-width="1.2"/>
</g>
</svg>`,
  'banner-ribbon': `<svg viewBox="0 0 200 72" xmlns="http://www.w3.org/2000/svg">
<defs><filter id="banner-ribbon-sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.18"/></filter></defs>
<g filter="url(#banner-ribbon-sh)" stroke-linecap="round" stroke-linejoin="round">
<path d="M30 50 43 50 34 62Z" fill="#e8695a"/>
<path d="M170 50 157 50 166 62Z" fill="#e8695a"/>
<path d="M30 20H170L186 13 174 36 186 59 170 52H30L14 59 26 36 14 13Z" fill="#ec8140" stroke="#ffffff" stroke-width="6" style="paint-order:stroke"/>
<path d="M30 20H170L186 13 174 36 186 59 170 52H30L14 59 26 36 14 13Z" fill="none" stroke="#4a4540" stroke-width="1.4"/>
<rect x="52" y="26" width="96" height="20" rx="3" fill="#f4ecd8" stroke="#4a4540" stroke-width="0.9"/>
<path d="M70 36q30-4 60 0" fill="none" stroke="#c8a97e" stroke-width="1.2" stroke-dasharray="1.5 3"/>
</g>
</svg>`,
  'stamp': `<svg viewBox="0 0 86 100" xmlns="http://www.w3.org/2000/svg">
<defs>
<filter id="stamp-sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.18"/></filter>
<clipPath id="stamp-pic"><rect x="16" y="22" width="54" height="56"/></clipPath>
</defs>
<g filter="url(#stamp-sh)" stroke-linecap="round" stroke-linejoin="round">
<rect x="10" y="9" width="66" height="82" fill="#ffffff"/>
<g stroke="#ffffff" stroke-width="7" fill="none">
<path d="M13 9H73" stroke-dasharray="0.01 7.49"/>
<path d="M13 91H73" stroke-dasharray="0.01 7.49"/>
<path d="M10 13V87" stroke-dasharray="0.01 7.4"/>
<path d="M76 13V87" stroke-dasharray="0.01 7.4"/>
</g>
<g clip-path="url(#stamp-pic)">
<rect x="16" y="22" width="54" height="56" fill="#8fd0bf"/>
<circle cx="28" cy="37" r="7" fill="#f0a04b"/>
<path d="M16 78V64L28 46L40 60L52 44L70 62V78Z" fill="#6d8bab"/>
<path d="M16 78V70L27 58L39 68L53 55L70 67V78Z" fill="#4f6f91"/>
</g>
<rect x="16" y="22" width="54" height="56" fill="none" stroke="#4a4540" stroke-width="1"/>
<text x="57" y="33" font-family="sans-serif" font-weight="700" font-size="7" fill="#4a4540">82</text>
<g fill="none" stroke="#4f6f91" stroke-width="1" opacity="0.65">
<path d="M60 22A14 14 0 0 0 72 10"/>
<path d="M63 23A17 17 0 0 0 74 11"/>
</g>
</g>
</svg>`,
  'passport-stamp': `<svg viewBox="0 0 100 92" xmlns="http://www.w3.org/2000/svg">
<defs><filter id="passport-stamp-sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.18"/></filter></defs>
<g filter="url(#passport-stamp-sh)" stroke-linecap="round" stroke-linejoin="round">
<circle cx="50" cy="46" r="40" fill="#ffffff"/>
<circle cx="50" cy="46" r="33" fill="none" stroke="#6d8bab" stroke-width="3" opacity="0.9"/>
<circle cx="50" cy="46" r="26.5" fill="none" stroke="#6d8bab" stroke-width="1.8" stroke-dasharray="9 2 5 3 11 2 7 3" opacity="0.8"/>
<path d="M29 25A30 30 0 0 1 71 25" fill="none" stroke="#6d8bab" stroke-width="2.6" stroke-dasharray="2 2.6" opacity="0.75"/>
<path d="M29 67A30 30 0 0 0 71 67" fill="none" stroke="#6d8bab" stroke-width="2.6" stroke-dasharray="2 2.6" opacity="0.75"/>
<path d="M50 28q2 0 2 5v2l11 4v3l-11-1v6l4 3v2l-6-1-6 1v-2l4-3v-6l-11 1v-3l11-4v-2q0-5 2-5z" fill="#4f6f91" opacity="0.88"/>
<line x1="35" y1="62" x2="65" y2="62" stroke="#6d8bab" stroke-width="1.6" opacity="0.9"/>
<text x="50" y="61" font-family="sans-serif" font-weight="700" font-size="6" fill="#4f6f91" text-anchor="middle" opacity="0.9">11 JUL 26</text>
</g>
</svg>`,
  'luggage-tag': `<svg viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg">
<defs><filter id="luggage-tag-sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.18"/></filter></defs>
<g filter="url(#luggage-tag-sh)" stroke-linecap="round" stroke-linejoin="round">
<g fill="none" stroke="#ffffff" stroke-width="6">
<path d="M40 14q-11 6-10 16 1 6 10 8 9-2 10-8 1-10-10-16z"/>
<path d="M40 14l-5-4M40 14l5-4"/>
</g>
<circle cx="40" cy="13" r="4.1" fill="#ffffff"/>
<rect x="12" y="26" width="56" height="64" rx="9" fill="#e7ddc7" stroke="#ffffff" stroke-width="6" style="paint-order:stroke"/>
<rect x="12" y="26" width="56" height="64" rx="9" fill="none" stroke="#4a4540" stroke-width="1.3"/>
<path d="M40 14q-11 6-10 16 1 6 10 8 9-2 10-8 1-10-10-16z" fill="none" stroke="#6d8bab" stroke-width="2.6"/>
<path d="M40 14l-5-4M40 14l5-4" fill="none" stroke="#6d8bab" stroke-width="2.6"/>
<circle cx="40" cy="13" r="2.4" fill="#6d8bab"/>
<circle cx="40" cy="39" r="4.2" fill="#9aa0a2"/>
<circle cx="40" cy="39" r="6" fill="none" stroke="#c8a97e" stroke-width="2.4"/>
<circle cx="40" cy="39" r="7.2" fill="none" stroke="#4a4540" stroke-width="1"/>
<path d="M20 58q20-2 40 0" fill="none" stroke="#4a4540" stroke-width="1.6"/>
<path d="M20 70q20-2 40 0" fill="none" stroke="#4a4540" stroke-width="1.6"/>
<path d="M20 82q13-1.5 26 0" fill="none" stroke="#4a4540" stroke-width="1.6"/>
</g>
</svg>`,
};
