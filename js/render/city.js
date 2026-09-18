// ═══════════════════════════════════════════════════════════════
//  CITY — parallax background skyline
//
//  Two baked layers:
//    • far  — small, low-contrast, blurred (depth of field) + parallax 0.42
//    • mid  — larger, more contrast, parallax 0.72
//
//  Each layer bakes its own downward fill so it always covers the band
//  beneath it, whatever the camera does. Rebuilt only when the viewport
//  width or the day/night state changes.
// ═══════════════════════════════════════════════════════════════

import { GROUND_Y_OFFSET } from '../constants.js';

const LAYER_H = 360;      // building band height
const FILL_BELOW = 460;   // solid fill below the base line (prevents gaps)

const FAR = {
  seed: 11, minW: 24, varW: 44, minH: 64, varH: 150, gap: 7, windows: true,
  shades: [
    ['#6f8398', '#0e1626'], ['#788ba0', '#111a2c'], ['#687c92', '#0c1422'],
  ],
  winDay: 'rgba(150,185,215,0.30)', winNight: 'rgba(255,208,140,0.35)',
  fillDay: '#9db3c6', fillNight: '#0a1220',
};
const MID = {
  seed: 29, minW: 34, varW: 58, minH: 96, varH: 230, gap: 9, windows: true,
  shades: [
    ['#4e6076', '#101a2b'], ['#586b82', '#131e31'], ['#475a70', '#0d1624'],
  ],
  winDay: 'rgba(140,180,214,0.42)', winNight: 'rgba(255,206,138,0.5)',
  fillDay: '#7e95aa', fillNight: '#070d18',
};

let farL = null, midL = null, builtW = 0, builtNight = -1, builtDayT = -1;

function rnd(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function makeLayer(width, night, o) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(width));
  c.height = LAYER_H + FILL_BELOW;
  const g = c.getContext('2d');
  const baseY = LAYER_H;

  const fill = g.createLinearGradient(0, baseY, 0, c.height);
  if (night) { fill.addColorStop(0, o.fillNight); fill.addColorStop(1, '#04070d'); }
  else { fill.addColorStop(0, o.fillDay); fill.addColorStop(1, '#a9bccb'); }
  g.fillStyle = fill;
  g.fillRect(0, baseY, c.width, c.height - baseY);

  const r = rnd(o.seed);
  let x = -50;
  while (x < c.width + 50) {
    const w = o.minW + r() * o.varW;
    const h = o.minH + r() * o.varH;
    drawBuilding(g, x, w, h, baseY, r, night, o);
    x += w + o.gap * (0.5 + r());
  }
  return c;
}

function drawBuilding(g, x, w, h, baseY, r, night, o) {
  const top = baseY - h;
  const shadeIdx = Math.floor(r() * o.shades.length);
  const shade = o.shades[shadeIdx];
  const body = night ? shade[1] : shade[0];

  // main mass
  g.fillStyle = body;
  g.beginPath();
  g.roundRect(x, top, w, h, 2);
  g.fill();

  // horizontal floor bands
  g.fillStyle = night ? 'rgba(120,150,190,0.10)' : 'rgba(255,255,255,0.10)';
  const bandStep = Math.max(9, Math.round(h / 11));
  for (let y = top + bandStep; y < baseY - 3; y += bandStep) g.fillRect(x + 1, y, w - 2, 1);

  // windows
  if (o.windows) {
    const cols = Math.max(2, Math.floor(w / 10));
    const rows = Math.max(3, Math.floor(h / 12));
    const gapX = (w - 10) / cols;
    const gapY = (h - 12) / rows;
    const ww = Math.max(2, gapX - 3);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const wx = x + 5 + i * gapX;
        const wy = top + 6 + j * gapY;
        if (night) {
          const q = r();
          g.fillStyle = q > 0.55 ? o.winNight : (q > 0.44 ? 'rgba(180,210,255,0.20)' : 'rgba(0,0,0,0.32)');
        } else {
          g.fillStyle = o.winDay;
        }
        g.fillRect(wx, wy, ww, 3.5);
      }
    }
  }

  // setback — a narrower shaft stepping back
  if (h > o.minH + o.varH * 0.35 && r() > 0.45) {
    const sw = w * (0.5 + r() * 0.22);
    const sh = h * (0.12 + r() * 0.16);
    const sx = x + (w - sw) / 2;
    const sy = top - sh;
    g.fillStyle = night ? shade[1] : shade[0];
    g.fillRect(sx, sy, sw, sh + 1);
    g.fillStyle = night ? 'rgba(120,150,190,0.10)' : 'rgba(255,255,255,0.10)';
    g.fillRect(sx + 1, sy + 3, sw - 2, 1);
    g.fillStyle = body;
    g.fillRect(sx, sy, sw, 1.4);
  }

  // crown: spire, aerial or roof box
  const crownRoll = r();
  const cx = x + w / 2;
  if (crownRoll > 0.72) {
    g.strokeStyle = night ? 'rgba(150,175,205,0.6)' : 'rgba(90,104,120,0.7)';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(cx, top);
    g.lineTo(cx, top - 16 - r() * 16);
    g.stroke();
    if (night) {
      g.fillStyle = 'rgba(255,90,80,0.85)';
      g.beginPath();
      g.arc(cx, top - 18, 1.4, 0, Math.PI * 2);
      g.fill();
    }
  } else if (crownRoll > 0.45) {
    g.fillStyle = night ? shade[1] : shade[0];
    g.fillRect(x + w * 0.3, top - 8, w * 0.4, 8);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(x + w * 0.3, top - 8, w * 0.4, 1);
  }

  // illuminated vertical signage (night)
  if (night && w > 30 && r() > 0.66) {
    const sx = x + (r() > 0.5 ? w - 6 : 3);
    const acc = ['rgba(255,96,96,0.75)', 'rgba(110,200,255,0.75)', 'rgba(255,196,110,0.75)', 'rgba(150,255,190,0.7)'][Math.floor(r() * 4)];
    g.fillStyle = acc;
    g.fillRect(sx, top + 8, 3, Math.min(h * 0.5, 50));
    const gl = g.createLinearGradient(sx, 0, sx + 14, 0);
    gl.addColorStop(0, acc.replace(/[\d.]+\)$/, '0.18)'));
    gl.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gl;
    g.fillRect(sx, top + 8, 14, Math.min(h * 0.5, 50));
  }
}

export function drawCity(ctx, state, canvasW, canvasH, nightAmt) {
  if (!canvasW) return;
  const night = nightAmt > 0.5 ? 1 : 0;
  const dayBucket = Math.round((state.dayTime || 0) * 8);
  if (builtW !== canvasW || builtNight !== night || builtDayT !== dayBucket) {
    farL = makeLayer(canvasW, night, FAR);
    midL = makeLayer(canvasW, night, MID);
    builtW = canvasW; builtNight = night; builtDayT = dayBucket;
  }

  const baseY = canvasH - GROUND_Y_OFFSET;
  const camY = state.cameraY || 0;

  // FAR — blurred for depth of field, faded for atmospheric perspective
  const hFar = baseY + camY * 0.42;
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.filter = 'blur(1.9px)';
  ctx.drawImage(farL, 0, hFar - LAYER_H, canvasW, farL.height);
  ctx.filter = 'none';
  ctx.restore();

  // MID
  const hMid = baseY + camY * 0.72;
  ctx.drawImage(midL, 0, hMid - LAYER_H, canvasW, midL.height);
}
