import { Sparkles } from 'lucide-react'

function AgentPaths({ type }) {
  if (type === 'camera') return <>
    <path d="M12 22h40v25H12z" /><path d="M19 22l4-7h13l4 7" />
    <circle cx="32" cy="34.5" r="10" /><circle cx="32" cy="34.5" r="4.5" /><circle cx="46" cy="27" r="1.4" className="fill-line" />
    <path d="M20 47v7m24-7v7M9 29l-5 3m51-3 5 3" />
  </>
  if (type === 'book') return <>
    <path d="M14 15q18-5 18 5v34q0-9-18-5z" /><path d="M50 15q-18-5-18 5v34q0-9 18-5z" />
    <path d="M20 25h7m-7 6h8m9-6h7m-7 6h8M20 49v7m24-7v7" />
    <circle cx="27" cy="39" r="1.2" className="fill-line" /><circle cx="37" cy="39" r="1.2" className="fill-line" />
  </>
  if (type === 'plush') return <>
    <path d="M18 24q-8-8 1-12l5 5q8-5 16 0l5-5q9 4 1 12 4 6 1 13-2 5-7 5l4 9q-4 6-12 1-8 5-12-1l4-9q-5 0-7-5-3-7 1-13z" />
    <circle cx="27" cy="28" r="1.4" className="fill-line" /><circle cx="37" cy="28" r="1.4" className="fill-line" /><path d="M30 33q2 2 4 0M24 42l-8 4m24-4 8 4" />
  </>
  if (type === 'lamp') return <>
    <path d="M20 12h24l7 18H13z" /><path d="M32 30v18m-10 7q10-8 20 0zM19 21h26" />
    <circle cx="28" cy="24" r="1.2" className="fill-line" /><circle cx="36" cy="24" r="1.2" className="fill-line" /><path d="M25 48l-5 5m19-5 5 5" />
  </>
  if (type === 'headphones') return <>
    <path d="M14 34V26q0-16 18-16t18 16v8" /><rect x="9" y="29" width="12" height="20" rx="5" /><rect x="43" y="29" width="12" height="20" rx="5" />
    <circle cx="16" cy="38" r="1.3" className="fill-line" /><circle cx="48" cy="38" r="1.3" className="fill-line" /><path d="M16 49v7m32-7v7M21 35l6-2m16 2-6-2" />
  </>
  if (type === 'mic') return <>
    <rect x="23" y="10" width="18" height="28" rx="9" /><path d="M27 17h10m-11 6h12m-11 6h10M32 38v15m-9 3h18" />
    <circle cx="29" cy="32" r="1.2" className="fill-line" /><circle cx="35" cy="32" r="1.2" className="fill-line" />
  </>
  if (type === 'rocket') return <>
    <path d="M32 7q14 14 10 34l-10 9-10-9Q18 21 32 7z" /><circle cx="32" cy="27" r="6" /><path d="M22 37l-8 9 9 1m19-10 8 9-9 1M27 49l-2 8m12-8 2 8" />
    <circle cx="30" cy="27" r="1" className="fill-line" /><circle cx="34" cy="27" r="1" className="fill-line" />
  </>
  if (type === 'bot') return <>
    <rect x="13" y="16" width="38" height="31" rx="7" /><path d="M32 16V9m-5 0h10M18 47l-4 8m32-8 4 8M13 27H6m45 0h7" />
    <circle cx="25" cy="30" r="3" /><circle cx="39" cy="30" r="3" /><path d="M25 40q7 4 14 0" />
  </>
  return <>
    <path d="M16 15h31v31q0 8-15 8T16 46z" /><path d="M47 22h4q8 0 8 8t-8 8h-4" />
    <circle cx="27" cy="31" r="1.5" className="fill-line" /><circle cx="37" cy="31" r="1.5" className="fill-line" /><path d="M29 37q3 2 6 0M23 52l-4 5m22-5 4 5M16 31l-7 5" />
  </>
}

export function ObjectAgent({ type = 'mug', accent = 'var(--accent)', className = '', label, selected = false }) {
  return (
    <span className={`object-agent ${className} ${selected ? 'is-selected' : ''}`} aria-hidden={!label}>
      <svg viewBox="0 0 64 64" role={label ? 'img' : undefined} aria-label={label}>
        <g className="agent-ink"><AgentPaths type={type} /></g>
        <path className="agent-accent" style={{ stroke: accent }} d="M21 12q11-5 22 1" />
      </svg>
      {selected && <i className="selection-spark"><Sparkles size={11} /></i>}
    </span>
  )
}

