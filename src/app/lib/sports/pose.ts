import catalog from '../../../../vendor/sports-coach/catalog.json';

export const SPORTS = catalog;
export type Sport = typeof SPORTS[number];
export type PosePoint = [number, number, number];
export type PoseFrame = PosePoint[];
export const COCO_FROM_MEDIAPIPE = [0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
export const COCO_EDGES = [[0, 1], [0, 2], [1, 3], [2, 4], [5, 6], [5, 7], [7, 9], [6, 8], [8, 10], [5, 11], [6, 12], [11, 12], [11, 13], [13, 15], [12, 14], [14, 16]];
export const sportForTarget = (target: string): Sport | undefined => SPORTS.find(sport => sport.target === target);

export interface SportsAssessment {
  protocol: 'pocket-sports-pose/v1';
  sport: string;
  cls_id: number;
  cls_name: string;
  valid: boolean;
  score: number | null;
  mode: 'selected-action-rules';
  trained_classifier: false;
  invalid_reason: string;
  correction: string;
  full_text: string;
  affected_joints: number[];
  errors: { code: string; name: string; severity: string }[];
  n_hops?: number;
  tempo_spm?: number;
}

export function toCoco17(landmarks: { x: number; y: number; visibility?: number }[]): PoseFrame | null {
  if (landmarks.length !== 33) return null;
  return COCO_FROM_MEDIAPIPE.map(index => {
    const point = landmarks[index];
    return [point.x, point.y, point.visibility ?? 0];
  });
}

export function fullBodyVisible(frame: PoseFrame): boolean {
  return frame.length === 17 && frame.every(point => point.length === 3 && point.every(Number.isFinite))
    && [frame[0], ...frame.slice(5)].every(([x, y, visibility]) => visibility >= .55 && visibility <= 1 && x >= 0 && x <= 1 && y >= 0 && y <= 1);
}

// A window cannot bridge a missing person, a tab pause or a change of action.
export class PoseWindow {
  frames: PoseFrame[] = [];
  timestamps: number[] = [];
  reset() { this.frames = []; this.timestamps = []; }
  add(frame: PoseFrame | null, at: number): boolean {
    if (!frame || !fullBodyVisible(frame) || !Number.isFinite(at)) { this.reset(); return false; }
    const previous = this.timestamps[this.timestamps.length - 1];
    if (previous !== undefined && (at <= previous || at - previous > 250)) this.reset();
    this.frames.push(frame); this.timestamps.push(at);
    if (this.frames.length > 60) { this.frames.shift(); this.timestamps.shift(); }
    return this.frames.length >= 30;
  }
  payload(sport: string, action: number, width: number, height: number) {
    return { sport, action, width, height, frames: [...this.frames], timestamps: [...this.timestamps] };
  }
}

export function drawSkeleton(canvas: HTMLCanvasElement, frame: PoseFrame, affected: number[] = []) {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const bad = new Set(affected);
  const visible = (id: number) => frame[id]?.[2] >= .55;
  context.lineWidth = Math.max(2, canvas.width / 250);
  for (const [a, b] of COCO_EDGES) {
    if (!visible(a) || !visible(b)) continue;
    context.strokeStyle = bad.has(a) || bad.has(b) ? '#ff715b' : '#7cff6b';
    context.beginPath(); context.moveTo(frame[a][0] * canvas.width, frame[a][1] * canvas.height);
    context.lineTo(frame[b][0] * canvas.width, frame[b][1] * canvas.height); context.stroke();
  }
  frame.forEach(([x, y], id) => {
    if (!visible(id)) return;
    context.fillStyle = bad.has(id) ? '#ff715b' : '#ffffff';
    context.beginPath(); context.arc(x * canvas.width, y * canvas.height, Math.max(3, canvas.width / 180), 0, 2 * Math.PI); context.fill();
  });
}

/** Prefer the explicitly named action from Frost's request; camera permission stays in the page. */
export function actionForRequest(sport: Sport, request: string): number {
  const text = request.toLowerCase();
  return sport.actions.find(action => [action.sourceName, action.name.toLowerCase()].some(name =>
    /[\u3400-\u9fff]/.test(name) ? text.includes(name)
      : ` ${text.split(/[^a-z]+/).join(' ')} `.includes(` ${name.replace(/[^a-z]+/g, ' ')} `),
  ))?.id ?? sport.actions[0].id;
}
