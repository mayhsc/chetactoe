import { makeImage } from './png.mjs';

const path = process.argv[2];
const tol = Number(process.argv[3] ?? 26);
const { w: W, h: H, rgb, lum } = makeImage(path);

const bg = rgb(2, 2);
// The backdrop and its shadow are near-neutral while the wood is strongly warm,
// so red-minus-blue separates them far more reliably than a distance-to-bg
// threshold (the reference backdrop has a gradient across it).
const chroma = (x, y) => { const [r, , b] = rgb(x, y); return r - b; };
const bgChroma = chroma(2, 2);
const isBoard = (x, y) => chroma(x, y) - bgChroma > tol;

const rows = [];
for (let y = 0; y < H; y++) {
  let min = -1, max = -1;
  for (let x = 0; x < W; x++) if (isBoard(x, y)) { if (min < 0) min = x; max = x; }
  rows.push(min < 0 ? null : { y, min, max, w: max - min + 1 });
}
const present = rows.filter(Boolean);
if (!present.length) { console.log('no board found; bg', bg); process.exit(0); }
const top = present[0], bottom = present.at(-1);
const widest = present.reduce((a, b) => (b.w > a.w ? b : a));

console.log(`file            ${path}`);
console.log(`image           ${W} x ${H}   bg rgb(${bg})`);
console.log(`far edge        y=${top.y}  w=${top.w}   (x ${top.min}..${top.max})`);
console.log(`widest          y=${widest.y}  w=${widest.w}  (x ${widest.min}..${widest.max})`);
console.log(`bottom          y=${bottom.y}  w=${bottom.w}  (x ${bottom.min}..${bottom.max})`);
console.log(`height          ${bottom.y - top.y + 1}`);
console.log(`perspective     widest/far = ${(widest.w / top.w).toFixed(4)}`);
console.log(`aspect          h/w = ${((bottom.y - top.y + 1) / widest.w).toFixed(4)}`);
console.log(`centre x        ${((widest.min + widest.max) / 2).toFixed(1)} (image ${(W / 2).toFixed(1)})`);

// tone samples: mean rgb of small patches
function patch(cx, cy, r = 9) {
  let s = [0, 0, 0], n = 0;
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    const [a, b, c] = rgb(x, y); s[0] += a; s[1] += b; s[2] += c; n++;
  }
  return s.map((v) => Math.round(v / n));
}
const midY = Math.round(top.y + (bottom.y - top.y) * 0.5);
const row = rows[midY];
console.log(`tone far-centre  ${patch(Math.round((top.min + top.max) / 2), top.y + 45)}`);
console.log(`tone mid-left    ${patch(row.min + 70, midY)}`);
console.log(`tone mid-centre  ${patch(Math.round((row.min + row.max) / 2), midY)}`);
console.log(`tone mid-right   ${patch(row.max - 70, midY)}`);
console.log(`tone front face  ${patch(Math.round(W / 2), bottom.y - 30, 8)}`);

// groove x positions on a mid scanline
const vals = [];
for (let x = row.min; x <= row.max; x++) vals.push(lum(x, midY));
const sm = vals.map((_, i) => {
  let s = 0, n = 0;
  for (let k = -2; k <= 2; k++) if (vals[i + k] !== undefined) { s += vals[i + k]; n++; }
  return s / n;
});
const hits = [];
for (let i = 5; i < sm.length - 5; i++) {
  if (sm[i] < sm[i - 5] - 1.5 && sm[i] < sm[i + 5] - 1.5 && sm[i] <= Math.min(sm[i - 1], sm[i + 1])) {
    if (!hits.length || i - hits.at(-1) > 14) hits.push(i);
  }
}
console.log(`grooves y=${midY}   ${hits.map((i) => i + row.min).join(', ')}`);
console.log(`groove depth px  min ${Math.round(Math.min(...sm))} / field ${Math.round(sm.reduce((a, b) => a + b) / sm.length)}`);

// front-face height down the centre column: distance from the last top-face row
// to the bottom, i.e. how tall the 19 mm edge reads
const cx = Math.round(W / 2);
let firstBoard = -1;
for (let y = 0; y < H; y++) if (isBoard(cx, y)) { firstBoard = y; break; }
let lastBoard = -1;
for (let y = H - 1; y >= 0; y--) if (isBoard(cx, y)) { lastBoard = y; break; }
console.log(`centre col       board y ${firstBoard}..${lastBoard}  (span ${lastBoard - firstBoard + 1})`);
