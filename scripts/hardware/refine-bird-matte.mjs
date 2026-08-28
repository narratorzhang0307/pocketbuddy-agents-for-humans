// Retain original RGB and optionally repair one visually reviewed white feather region.
// Do not fill every hole: a gap between overlapping feet can be real background.
import sharp from 'sharp';

const [originalPath, maskPath, outputPath, regionArg] = process.argv.slice(2);
if (!outputPath) throw Error('Usage: node scripts/hardware/refine-bird-matte.mjs original.png mask.png output.png [x,y,width,height]');
const { data: original, info } = await sharp(originalPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { data: mask, info: maskInfo } = await sharp(maskPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (info.width !== maskInfo.width || info.height !== maskInfo.height) throw Error('Mask size mismatch');
const w = info.width, h = info.height, n = w * h;
const region = regionArg?.split(',').map(Number);
if (region && (region.length !== 4 || region.some(v => !Number.isInteger(v)) || region[0] < 0 || region[1] < 0
  || region[2] <= 0 || region[3] <= 0 || region[0] + region[2] > w || region[1] + region[3] > h)) throw Error('Invalid repair region');
const outside = new Uint8Array(n), queue = new Int32Array(n);
let head = 0, tail = 0;
function visit(p) {
  if (p < 0 || p >= n || outside[p] || mask[p * 4 + 3] >= 250) return;
  outside[p] = 1; queue[tail++] = p;
}
for (let x = 0; x < w; x++) { visit(x); visit((h - 1) * w + x); }
for (let y = 0; y < h; y++) { visit(y * w); visit(y * w + w - 1); }
while (head < tail) {
  const p = queue[head++], x = p % w;
  if (x) visit(p - 1);
  if (x < w - 1) visit(p + 1);
  visit(p - w); visit(p + w);
}
let repaired = 0;
for (let p = 0; p < n; p++) {
  let a = mask[p * 4 + 3];
  const x = p % w, y = Math.floor(p / w);
  if (region && x >= region[0] && x < region[0] + region[2] && y >= region[1] && y < region[1] + region[3]
    && !outside[p] && a < 250) { a = 255; repaired++; }
  original[p * 4 + 3] = a;
  if (!a) original.fill(0, p * 4, p * 4 + 3);
}
await sharp(original, { raw: info }).png().toFile(outputPath);
console.log(JSON.stringify({ repairedInteriorPixels: repaired }));
