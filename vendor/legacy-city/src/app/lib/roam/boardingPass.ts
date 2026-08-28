// 登机牌票根（参考截图二三的「SHANGHAI → JEJU-DO」登机牌）：奶白票身 / 顶部色带 /
// 左联出发到达大字码 + 航班/登机口/座位/日期 / 中缝撕齿 / 右联竖排目的地。
// 复用 ticketStub 的纯逻辑（票面日期 / 罗马音 / 取色）；全确定性、无需载图（不碰跨域）。
import { romanizePlace, toTicketDate } from './ticketStub';

export interface BoardingPassInput {
  fromCn: string;            // 出发中文
  toCn: string;              // 到达中文
  fromEn?: string;           // 出发英文（缺省罗马音猜；再空用中文）
  toEn?: string;
  date?: string | Date;
  flight?: string;           // 缺省由目的地+日期确定性生成
  gate?: string;
  seat?: string;
  theme?: string;            // 色带主题色（默认航空蓝）
}

const CREAM = '#f6f1e6';
const SERIF = '"Times New Roman","Songti SC",Georgia,serif';
const HEI = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';

function fnv(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const SEATS = 'ABCDFK';

/** 纯逻辑：由 seed 确定性生成航班/登机口/座位（缺省时用，同 seed 同值不跳）。 */
export function seededFlight(seed: string): { flight: string; gate: string; seat: string } {
  const h = fnv(seed);
  return {
    flight: 'CTC' + (1000 + (h % 9000)),
    gate: String(1 + ((h >>> 3) % 45)),
    seat: (1 + ((h >>> 9) % 46)) + SEATS[(h >>> 15) % SEATS.length],
  };
}
/** 纯逻辑：中文地名 → 英文码（罗马音大写；缺省取中文首字）。 */
export function airportName(cn: string, en?: string): string {
  const clean = cn.replace(/^.*·\s*/, '').trim();
  return (en || romanizePlace(clean) || clean).toUpperCase();
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Canvas 画一张登机牌 → PNG dataURL（确定性、纯画，不载外图）。 */
export async function drawBoardingPass(input: BoardingPassInput): Promise<string> {
  const W = 1280, H = 560;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const theme = input.theme ?? '#2b6cb0';
  const dateStr = toTicketDate(input.date);
  const info = seededFlight(input.toCn + '|' + dateStr);
  const flight = input.flight ?? info.flight;
  const gate = input.gate ?? info.gate;
  const seat = input.seat ?? info.seat;

  // 背景（同色调纸）
  ctx.fillStyle = '#efe9dc'; ctx.fillRect(0, 0, W, H);

  // 票身
  const M = 56, body = { x: M, y: 70, w: W - M * 2, h: H - 140 };
  const splitX = body.x + body.w * 0.72;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 10;
  roundRectPath(ctx, body.x, body.y, body.w, body.h, 22);
  ctx.fillStyle = CREAM; ctx.fill();
  ctx.restore();

  // 顶部色带 + BOARDING PASS
  ctx.save();
  roundRectPath(ctx, body.x, body.y, body.w, 70, 22); ctx.clip();
  ctx.fillStyle = theme; ctx.fillRect(body.x, body.y, body.w, 70);
  ctx.restore();
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
  ctx.font = `bold 26px ${SERIF}`; ctx.textAlign = 'left';
  ctx.fillText('BOARDING PASS', body.x + 28, body.y + 36);
  ctx.font = `500 20px ${SERIF}`; ctx.textAlign = 'right';
  ctx.fillText('登 机 牌', splitX - 28, body.y + 36);

  // 左联：出发 → 到达 大字
  const cy1 = body.y + 150;
  ctx.fillStyle = theme; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.font = `bold 62px ${SERIF}`;
  ctx.fillText(airportName(input.fromCn, input.fromEn), body.x + 28, cy1);
  ctx.font = `600 26px ${HEI}`; ctx.fillStyle = '#7a6a52';
  ctx.fillText(input.fromCn.replace(/^.*·\s*/, '').trim(), body.x + 28, cy1 + 34);
  // 箭头 ✈
  const midX = (body.x + 28 + splitX) / 2;
  ctx.fillStyle = theme; ctx.font = `40px ${SERIF}`; ctx.textAlign = 'center';
  ctx.fillText('✈', midX, cy1 - 6);
  // 到达（右对齐到中缝前）
  ctx.textAlign = 'right';
  ctx.font = `bold 62px ${SERIF}`;
  ctx.fillText(airportName(input.toCn, input.toEn), splitX - 30, cy1);
  ctx.font = `600 26px ${HEI}`; ctx.fillStyle = '#7a6a52';
  ctx.fillText(input.toCn.replace(/^.*·\s*/, '').trim(), splitX - 30, cy1 + 34);

  // 左联信息行：FLIGHT / DATE / GATE / SEAT
  const labelY = body.y + 236, valY = labelY + 34;
  const cols = [
    { k: 'FLIGHT', v: flight }, { k: 'DATE', v: dateStr }, { k: 'GATE', v: gate }, { k: 'SEAT', v: seat },
  ];
  const colW = (splitX - 30 - (body.x + 28)) / cols.length;
  ctx.textAlign = 'left';
  cols.forEach((c, i) => {
    const x = body.x + 28 + i * colW;
    ctx.fillStyle = '#a89a80'; ctx.font = `500 15px ${SERIF}`; ctx.fillText(c.k, x, labelY);
    ctx.fillStyle = '#33301f'; ctx.font = `600 30px ${SERIF}`; ctx.fillText(String(c.v), x, valY);
  });
  // 中缝撕齿 + 上下圆缺口
  ctx.save();
  ctx.strokeStyle = 'rgba(120,110,90,0.55)'; ctx.lineWidth = 2; ctx.setLineDash([3, 8]);
  ctx.beginPath(); ctx.moveTo(splitX, body.y + 14); ctx.lineTo(splitX, body.y + body.h - 14); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#efe9dc';
  for (const cy of [body.y, body.y + body.h]) { ctx.beginPath(); ctx.arc(splitX, cy, 16, 0, Math.PI * 2); ctx.fill(); }

  // 右联：竖排目的地大字 + 日期（原竖条码已去）
  const rx = splitX + (body.x + body.w - splitX) / 2;
  ctx.fillStyle = theme; ctx.textAlign = 'center';
  ctx.font = `bold 30px ${SERIF}`;
  const toName = airportName(input.toCn, input.toEn);
  ctx.fillText(toName.length > 8 ? toName.slice(0, 8) : toName, rx, body.y + 118);
  ctx.font = `600 34px ${HEI}`; ctx.fillStyle = '#33301f';
  const toCnClean = input.toCn.replace(/^.*·\s*/, '').trim();
  ctx.fillText(toCnClean, rx, body.y + 162);
  ctx.font = `500 22px ${SERIF}`; ctx.fillStyle = '#7a6a52';
  ctx.fillText(dateStr, rx, body.y + 200);
  // 目的地大字下方主题色细横线收尾（原竖条码位置）
  ctx.fillStyle = theme;
  ctx.fillRect(rx - 70, body.y + 232, 140, 4);

  return cv.toDataURL('image/png');
}