function BuildingPaths({ type, accent }) {
  const top = <path className="building-top" style={{ fill: `${accent}22` }} d="M12 31 55 8l52 23-48 26z" />
  if (type === 'library') return <>{top}<path d="M12 31v43l47 23V57zm95 0v43L59 97V57" /><path d="M23 43v28m12-22v29m13-23v30m22-25v24m15-31v24m13-31v25" /><path className="accent-line" style={{ stroke: accent }} d="M17 36 59 58l43-23" /></>
  if (type === 'station') return <>{top}<path d="M17 33v34l42 21 43-22V33M25 54h68M35 28v30m48-33v35" /><path className="accent-line" style={{ stroke: accent }} d="m21 72 38 19 39-20" /></>
  if (type === 'stage') return <>{top}<path d="M12 31v41l47 23V57zm95 0v41L59 95V57" /><path d="M32 42q27-25 54 0v36H32zM47 52h24v25H47" /><path className="accent-fill" style={{ fill: accent }} d="m49 63 10-6 10 6-10 6z" /></>
  if (type === 'tower') return <>{top}<path d="M29 23v62l30 14V57zM91 23v63L59 99V57" /><path d="M38 34v45m12-39v44m20-42v42m11-48v43M29 49l30 14 32-15M29 67l30 14 32-15" /><path className="accent-line" style={{ stroke: accent }} d="M59 57v42" /></>
  if (type === 'lab') return <>{top}<path d="M18 32v39l41 21 42-21V32" /><path d="M33 57q0-31 26-31t27 31v26M42 54h34m-17-28V8" /><circle cx="59" cy="8" r="4" className="accent-fill" style={{ fill: accent }} /></>
  if (type === 'energy') return <>{top}<path d="M30 28v52l29 15 30-16V28M41 40h36M39 54h40M37 68h44" /><path className="accent-line" style={{ stroke: accent }} d="m59 18-8 22 11-3-7 22 17-28-11 3 6-16" /></>
  if (type === 'pod') return <>{top}<path d="M18 32v40l41 21 42-21V32" /><path d="M28 56q31-33 62 0v23L59 94 28 79zM43 57h32v23H43z" /><path className="accent-line" style={{ stroke: accent }} d="M28 56h62" /></>
  return <>{top}<path d="M12 31v43l47 23V57zm95 0v43L59 97V57" /><path d="M26 46v30l19 9V56zm49 7v31l19-9V44" /><path className="accent-line" style={{ stroke: accent }} d="M19 38 59 59l41-22M28 48l17 9 30-15 17 7" /></>
}

export function IsometricBuilding({ type = 'cafe', accent = 'var(--accent)', className = '', label }) {
  return <span className={`iso-building ${className}`}>
    <svg viewBox="0 0 120 105" role={label ? 'img' : undefined} aria-label={label}><g className="building-ink"><BuildingPaths type={type} accent={accent} /></g></svg>
  </span>
}

export function TinyPlant({ accent = 'var(--accent-2)', className = '' }) {
  return <span className={`tiny-plant ${className}`}><svg viewBox="0 0 36 48"><g><path d="M18 45V21M18 29 9 24m9 12 10-7" /><path style={{ fill: `${accent}55` }} d="M4 17q5-12 14 0Q13 27 4 17zm14-5q7-12 14 2-7 9-14-2z" /></g></svg></span>
}

export function DoodleTree({ accent = 'var(--accent)', className = '' }) {
  return <span className={`doodle-tree ${className}`}>
    <svg viewBox="0 0 76 105" aria-hidden="true">
      <g>
        <path className="tree-trunk" d="M36 96c4-18 2-31 5-47m-5 28-10-15m14 2 13-18" />
        <path className="tree-shadow" style={{ fill: `${accent}1f` }} d="M19 95q19-8 39 0-21 9-39 0z" />
        <path className="tree-crown" style={{ fill: `${accent}38` }} d="M23 54q-16 1-15-12t14-12Q15 17 29 14q8-13 18-1 16-3 15 12 12 6 3 17 5 13-11 14-8 11-17 1-9 7-14-3z" />
        <path className="tree-detail" d="M15 41q11-5 22 4m2-28q4 8 1 17m20-7q-9 3-13 12M26 56q9-8 20-5" />
      </g>
    </svg>
  </span>
}
