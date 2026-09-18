// ═══════════════════════════════════════════════════════════════
//  FACADE — modern curtain-wall cell sprites (pre-baked + cached)
//
//  Every floor cell is composed from the same architectural system:
//    • a concrete floor slab band
//    • graphite corner columns + mullions
//    • glazing with sky reflection / warm night interior
//    • a type-specific interior behind the glass
//    • accent LED strip + signage
//
//  Sprites are baked once per (type, variant, day/night, pixel size) and
//  blitted thereafter, so rich detail costs nothing per frame.
// ═══════════════════════════════════════════════════════════════

import { CELL_W, CELL_H, mulberry32 } from '../constants.js';

// palette entries are [day, night]
const P = {
  frame:      ['#3a4658', '#1a2130'],
  frameHi:    ['#788da4', '#33414f'],
  slabTop:    ['#f4f7fb', '#46536a'],
  slabFace:   ['#cdd6e2', '#2c3747'],
  slabEdge:   ['#97a3b3', '#1c2430'],
  glassTop:   ['#d8ecfa', '#1e2b3d'],
  glassBot:   ['#93aac2', '#0e1723'],
  interior:   ['#232c3a', '#0a0f18'],
  concrete:   ['#8d949d', '#2e343d'],
  concreteHi: ['#aab1ba', '#3c434e'],
};

const ACCENT = {
  office: '#6aa9ff', residence: '#ffb877', hotel: '#ffd27a', shop: '#ff8fb1',
  restaurant: '#ff8a5c', cinema: '#a78bfa', park: '#6ee7a0', spa: '#5eead4',
  lobby: '#ffd27a', skyLobby: '#ffd27a', parking: '#9aa6b5', service: '#b8bec6',
  basementLobby: '#9aa6b5', subway: '#7dd3fc', elevator: '#8fa3bd',
};

const KIND = {
  office: 'glass', residence: 'glass', hotel: 'glass', spa: 'glass',
  skyLobby: 'glass', lobby: 'glass',
  shop: 'storefront', restaurant: 'storefront',
  cinema: 'marquee', park: 'open', parking: 'deck', service: 'louver',
  basementLobby: 'concrete', subway: 'concrete', elevator: 'shaft',
};

// ── colour helpers ─────────────────────────────────────────────

function rgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function rgba(hex, a) {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  const r = Math.round(A[0] + (B[0] - A[0]) * t);
  const g = Math.round(A[1] + (B[1] - A[1]) * t);
  const bl = Math.round(A[2] + (B[2] - A[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

// ── cache ──────────────────────────────────────────────────────

const cache = new Map();
let hits = 0, misses = 0;

export function variantFor(row, col) {
  const h = (row * 73856093) ^ (col * 19349663);
  return ((h >>> 0) % 4);
}

export function sprite(type, variant, night, w, h) {
  const key = `${type}|${variant}|${night}|${Math.round(w)}x${Math.round(h)}`;
  let s = cache.get(key);
  if (s) { hits++; return s; }
  misses++;
  s = buildCell(type, variant, night, w, h);
  if (cache.size > 700) cache.clear();
  cache.set(key, s);
  return s;
}

export function spriteStats() {
  const total = hits + misses;
  return { hits, misses, size: cache.size, hitRate: total ? hits / total : 1 };
}

// Draw one cell (crossfading day → night).
export function blitCell(ctx, type, row, col, x, y, w, h, nightAmt) {
  const variant = variantFor(row, col);
  if (nightAmt < 0.02) {
    ctx.drawImage(sprite(type, variant, 0, w, h), x, y);
  } else if (nightAmt > 0.98) {
    ctx.drawImage(sprite(type, variant, 1, w, h), x, y);
  } else {
    ctx.drawImage(sprite(type, variant, 0, w, h), x, y);
    ctx.globalAlpha = nightAmt;
    ctx.drawImage(sprite(type, variant, 1, w, h), x, y);
    ctx.globalAlpha = 1;
  }
}

// ═══════════════════════════════════════════════════════════════
//  BAKE
// ═══════════════════════════════════════════════════════════════

function buildCell(type, variant, night, w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(w));
  c.height = Math.max(2, Math.round(h));
  const g = c.getContext('2d');
  const s = c.width / CELL_W;
  const kind = KIND[type] || 'glass';
  const accent = ACCENT[type] || '#8fa3bd';
  const rng = mulberry32(variant * 7919 + type.charCodeAt(0) * 131 + night * 101);
  const col = k => P[k][night];

  g.fillStyle = col('interior');
  g.fillRect(0, 0, c.width, c.height);

  const slabH = Math.max(2, 4 * s);
  const cornerW = Math.max(1, 2 * s);

  drawInterior(g, type, kind, c.width, c.height, s, slabH, night, accent, rng);
  if (kind === 'glass' || kind === 'storefront') {
    drawBlinds(g, kind, type, c.width, c.height, s, slabH, night,
      mulberry32(variant * 104729 + type.charCodeAt(1) * 61 + night * 7));
  }
  drawGlazing(g, kind, c.width, c.height, s, slabH, night);
  drawStructure(g, c.width, c.height, s, slabH, cornerW, col, kind);
  drawAccents(g, type, kind, c.width, c.height, s, slabH, night, accent, rng);
  return c;
}

function bayCount(kind) {
  return kind === 'storefront' ? 2 : 4;
}

// ── venetian blinds, per pane (adds the texture real facades have) ──

function drawBlinds(g, kind, type, w, h, s, slabH, night, rng) {
  const gy = slabH;
  const ghs = h - slabH;
  const bays = bayCount(kind);
  for (let b = 0; b < bays; b++) {
    // how far down the blinds are drawn: 0 (none) .. 1 (full)
    let closed = rng();
    if (type === 'hotel') closed = 0.55 + rng() * 0.45;
    else if (type === 'office') closed = rng() < 0.45 ? 0.5 + rng() * 0.5 : rng() * 0.3;
    else closed = rng() < 0.3 ? rng() * 0.5 : rng() * 0.25;
    if (closed < 0.08) continue;

    const x0 = (w * b) / bays + 1;
    const x1 = (w * (b + 1)) / bays - 1;
    const yMax = gy + ghs * closed;
    const step = Math.max(1.5, 2.2 * s);
    g.strokeStyle = night ? 'rgba(150,162,180,0.20)' : 'rgba(236,241,247,0.42)';
    g.lineWidth = Math.max(0.5, 0.7 * s);
    g.beginPath();
    for (let y = gy + step; y < yMax; y += step) {
      g.moveTo(x0, y);
      g.lineTo(x1, y);
    }
    g.stroke();
    // solid slat pack where fully drawn
    g.fillStyle = night ? 'rgba(120,132,150,0.10)' : 'rgba(255,255,255,0.10)';
    g.fillRect(x0, gy, x1 - x0, yMax - gy);
  }
}

// ── the room behind the glass ──────────────────────────────────

function drawInterior(g, type, kind, w, h, s, slabH, night, accent, rng) {
  const y0 = slabH;
  const gh = h - slabH;

  switch (kind) {
    case 'glass': {
      drawRoomShell(g, w, h, s, slabH, night, accent);
      const y0 = slabH, gh = h - slabH;
      // Dynamic night interior: more lit when more tenants active,
      // with type-specific warmth/coolness
      const nightFill = night ? rgba(accent, 0.30) : rgba(accent, 0.08);
      g.fillStyle = nightFill;
      g.fillRect(0, y0, w, gh * 0.6);

      if (type === 'office') drawOffice(g, w, h, s, y0, gh, night, accent, rng);
      else if (type === 'residence') drawResidence(g, w, h, s, y0, gh, night, accent, rng);
      else if (type === 'hotel') drawHotel(g, w, h, s, y0, gh, night, accent, rng);
      else if (type === 'spa') drawSpa(g, w, h, s, y0, gh, night, accent, rng);
      else if (type === 'skyLobby') drawSkyLobby(g, w, h, s, y0, gh, night, accent, rng);
      else drawLobby(g, w, h, s, y0, gh, night, accent, rng);
      break;
    }
    case 'storefront': {
      drawRoomShell(g, w, h, s, slabH, night, accent);
      const y0 = slabH, gh = h - slabH;
      if (type === 'restaurant') drawRestaurant(g, w, h, s, y0, gh, night, accent, rng);
      else drawShop(g, w, h, s, y0, gh, night, accent, rng);
      break;
    }
    case 'marquee':
      drawCinema(g, w, h, s, y0, gh, night, accent, rng);
      break;
    case 'open':
      drawPark(g, w, h, s, y0, gh, night, accent, rng);
      break;
    case 'deck':
      drawParkingDeck(g, w, h, s, y0, gh, night, rng);
      break;
    case 'louver':
      drawService(g, w, h, s, y0, gh, night, accent, rng);
      break;
    case 'concrete':
      if (type === 'subway') drawSubway(g, w, h, s, y0, gh, night, accent, rng);
      else drawBasementLobby(g, w, h, s, y0, gh, night, accent, rng);
      break;
    default:
      g.fillStyle = col('interior');
      g.fillRect(0, y0, w, gh);
  }
}

// —— individual rooms ————————————————————————————————

function warmPool(g, x, y, r, hex, a) {
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, rgba(hex, a));
  grd.addColorStop(1, rgba(hex, 0));
  g.fillStyle = grd;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

// Dollhouse cross-section: an inset back wall, a lit floor plane, and
// ambient occlusion in the corners. Reads as a room, not a coloured box.
function drawRoomShell(g, w, h, s, slabH, night, accent) {
  const y0 = slabH;
  const inset = Math.max(2, 3 * s);
  const roomW = w - inset * 2;
  const roomH = h - slabH - inset;

  const bw = g.createLinearGradient(0, y0, 0, h);
  bw.addColorStop(0, night ? '#0c121c' : '#1d2532');
  bw.addColorStop(1, night ? '#050910' : '#151c27');
  g.fillStyle = bw;
  g.fillRect(inset, y0 + inset * 0.5, roomW, roomH);

  // ceiling occlusion
  const ca = g.createLinearGradient(0, y0, 0, y0 + roomH * 0.5);
  ca.addColorStop(0, night ? 'rgba(0,0,0,0.62)' : 'rgba(0,0,0,0.45)');
  ca.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = ca;
  g.fillRect(inset, y0, roomW, roomH * 0.5);

  // floor plane, lit from above
  const fh = roomH * 0.32;
  const fy = y0 + roomH - fh;
  const fg = g.createLinearGradient(0, fy, 0, fy + fh);
  fg.addColorStop(0, night ? 'rgba(132,112,84,0.34)' : 'rgba(158,148,132,0.36)');
  fg.addColorStop(1, night ? 'rgba(58,50,38,0.16)' : 'rgba(92,86,76,0.20)');
  g.fillStyle = fg;
  g.fillRect(inset, fy, roomW, fh);

  // side occlusion
  const sw = Math.max(1, 1.7 * s);
  g.fillStyle = 'rgba(0,0,0,0.30)';
  g.fillRect(inset, y0, sw, roomH);
  g.fillRect(w - inset - sw, y0, sw, roomH);
}

// soft contact shadow under a prop
function propShadow(g, cx, y, w, a = 0.32) {
  const r = Math.max(2, w * 0.7);
  const grd = g.createRadialGradient(cx, y, 0, cx, y, r);
  grd.addColorStop(0, `rgba(0,0,0,${a})`);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.ellipse(cx, y, r, Math.max(1, w * 0.17), 0, 0, Math.PI * 2);
  g.fill();
}

// suspended ceiling luminaires — the recurring "modern office" motif
function ceilingLight(g, w, s, y0, night, accent, n = 2) {
  const bw = w / (n * 2.6);
  for (let i = 0; i < n; i++) {
    const x = w * ((i + 0.5) / n) - bw / 2;
    g.fillStyle = night ? rgba(accent, 0.55) : 'rgba(255,255,255,0.34)';
    g.fillRect(x, y0 + Math.max(1, 1.2 * s), bw, Math.max(1, 1.1 * s));
    if (night) {
      const gl = g.createLinearGradient(0, y0, 0, y0 + 18 * s);
      gl.addColorStop(0, rgba(accent, 0.20));
      gl.addColorStop(1, rgba(accent, 0));
      g.fillStyle = gl;
      g.fillRect(x - bw * 0.5, y0, bw * 2, 18 * s);
    }
  }
}

// potted plant
function plant(g, x, y, s, night) {
  g.fillStyle = night ? 'rgba(58,48,38,0.92)' : 'rgba(112,98,80,0.92)';
  g.beginPath();
  g.moveTo(x - 2.6 * s, y); g.lineTo(x + 2.6 * s, y);
  g.lineTo(x + 1.8 * s, y + 4 * s); g.lineTo(x - 1.8 * s, y + 4 * s);
  g.closePath();
  g.fill();
  const c1 = night ? '#1d3b27' : '#2f6b3c';
  const c2 = night ? '#2a5535' : '#3f8a4c';
  for (let i = 0; i < 4; i++) {
    g.fillStyle = (i % 2) ? c2 : c1;
    g.beginPath();
    g.arc(x + (i - 1.5) * 2.6 * s, y - 3 * s - (i % 2) * 2 * s, 3.2 * s, 0, Math.PI * 2);
    g.fill();
  }
}

function drawOffice(g, w, h, s, y0, gh, night, accent, rng) {
  ceilingLight(g, w, s, y0, night, accent, 3);
  // glazed meeting-room partition on the back wall
  g.fillStyle = night ? 'rgba(70,92,118,0.45)' : 'rgba(150,178,204,0.40)';
  g.fillRect(w * 0.30, y0 + gh * 0.16, w * 0.38, gh * 0.42);
  g.strokeStyle = night ? 'rgba(180,200,220,0.25)' : 'rgba(90,110,130,0.35)';
  g.lineWidth = Math.max(0.5, 0.7 * s);
  g.strokeRect(w * 0.30, y0 + gh * 0.16, w * 0.38, gh * 0.42);

  const n = 3;
  for (let i = 0; i < n; i++) {
    const dx = w * (0.10 + i * 0.31);
    const dw = w * 0.20;
    const dy = y0 + gh * 0.58;
    propShadow(g, dx + dw / 2, dy + gh * 0.1, dw);
    g.fillStyle = night ? 'rgba(120,132,150,0.55)' : 'rgba(150,162,180,0.55)';
    g.fillRect(dx, dy, dw, Math.max(1, gh * 0.06));
    // monitor
    const mw = dw * 0.55, mh = gh * 0.26;
    g.fillStyle = 'rgba(18,24,34,0.9)';
    g.fillRect(dx + dw * 0.2, dy - mh, mw, mh);
    g.fillStyle = night ? rgba('#8fd0ff', 0.75) : rgba('#9fd6ff', 0.48);
    g.fillRect(dx + dw * 0.2 + 0.6 * s, dy - mh + 0.6 * s, mw - 1.2 * s, mh - 1.2 * s);
    // seat
    g.fillStyle = 'rgba(40,48,60,0.7)';
    g.fillRect(dx + dw * 0.35, dy + gh * 0.06, dw * 0.3, gh * 0.16);
  }
  // partition
  g.fillStyle = night ? 'rgba(90,100,116,0.35)' : 'rgba(120,132,150,0.35)';
  g.fillRect(w * 0.485, y0 + gh * 0.35, Math.max(1, 1.4 * s), gh * 0.5);
  // ceiling light strip — brighter, warmer at night
  if (night) {
    g.fillStyle = rgba(accent, 0.8);
    g.fillRect(w * 0.18, y0 + 1.5 * s, w * 0.64, Math.max(1, 1.5 * s));
    warmPool(g, w * 0.5, y0, gh * 0.9, accent, 0.28);
  }
  // night: add a subtle office‑floor glow that intensifies with imagined occupancy
  if (night) {
    const floorGlow = accent === '#6aa9ff' ? '#8fd0ff' : '#9fd6ff';
    g.fillStyle = rgba(floorGlow, 0.18);
    g.fillRect(w * 0.12, y0 + gh * 0.12, w * 0.76, gh * 0.48);
  }
  plant(g, w * 0.95, y0 + gh * 0.74, s, night);
}

function drawResidence(g, w, h, s, y0, gh, night, accent, rng) {
  // sofa
  propShadow(g, w * 0.27, y0 + gh * 0.76, w * 0.4);
  g.fillStyle = night ? 'rgba(96,86,104,0.6)' : 'rgba(118,108,126,0.5)';
  g.fillRect(w * 0.10, y0 + gh * 0.52, w * 0.34, gh * 0.22);
  g.fillStyle = night ? 'rgba(118,106,126,0.5)' : 'rgba(140,128,148,0.4)';
  g.fillRect(w * 0.10, y0 + gh * 0.46, w * 0.34, gh * 0.08);
  // coffee table + plant
  g.fillStyle = 'rgba(90,74,58,0.6)';
  g.fillRect(w * 0.50, y0 + gh * 0.62, w * 0.16, Math.max(1, gh * 0.06));
  g.fillStyle = 'rgba(52,86,58,0.65)';
  g.beginPath();
  g.arc(w * 0.74, y0 + gh * 0.52, gh * 0.16, 0, Math.PI * 2);
  g.fill();
  // floor lamp
  g.fillStyle = 'rgba(70,62,54,0.7)';
  g.fillRect(w * 0.88, y0 + gh * 0.34, Math.max(1, 1.2 * s), gh * 0.4);
  if (night) {
    warmPool(g, w * 0.885, y0 + gh * 0.32, gh * 0.55, '#ffca7a', 0.5);
    g.fillStyle = 'rgba(255,214,150,0.9)';
    g.beginPath();
    g.arc(w * 0.885, y0 + gh * 0.32, Math.max(1, 1.6 * s), 0, Math.PI * 2);
    g.fill();
  }
  // curtain
  g.fillStyle = night ? 'rgba(60,54,70,0.5)' : 'rgba(90,84,100,0.35)';
  g.fillRect(w - Math.max(2, 4 * s), y0, Math.max(2, 3 * s), gh);
  // wall TV / art
  g.fillStyle = night ? 'rgba(12,16,24,0.95)' : 'rgba(40,48,60,0.8)';
  g.fillRect(w * 0.62, y0 + gh * 0.14, w * 0.22, gh * 0.3);
  if (night) {
    g.fillStyle = 'rgba(120,190,255,0.35)';
    g.fillRect(w * 0.62 + 1, y0 + gh * 0.14 + 1, w * 0.22 - 2, gh * 0.3 - 2);
  }
  // night: residence wing glow – warmer when imagined occupied
  if (night) {
    g.fillStyle = 'rgba(255,184,119,0.14)';
    g.fillRect(w * 0.08, y0 + gh * 0.14, w * 0.84, gh * 0.5);
  }
  plant(g, w * 0.47, y0 + gh * 0.76, s, night);
}

function drawHotel(g, w, h, s, y0, gh, night, accent, rng) {
  ceilingLight(g, w, s, y0, night, accent, 2);
  // headboard + bed
  propShadow(g, w * 0.35, y0 + gh * 0.76, w * 0.48);
  g.fillStyle = night ? 'rgba(74,66,52,0.75)' : 'rgba(96,88,72,0.6)';
  g.fillRect(w * 0.14, y0 + gh * 0.22, w * 0.42, gh * 0.5);
  g.fillStyle = night ? 'rgba(214,208,196,0.7)' : 'rgba(230,226,216,0.6)';
  g.fillRect(w * 0.16, y0 + gh * 0.56, w * 0.38, gh * 0.2);
  g.fillStyle = 'rgba(246,244,238,0.8)';
  g.fillRect(w * 0.17, y0 + gh * 0.58, w * 0.13, gh * 0.08);
  g.fillRect(w * 0.32, y0 + gh * 0.58, w * 0.13, gh * 0.08);
  // sconce
  if (night) warmPool(g, w * 0.62, y0 + gh * 0.3, gh * 0.5, '#ffcf8a', 0.42);
  // side table + lamp
  g.fillStyle = 'rgba(70,62,50,0.7)';
  g.fillRect(w * 0.62, y0 + gh * 0.56, w * 0.12, gh * 0.2);
  // curtain
  g.fillStyle = night ? 'rgba(78,70,58,0.6)' : 'rgba(120,110,94,0.4)';
  g.fillRect(w - Math.max(2, 5 * s), y0, Math.max(2, 4 * s), gh);
  // night: hotel lobby glow – warmer with imagined occupancy
  if (night) {
    g.fillStyle = 'rgba(255,226,174,0.16)';
    g.fillRect(w * 0.10, y0 + gh * 0.16, w * 0.80, gh * 0.5);
  }
}

function drawSpa(g, w, h, s, y0, gh, night, accent, rng) {
  g.fillStyle = night ? rgba('#1d4a52', 0.7) : rgba('#2a7d84', 0.45);
  g.fillRect(w * 0.08, y0 + gh * 0.5, w * 0.84, gh * 0.3);
  g.fillStyle = rgba('#8ff0e6', night ? 0.38 : 0.28);
  for (let i = 0; i < 4; i++) {
    g.fillRect(w * (0.14 + i * 0.2), y0 + gh * 0.58, w * 0.09, Math.max(1, 1.1 * s));
  }
  // steam
  g.strokeStyle = 'rgba(220,245,245,0.28)';
  g.lineWidth = Math.max(0.6, 0.8 * s);
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.moveTo(w * (0.22 + i * 0.28), y0 + gh * 0.48);
    g.quadraticCurveTo(w * (0.24 + i * 0.28), y0 + gh * 0.3, w * (0.2 + i * 0.28), y0 + gh * 0.14);
    g.stroke();
  }
  // night: spa glow – cooler, steamed-up ambience
  if (night) {
    g.fillStyle = rgba('#7ff0e0', 0.22);
    g.fillRect(w * 0.12, y0 + gh * 0.4, w * 0.76, gh * 0.4);
  }
  plant(g, w * 0.93, y0 + gh * 0.76, s, night);
}

function drawSkyLobby(g, w, h, s, y0, gh, night, accent, rng) {
  ceilingLight(g, w, s, y0, night, accent, 3);
  // lounge seating
  g.fillStyle = night ? 'rgba(96,88,104,0.6)' : 'rgba(120,112,128,0.5)';
  g.fillRect(w * 0.10, y0 + gh * 0.58, w * 0.24, gh * 0.2);
  g.fillRect(w * 0.60, y0 + gh * 0.58, w * 0.24, gh * 0.2);
  g.fillStyle = 'rgba(88,80,66,0.7)';
  g.fillRect(w * 0.40, y0 + gh * 0.66, w * 0.18, Math.max(1, gh * 0.06));
  g.fillStyle = 'rgba(52,86,58,0.65)';
  g.beginPath();
  g.arc(w * 0.90, y0 + gh * 0.52, gh * 0.14, 0, Math.PI * 2);
  g.fill();
  if (night) {
    warmPool(g, w * 0.5, y0 + gh * 0.15, gh * 0.9, accent, 0.2);
    g.fillStyle = rgba(accent, 0.5);
    g.fillRect(w * 0.24, y0 + 1.5 * s, w * 0.52, Math.max(1, 1.2 * s));
  }
}

function drawLobby(g, w, h, s, y0, gh, night, accent, rng) {
  ceilingLight(g, w, s, y0, night, accent, 3);
  // reception desk
  g.fillStyle = night ? 'rgba(76,66,50,0.8)' : 'rgba(104,90,68,0.65)';
  g.fillRect(w * 0.10, y0 + gh * 0.52, w * 0.36, gh * 0.24);
  g.fillStyle = 'rgba(150,132,100,0.5)';
  g.fillRect(w * 0.10, y0 + gh * 0.52, w * 0.36, Math.max(1, 1 * s));
  // revolving doors
  g.fillStyle = night ? 'rgba(200,176,120,0.35)' : 'rgba(180,200,220,0.4)';
  g.fillRect(w * 0.60, y0 + gh * 0.2, w * 0.30, gh * 0.7);
  g.strokeStyle = 'rgba(40,48,60,0.6)';
  g.lineWidth = Math.max(0.6, 0.8 * s);
  g.beginPath();
  g.moveTo(w * 0.75, y0 + gh * 0.2);
  g.lineTo(w * 0.75, y0 + gh * 0.9);
  g.stroke();
  // chandelier
  if (night) {
    warmPool(g, w * 0.42, y0 + gh * 0.16, gh * 0.8, accent, 0.45);
    g.fillStyle = rgba(accent, 0.9);
    g.beginPath();
    g.arc(w * 0.42, y0 + gh * 0.16, Math.max(1, 1.8 * s), 0, Math.PI * 2);
    g.fill();
  }
}

function drawShop(g, w, h, s, y0, gh, night, accent, rng) {
  ceilingLight(g, w, s, y0, night, accent, 3);
  for (let sh = 0; sh < 2; sh++) {
    const sy = y0 + gh * (0.34 + sh * 0.34);
    g.fillStyle = 'rgba(120,110,96,0.55)';
    g.fillRect(w * 0.08, sy, w * 0.5, Math.max(1, 1 * s));
    for (let i = 0; i < 5; i++) {
      const ix = w * (0.09 + i * 0.098);
      const ih = gh * (0.10 + rng() * 0.12);
      g.fillStyle = [rgba(accent, 0.75), 'rgba(120,180,220,0.6)', 'rgba(230,200,120,0.6)'][i % 3];
      g.fillRect(ix, sy - ih, w * 0.06, ih);
    }
  }
  // counter + mannequin
  propShadow(g, w * 0.80, y0 + gh * 0.78, w * 0.3);
  g.fillStyle = 'rgba(70,64,56,0.7)';
  g.fillRect(w * 0.66, y0 + gh * 0.5, w * 0.28, gh * 0.26);
  g.fillStyle = night ? rgba(accent, 0.35) : 'rgba(180,190,200,0.35)';
  g.fillRect(w * 0.72, y0 + gh * 0.24, w * 0.14, gh * 0.26);
  // illuminated shop sign
  if (night) {
    g.fillStyle = rgba(accent, 0.55);
    g.fillRect(w * 0.06, y0 + 1.2 * s, w * 0.5, Math.max(1, 2 * s));
    warmPool(g, w * 0.4, y0, gh * 1.1, accent, 0.2);
  }
}

function drawRestaurant(g, w, h, s, y0, gh, night, accent, rng) {
  for (let t = 0; t < 2; t++) {
    const tx = w * (0.14 + t * 0.42);
    propShadow(g, tx + w * 0.11, y0 + gh * 0.78, w * 0.26);
    g.fillStyle = 'rgba(120,96,72,0.7)';
    g.fillRect(tx, y0 + gh * 0.6, w * 0.22, Math.max(1, gh * 0.07));
    g.fillStyle = 'rgba(80,64,48,0.7)';
    g.fillRect(tx + w * 0.09, y0 + gh * 0.67, Math.max(1, 1.4 * s), gh * 0.16);
    g.fillStyle = 'rgba(60,54,48,0.7)';
    g.fillRect(tx + w * 0.02, y0 + gh * 0.74, w * 0.06, gh * 0.12);
    g.fillRect(tx + w * 0.14, y0 + gh * 0.74, w * 0.06, gh * 0.12);
    if (night) {
      g.fillStyle = rgba(accent, 0.85);
      g.beginPath();
      g.arc(tx + w * 0.11, y0 + gh * 0.3, Math.max(1, 1.5 * s), 0, Math.PI * 2);
      g.fill();
      warmPool(g, tx + w * 0.11, y0 + gh * 0.34, gh * 0.7, accent, 0.35);
    }
  }
  if (night) {
    g.fillStyle = rgba(accent, 0.4);
    g.fillRect(w * 0.06, y0 + 1.2 * s, w * 0.6, Math.max(1, 2 * s));
  }
}

function drawCinema(g, w, h, s, y0, gh, night, accent, rng) {
  // dark auditorium
  g.fillStyle = 'rgba(12,12,20,0.92)';
  g.fillRect(0, y0, w, gh);
  // screen glow
  const sc = g.createLinearGradient(0, y0, 0, y0 + gh * 0.55);
  sc.addColorStop(0, night ? 'rgba(150,190,255,0.55)' : 'rgba(150,180,220,0.35)');
  sc.addColorStop(1, 'rgba(150,190,255,0)');
  g.fillStyle = sc;
  g.fillRect(w * 0.14, y0, w * 0.72, gh * 0.55);
  // seat rows
  for (let r = 0; r < 2; r++) {
    const sy = y0 + gh * (0.62 + r * 0.18);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = 'rgba(60,20,26,0.8)';
      g.fillRect(w * (0.08 + i * 0.145), sy, w * 0.1, gh * 0.12);
    }
  }
  // marquee bulbs along the fascia
  const bulbY = y0 + Math.max(1, 2 * s);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const bx = w * (0.08 + i * (0.84 / (n - 1)));
    g.fillStyle = night ? rgba(accent, 0.95) : rgba(accent, 0.5);
    g.beginPath();
    g.arc(bx, bulbY, Math.max(0.8, 1.1 * s), 0, Math.PI * 2);
    g.fill();
  }
}

function drawPark(g, w, h, s, y0, gh, night, accent, rng) {
  // open to the sky — the "interior" is sky
  const sky = g.createLinearGradient(0, y0, 0, h);
  sky.addColorStop(0, night ? '#101a2c' : '#9dc4dd');
  sky.addColorStop(1, night ? '#16233a' : '#c3d9e6');
  g.fillStyle = sky;
  g.fillRect(0, y0, w, gh);
  // deck floor
  g.fillStyle = night ? 'rgba(52,58,66,0.95)' : 'rgba(150,144,132,0.9)';
  g.fillRect(0, h - gh * 0.34, w, gh * 0.34);
  // hedge + tree + bench
  g.fillStyle = night ? 'rgba(28,54,38,0.9)' : 'rgba(58,110,68,0.85)';
  g.fillRect(0, h - gh * 0.5, w, gh * 0.16);
  g.fillStyle = night ? 'rgba(34,64,42,0.95)' : 'rgba(66,124,74,0.9)';
  g.beginPath();
  g.arc(w * 0.26, h - gh * 0.78, gh * 0.3, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(70,52,36,0.9)';
  g.fillRect(w * 0.25, h - gh * 0.6, Math.max(1, 1.6 * s), gh * 0.28);
  g.fillStyle = night ? 'rgba(78,68,56,0.9)' : 'rgba(120,100,74,0.9)';
  g.fillRect(w * 0.55, h - gh * 0.42, w * 0.3, Math.max(1, gh * 0.08));
  // railing
  g.strokeStyle = night ? 'rgba(120,132,148,0.5)' : 'rgba(80,90,104,0.55)';
  g.lineWidth = Math.max(0.6, 0.8 * s);
  g.beginPath();
  g.moveTo(0, h - gh * 0.34);
  g.lineTo(w, h - gh * 0.34);
  g.stroke();
}

function drawParkingDeck(g, w, h, s, y0, gh, night, rng) {
  const bg = g.createLinearGradient(0, y0, 0, h);
  bg.addColorStop(0, night ? '#0d1420' : '#3c434d');
  bg.addColorStop(1, night ? '#131b28' : '#4a525d');
  g.fillStyle = bg;
  g.fillRect(0, y0, w, gh);
  // horizontal louvres
  for (let i = 0; i < 5; i++) {
    g.fillStyle = night ? 'rgba(30,38,50,0.85)' : 'rgba(96,104,116,0.6)';
    g.fillRect(0, y0 + gh * (0.14 + i * 0.16), w, Math.max(1, 1.4 * s));
  }
  // bay markings + car
  g.strokeStyle = night ? 'rgba(190,190,160,0.18)' : 'rgba(220,220,190,0.3)';
  g.lineWidth = Math.max(0.6, 0.7 * s);
  for (let i = 1; i < 4; i++) {
    const x = w * i / 4;
    g.beginPath();
    g.moveTo(x, h - gh * 0.42);
    g.lineTo(x, h - gh * 0.06);
    g.stroke();
  }
  const cw = w * 0.34, ch = gh * 0.34;
  const cx = w * (0.1 + rng() * 0.5);
  const cy = h - gh * 0.44 - ch;
  g.fillStyle = night ? 'rgba(46,58,74,0.95)' : 'rgba(70,84,102,0.95)';
  g.beginPath();
  g.roundRect(cx, cy, cw, ch, Math.max(1, 2 * s));
  g.fill();
  g.fillStyle = 'rgba(20,28,40,0.75)';
  g.fillRect(cx + cw * 0.16, cy + ch * 0.12, cw * 0.3, ch * 0.34);
  g.fillRect(cx + cw * 0.54, cy + ch * 0.12, cw * 0.3, ch * 0.34);
  // ceiling strip light
  if (night) {
    g.fillStyle = 'rgba(200,220,255,0.5)';
    g.fillRect(w * 0.2, y0 + Math.max(1, 1.6 * s), w * 0.6, Math.max(1, 1.2 * s));
  }
}

function drawService(g, w, h, s, y0, gh, night, accent, rng) {
  g.fillStyle = night ? '#1a1f27' : '#3a4048';
  g.fillRect(0, y0, w, gh);
  // vertical louvres
  for (let i = 0; i < 9; i++) {
    g.fillStyle = night ? 'rgba(40,48,58,0.9)' : 'rgba(96,104,116,0.7)';
    g.fillRect(w * (0.06 + i * 0.1), y0 + gh * 0.08, Math.max(1, 1.4 * s), gh * 0.84);
  }
  // pipework
  g.strokeStyle = night ? 'rgba(120,128,140,0.6)' : 'rgba(70,78,90,0.6)';
  g.lineWidth = Math.max(1, 1.6 * s);
  g.beginPath();
  g.moveTo(0, y0 + gh * 0.34);
  g.lineTo(w, y0 + gh * 0.34);
  g.stroke();
  // status light
  g.fillStyle = night ? 'rgba(90,230,130,0.9)' : 'rgba(60,140,80,0.8)';
  g.beginPath();
  g.arc(w * 0.86, y0 + gh * 0.72, Math.max(0.9, 1.2 * s), 0, Math.PI * 2);
  g.fill();
  // night: service glow – industrial cool
  if (night) {
    g.fillStyle = 'rgba(90,200,250,0.12)';
    g.fillRect(0, y0, w, gh);
  }
}

function drawBasementLobby(g, w, h, s, y0, gh, night, accent, rng) {
  g.fillStyle = night ? '#171c25' : '#39414c';
  g.fillRect(0, y0, w, gh);
  // tiled wall
  g.strokeStyle = night ? 'rgba(120,132,148,0.14)' : 'rgba(255,255,255,0.12)';
  g.lineWidth = Math.max(0.5, 0.6 * s);
  for (let i = 1; i < 6; i++) {
    g.beginPath();
    g.moveTo(w * i / 6, y0);
    g.lineTo(w * i / 6, h);
    g.stroke();
  }
  // directory sign
  g.fillStyle = night ? 'rgba(40,50,62,0.95)' : 'rgba(70,80,92,0.95)';
  g.fillRect(w * 0.28, y0 + gh * 0.16, w * 0.44, gh * 0.2);
  g.fillStyle = rgba(accent, night ? 0.8 : 0.5);
  g.fillRect(w * 0.31, y0 + gh * 0.22, w * 0.38, Math.max(1, 1 * s));
  // bench
  g.fillStyle = night ? 'rgba(74,64,52,0.85)' : 'rgba(104,92,74,0.85)';
  g.fillRect(w * 0.1, y0 + gh * 0.66, w * 0.34, gh * 0.1);
  // ceiling lights
  g.fillStyle = night ? 'rgba(220,230,240,0.75)' : 'rgba(255,255,255,0.45)';
  g.fillRect(w * 0.16, y0 + Math.max(1, 1.2 * s), w * 0.68, Math.max(1, 1.4 * s));
}

function drawSubway(g, w, h, s, y0, gh, night, accent, rng) {
  g.fillStyle = night ? '#12161e' : '#2f3742';
  g.fillRect(0, y0, w, gh);
  // tiled back wall
  g.fillStyle = night ? 'rgba(40,54,70,0.8)' : 'rgba(96,120,142,0.6)';
  g.fillRect(0, y0, w, gh * 0.62);
  g.strokeStyle = night ? 'rgba(140,170,200,0.10)' : 'rgba(255,255,255,0.14)';
  g.lineWidth = Math.max(0.5, 0.6 * s);
  for (let i = 1; i < 8; i++) {
    g.beginPath();
    g.moveTo(w * i / 8, y0);
    g.lineTo(w * i / 8, y0 + gh * 0.62);
    g.stroke();
  }
  // station name band
  g.fillStyle = rgba(accent, night ? 0.85 : 0.55);
  g.fillRect(w * 0.2, y0 + gh * 0.2, w * 0.6, Math.max(1, gh * 0.09));
  // platform edge + tracks
  g.fillStyle = 'rgba(230,200,60,0.75)';
  g.fillRect(0, h - gh * 0.3, w, Math.max(1, 1.2 * s));
  g.fillStyle = night ? '#0a0d13' : '#1a1f27';
  g.fillRect(0, h - gh * 0.22, w, gh * 0.22);
  g.strokeStyle = 'rgba(150,150,150,0.5)';
  g.lineWidth = Math.max(0.6, 0.8 * s);
  g.beginPath();
  g.moveTo(0, h - gh * 0.12);
  g.lineTo(w, h - gh * 0.12);
  g.stroke();
  // train headlights in the distance
  if (night) {
    warmPool(g, w * 0.5, h - gh * 0.12, gh * 0.5, '#fff2c0', 0.35);
  }
}

// ── glazing over the interior ──────────────────────────────────

function drawGlazing(g, kind, w, h, s, slabH, night) {
  if (kind === 'concrete' || kind === 'louver' || kind === 'shaft') return;

  const gy = slabH;
  const ghs = h - slabH;
  const gl = g.createLinearGradient(0, gy, 0, h);
  if (kind === 'open') {
    // no glazing outdoors
    return;
  }
  if (kind === 'marquee') {
    gl.addColorStop(0, night ? 'rgba(18,20,34,0.35)' : 'rgba(40,50,70,0.25)');
    gl.addColorStop(1, night ? 'rgba(8,10,18,0.5)' : 'rgba(20,26,38,0.35)');
  } else if (kind === 'deck' || kind === 'parking') {
    gl.addColorStop(0, night ? 'rgba(20,28,42,0.28)' : 'rgba(60,72,88,0.18)');
    gl.addColorStop(1, night ? 'rgba(10,16,26,0.4)' : 'rgba(30,38,50,0.26)');
  } else {
    gl.addColorStop(0, night ? 'rgba(26,38,56,0.55)' : 'rgba(205,232,250,0.54)');
    gl.addColorStop(0.55, night ? 'rgba(16,24,38,0.66)' : 'rgba(168,197,222,0.58)');
    gl.addColorStop(1, night ? 'rgba(10,15,24,0.78)' : 'rgba(126,154,182,0.62)');
  }
  g.fillStyle = gl;
  g.fillRect(0, gy, w, ghs);

  // diagonal specular streak
  g.save();
  g.beginPath();
  g.rect(0, gy, w, ghs);
  g.clip();
  if (!night) {
    const sh = g.createLinearGradient(0, gy, w, h);
    sh.addColorStop(0.26, 'rgba(255,255,255,0)');
    sh.addColorStop(0.42, 'rgba(255,255,255,0.22)');
    sh.addColorStop(0.56, 'rgba(255,255,255,0)');
    g.fillStyle = sh;
    g.fillRect(0, gy, w, ghs);
  }
  g.restore();
}

// ── structure: slab band + columns + mullions ──────────────────

function drawStructure(g, w, h, s, slabH, cornerW, col, kind) {
  // ---- floor slab band (structure above this floor) ----
  const sg = g.createLinearGradient(0, 0, 0, slabH);
  sg.addColorStop(0, col('slabTop'));
  sg.addColorStop(0.5, col('slabFace'));
  sg.addColorStop(1, col('slabEdge'));
  g.fillStyle = sg;
  g.fillRect(0, 0, w, slabH);
  g.fillStyle = col('slabTop');
  g.fillRect(0, 0, w, Math.max(0.8, 0.9 * s));
  g.fillStyle = 'rgba(0,0,0,0.32)';
  g.fillRect(0, slabH - Math.max(0.8, 1 * s), w, Math.max(0.8, 1 * s));

  // ---- glazing bays ----
  const bays = bayCount(kind);
  const gy = slabH;
  const ghs = h - slabH;

  // ---- corner columns ----
  const cg = g.createLinearGradient(0, 0, cornerW, 0);
  cg.addColorStop(0, col('frameHi'));
  cg.addColorStop(0.35, col('frame'));
  cg.addColorStop(1, col('frame'));
  g.fillStyle = cg;
  g.fillRect(0, 0, cornerW, h);
  g.save();
  g.translate(w, 0);
  g.scale(-1, 1);
  g.fillStyle = cg;
  g.fillRect(0, 0, cornerW, h);
  g.restore();

  // ---- mullions ----
  const mw = Math.max(0.8, 1.2 * s);
  for (let i = 1; i < bays; i++) {
    const x = (w * i) / bays - mw / 2;
    g.fillStyle = col('frame');
    g.fillRect(x, gy, mw, ghs);
    g.fillStyle = col('frameHi');
    g.fillRect(x, gy, Math.max(0.4, 0.5 * s), ghs);
  }

  // ---- shadow under the slab (ambient occlusion) ----
  const ao = g.createLinearGradient(0, gy, 0, gy + ghs * 0.32);
  ao.addColorStop(0, 'rgba(0,0,0,0.26)');
  ao.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = ao;
  g.fillRect(0, gy, w, ghs * 0.32);
}

// ── accents: LED strip + signage ───────────────────────────────

function drawAccents(g, type, kind, w, h, s, slabH, night, accent, rng) {
  if (kind === 'concrete' || kind === 'louver') return;

  // balcony / Juliette rail on some residences and hotels
  if ((type === 'residence' || type === 'hotel') && rng() < 0.45) {
    const by = h - Math.max(6, 13 * s);
    const bh = Math.max(4, 9 * s);
    g.fillStyle = night ? 'rgba(60,70,84,0.9)' : 'rgba(150,160,174,0.9)';
    g.fillRect(0, by, w, Math.max(1, 1.2 * s));            // slab
    g.strokeStyle = night ? 'rgba(180,192,208,0.5)' : 'rgba(70,80,94,0.6)';
    g.lineWidth = Math.max(0.5, 0.7 * s);
    const bars = 7;
    g.beginPath();
    for (let i = 0; i < bars; i++) {
      const x = w * (0.06 + i * 0.88 / (bars - 1));
      g.moveTo(x, by - bh);
      g.lineTo(x, by);
    }
    g.stroke();
    g.fillStyle = night ? 'rgba(180,192,208,0.35)' : 'rgba(90,100,114,0.45)';
    g.fillRect(0, by - bh, w, Math.max(0.8, 1 * s));       // handrail
  }

  // rooftop AC/plant unit for some office cells
  if (type === 'office' && rng() < 0.3) {
    const uw = w * 0.22, uh = Math.max(3, 7 * s);
    g.fillStyle = night ? 'rgba(52,62,76,0.9)' : 'rgba(140,150,164,0.9)';
    g.fillRect(w * 0.72, slabH + Math.max(2, 4 * s), uw, uh);
    g.fillStyle = 'rgba(20,26,36,0.5)';
    g.fillRect(w * 0.72 + uw * 0.15, slabH + Math.max(2, 4 * s) + uh * 0.25, uw * 0.7, Math.max(0.6, 1 * s));
  }

  // LED strip tucked under the slab for most modern types
  const stripH = Math.max(0.8, 0.9 * s);
  g.fillStyle = rgba(accent, night ? 0.75 : 0.32);
  g.fillRect(Math.max(2, 3 * s), slabH + Math.max(0.6, 0.8 * s), w - Math.max(4, 6 * s), stripH);

  if (night && (kind === 'glass' || kind === 'storefront' || kind === 'marquee')) {
    const bl = g.createLinearGradient(0, slabH, 0, slabH + h * 0.4);
    bl.addColorStop(0, rgba(accent, 0.14));
    bl.addColorStop(1, rgba(accent, 0));
    g.fillStyle = bl;
    g.fillRect(0, slabH, w, h * 0.4);
  }
}
