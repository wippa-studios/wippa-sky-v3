// ═══════════════════════════════════════════════════════════════
//  GROUND — street scene
//
//  Modern urban cross-section: concrete sidewalk with expansion joints and
//  tactile paving, kerbs with real edge shading, a marked multi-lane road
//  with tyre wear and wet sheen, and street furniture (LED lamps, layered
//  trees in pits, bollards, bins, planters, hydrants, drains, manholes).
//
//  Traffic is layered 2.5D vehicles with body gradients, glass, wheels and
//  headlight cones.
// ═══════════════════════════════════════════════════════════════

import { mulberry32, nightAmount } from '../constants.js';

const GROUND_Y_OFFSET = 140;

const CAR_COLORS = ['#b8423a', '#2f4a6b', '#3f6b4a', '#8a8f96', '#d8d3cb', '#6b4a86', '#c07a2e', '#2b2f36'];
const TAXI = '#e0b23c';

// ── helpers ────────────────────────────────────────────────────

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function mix(a, b, t) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const ar = (A >> 16) & 255, ag = (A >> 8) & 255, ab = A & 255;
  const br = (B >> 16) & 255, bg = (B >> 8) & 255, bb = B & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

function rgba(hex, a) {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

function sunSide(state) {
  return (0.1 + 0.8 * (state.dayTime || 0)) < 0.5 ? -1 : 1;
}

// ── traffic ────────────────────────────────────────────────────

const CAR_TYPES = [
  { id: 'sedan', w: 54, h: 19, seats: 2 },
  { id: 'hatch', w: 44, h: 18, seats: 2 },
  { id: 'van', w: 60, h: 24, seats: 1 },
  { id: 'taxi', w: 52, h: 19, seats: 2, roofSign: true },
  { id: 'bus', w: 96, h: 30, seats: 4 },
  { id: 'truck', w: 78, h: 27, seats: 1, cargo: true },
];

export function initGround(state, canvasW) {
  state.cars = [];
  for (let i = 0; i < 7; i++) state.cars.push(createCar(canvasW, i % 2, i));
}

function createCar(canvasW, lane, i) {
  const rng = mulberry32(77 + i * 971);
  const t = CAR_TYPES[Math.floor(rng() * CAR_TYPES.length)];
  const dir = lane === 0 ? 1 : -1;
  const speed = (t.id === 'bus' ? 42 : 64) + rng() * 70;
  const w = t.w;
  const x = dir === 1 ? -w - rng() * canvasW * 0.6 : canvasW + rng() * canvasW * 0.6;
  return {
    x, speed, dir, lane, w,
    type: t.id, h: t.h, seats: t.seats, cargo: !!t.cargo, roofSign: !!t.roofSign,
    color: t.id === 'taxi' ? TAXI : CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)],
  };
}

export function updateGround(state, dt, canvasW) {
  for (const car of state.cars) {
    car.x += car.speed * car.dir * dt * (state.speed > 0 ? state.speed : 1);
    const pad = car.w + 80;
    if (car.dir === 1 && car.x > canvasW + pad) car.x = -pad - Math.random() * 200;
    else if (car.dir === -1 && car.x < -pad) car.x = canvasW + pad + Math.random() * 200;
  }
}

// ── the street ─────────────────────────────────────────────────

export function drawGround(ctx, state, canvasW, canvasH) {
  const camY = state.cameraY || 0;
  const baseY = canvasH - GROUND_Y_OFFSET + camY;
  const nA = nightAmount(state.dayTime || 0);
  if (baseY > canvasH + 30) return;
  const S = Math.max(0.8, Math.min(1.3, state.zoom || 1));

  const walkH = 20 * S;
  const kerbH = 4 * S;
  const roadH = 46 * S;
  const nearWalk = 24 * S;

  const walkTop = baseY;
  const roadTop = walkTop + walkH + kerbH;
  const roadBot = roadTop + roadH;
  const nearKerbTop = roadBot;
  const nearWalkTop = nearKerbTop + kerbH;

  // underground / soil behind everything below the pavements
  drawSoil(ctx, state, canvasW, canvasH, baseY, nearWalkTop + nearWalk, nA);

  drawSidewalk(ctx, canvasW, walkTop, walkH, S, nA);
  drawKerb(ctx, canvasW, walkTop + walkH, kerbH, S, nA, true);

  drawRoad(ctx, canvasW, roadTop, roadH, S, nA, state);

  drawKerb(ctx, canvasW, roadBot, kerbH, S, nA, false);
  drawSidewalk(ctx, canvasW, nearWalkTop, nearWalk, S, nA);

  drawFurniture(ctx, state, canvasW, roadTop, roadBot, walkTop, walkH, nearWalkTop, S, nA, canvasH);

  // vehicles
  const laneY = [
    roadTop + roadH * 0.30,
    roadTop + roadH * 0.76,
  ];
  for (const car of state.cars) {
    const cy = laneY[car.lane] || laneY[0];
    drawCar(ctx, car, cy, nA, state.tick);
  }
}

function drawSoil(ctx, state, canvasW, canvasH, baseY, top, nA) {
  if (top >= canvasH) return;
  const g = ctx.createLinearGradient(0, top, 0, canvasH);
  if (nA > 0.5) { g.addColorStop(0, '#1a140f'); g.addColorStop(1, '#0c0907'); }
  else { g.addColorStop(0, '#5c4a3c'); g.addColorStop(1, '#33241c'); }
  ctx.fillStyle = g;
  ctx.fillRect(0, top, canvasW, canvasH - top);
}

function drawSidewalk(ctx, canvasW, y, h, S, nA) {
  const top = mix('#c9cdd2', '#2b3138', nA);
  const bot = mix('#a7adb5', '#20262d', nA);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, top);
  g.addColorStop(1, bot);
  ctx.fillStyle = g;
  ctx.fillRect(0, y, canvasW, h);

  // expansion joints
  ctx.strokeStyle = nA > 0.5 ? 'rgba(0,0,0,0.35)' : 'rgba(90,98,108,0.35)';
  ctx.lineWidth = Math.max(0.6, 1 * S);
  const step = 46 * S;
  ctx.beginPath();
  for (let x = step; x < canvasW; x += step) {
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + h);
  }
  ctx.stroke();

  // tactile paving strip along the kerb side
  const th = Math.max(3, 4 * S);
  const ty = y + h - th;
  ctx.fillStyle = nA > 0.5 ? 'rgba(150,140,90,0.30)' : 'rgba(206,186,110,0.42)';
  ctx.fillRect(0, ty, canvasW, th);
  ctx.fillStyle = nA > 0.5 ? 'rgba(0,0,0,0.35)' : 'rgba(120,108,62,0.35)';
  for (let x = 3 * S; x < canvasW; x += 7 * S) ctx.fillRect(x, ty + 1, 1.6 * S, th - 2);

  // top highlight
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(0, y, canvasW, 1);
}

function drawKerb(ctx, canvasW, y, h, S, nA, far) {
  const face = nA > 0.5 ? '#2a3037' : '#8e959d';
  ctx.fillStyle = face;
  ctx.fillRect(0, y, canvasW, h);
  ctx.fillStyle = nA > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.35)';
  ctx.fillRect(0, y, canvasW, Math.max(0.8, 1 * S));
  ctx.fillStyle = far ? 'rgba(0,0,0,0.30)' : 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, y + h - Math.max(0.8, 1 * S), canvasW, Math.max(0.8, 1 * S));
}

function drawRoad(ctx, canvasW, y, h, S, nA, state) {
  // asphalt
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, nA > 0.5 ? '#101419' : '#3a3f47');
  g.addColorStop(0.45, nA > 0.5 ? '#151a21' : '#454b54');
  g.addColorStop(1, nA > 0.5 ? '#0e1218' : '#33383f');
  ctx.fillStyle = g;
  ctx.fillRect(0, y, canvasW, h);

  // tyre wear tracks (two per lane)
  ctx.fillStyle = nA > 0.5 ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.13)';
  const lanes = [0.30, 0.76];
  for (const lf of lanes) {
    const cy = y + h * lf;
    ctx.fillRect(0, cy - h * 0.10, canvasW, h * 0.06);
    ctx.fillRect(0, cy + h * 0.04, canvasW, h * 0.06);
  }

  // road grain
  ctx.fillStyle = nA > 0.5 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.035)';
  for (let i = 0; i < canvasW; i += 13 * S) {
    const hh = ((i * 37) % 5) + 1;
    ctx.fillRect(i, y + ((i * 53) % Math.max(1, h)), 2 * S, hh * 0.5);
  }

  // centre line — dashed white, with edge lines
  const mid = y + h * 0.52;
  ctx.strokeStyle = nA > 0.5 ? 'rgba(220,220,210,0.55)' : 'rgba(245,245,238,0.85)';
  ctx.lineWidth = Math.max(1.2, 2 * S);
  ctx.setLineDash([20 * S, 16 * S]);
  ctx.lineDashOffset = -((state.tick * 0.06 * S) % (36 * S));
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(canvasW, mid);
  ctx.stroke();
  ctx.setLineDash([]);

  // edge lines
  ctx.fillStyle = nA > 0.5 ? 'rgba(220,220,210,0.4)' : 'rgba(245,245,238,0.7)';
  const el = Math.max(1, 1.6 * S);
  ctx.fillRect(0, y + 3 * S, canvasW, el);
  ctx.fillRect(0, y + h - 4 * S, canvasW, el);

  // pedestrian crossing
  const cwX = canvasW * 0.5 - 40 * S;
  ctx.fillStyle = nA > 0.5 ? 'rgba(232,232,222,0.42)' : 'rgba(248,248,240,0.8)';
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(cwX + i * 17 * S, y + 4 * S, 9 * S, h - 9 * S);
  }

  // wet sheen — intensifies at night, picks up the sky
  const wet = 0.10 + 0.24 * nA;
  const wg = ctx.createLinearGradient(0, y, 0, y + h);
  wg.addColorStop(0, `rgba(150,180,215,${wet * 0.7})`);
  wg.addColorStop(0.5, `rgba(150,180,215,${wet * 0.25})`);
  wg.addColorStop(1, `rgba(150,180,215,${wet * 0.55})`);
  ctx.fillStyle = wg;
  ctx.fillRect(0, y, canvasW, h);

  // manhole covers
  ctx.fillStyle = nA > 0.5 ? 'rgba(30,34,40,0.9)' : 'rgba(70,74,80,0.85)';
  for (let x = 160 * S; x < canvasW; x += 340 * S) {
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.48, 8 * S, 3 * S, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── street furniture ───────────────────────────────────────────

function drawFurniture(ctx, state, canvasW, roadTop, roadBot, walkTop, walkH, nearWalkTop, S, nA, canvasH) {
  const sun = sunSide(state);
  const groundLine = walkTop + walkH;

  // LED street lamps
  const lampSpacing = 210 * S;
  for (let x = lampSpacing * 0.5; x < canvasW; x += lampSpacing) {
    drawLamp(ctx, x, groundLine, S, nA);
  }

  // trees in pits (offset from lamps)
  const treeSpacing = 168 * S;
  let ti = 0;
  for (let x = treeSpacing * 0.5 + 60 * S; x < canvasW; x += treeSpacing) {
    drawTree(ctx, x, groundLine, S, nA, sun, ti++);
  }

  // bollards along the kerb
  ctx.fillStyle = nA > 0.5 ? '#2c333c' : '#5a636d';
  for (let x = 34 * S; x < canvasW; x += 96 * S) {
    ctx.fillRect(x, groundLine - 7 * S, 2.6 * S, 7 * S);
    ctx.fillStyle = nA > 0.5 ? 'rgba(255,210,140,0.35)' : 'rgba(255,255,255,0.35)';
    ctx.fillRect(x, groundLine - 7 * S, 2.6 * S, 1.4 * S);
    ctx.fillStyle = nA > 0.5 ? '#2c333c' : '#5a636d';
  }

  // alternate props: bin / planter / hydrant / bench
  let pi = 0;
  for (let x = 90 * S; x < canvasW; x += 150 * S) {
    const kind = pi++ % 4;
    if (kind === 0) drawBin(ctx, x, groundLine, S, nA);
    else if (kind === 1) drawPlanter(ctx, x, groundLine, S, nA, sun);
    else if (kind === 2) drawHydrant(ctx, x, groundLine, S, nA);
    else drawBench(ctx, x, groundLine, S, nA);
  }

  // drains set into the kerb
  ctx.fillStyle = nA > 0.5 ? 'rgba(12,14,18,0.95)' : 'rgba(60,64,70,0.9)';
  for (let x = 120 * S; x < canvasW; x += 260 * S) {
    ctx.fillRect(x, roadTop - 2 * S, 14 * S, 2.4 * S);
  }
}

function drawLamp(ctx, x, baseY, S, nA) {
  const poleH = 62 * S;
  const armLen = 16 * S;
  const g = ctx.createLinearGradient(x, baseY - poleH, x, baseY);
  g.addColorStop(0, nA > 0.5 ? '#3a424c' : '#7d8794');
  g.addColorStop(1, nA > 0.5 ? '#232930' : '#5b646f');
  ctx.fillStyle = g;
  ctx.fillRect(x, baseY - poleH, 2.4 * S, poleH);
  ctx.fillRect(x, baseY - poleH, armLen, 2.2 * S);

  const lx = x + armLen;
  const ly = baseY - poleH + 2.2 * S;
  ctx.fillStyle = nA > 0.5 ? '#2a3037' : '#525b66';
  rr(ctx, lx - 5 * S, ly, 12 * S, 3 * S, 1.6 * S);
  ctx.fill();
  ctx.fillStyle = nA > 0.5 ? 'rgba(255,226,170,0.95)' : 'rgba(240,246,255,0.75)';
  ctx.fillRect(lx - 4 * S, ly + 1.4 * S, 10 * S, 1.2 * S);

  if (nA > 0.25) {
    const gl = ctx.createRadialGradient(lx, ly + 2, 2, lx, ly + 2, 34 * S);
    gl.addColorStop(0, `rgba(255,222,160,${0.30 * nA})`);
    gl.addColorStop(1, 'rgba(255,222,160,0)');
    ctx.fillStyle = gl;
    ctx.beginPath();
    ctx.arc(lx, ly + 2, 34 * S, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTree(ctx, x, baseY, S, nA, sun, i) {
  const rng = mulberry32(4000 + i * 131);
  const trunkH = (26 + rng() * 12) * S;
  const trunkW = (3.2 + rng()) * S;
  const crownR = (13 + rng() * 6) * S;
  const species = i % 3;

  // contact shadow on the pavement
  const sh = ctx.createRadialGradient(x + 4 * S, baseY + 1, 1, x + 4 * S, baseY + 1, crownR * 1.3);
  sh.addColorStop(0, 'rgba(0,0,0,0.32)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.ellipse(x + 4 * S, baseY + 1, crownR * 1.25, 3.4 * S, 0, 0, Math.PI * 2);
  ctx.fill();

  // tree pit grate
  ctx.fillStyle = nA > 0.5 ? 'rgba(20,24,28,0.9)' : 'rgba(80,84,90,0.9)';
  ctx.fillRect(x - 9 * S, baseY - 2 * S, 18 * S, 3 * S);

  // trunk with taper + a couple of branches
  const trunk = nA > 0.5 ? '#2b2118' : '#54402c';
  const trunkLit = nA > 0.5 ? '#3a2c20' : '#6b5238';
  const tg = ctx.createLinearGradient(x - trunkW, 0, x + trunkW, 0);
  tg.addColorStop(0, trunk);
  tg.addColorStop(sun < 0 ? 0.25 : 0.75, trunkLit);
  tg.addColorStop(1, trunk);
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.moveTo(x - trunkW * 0.9, baseY);
  ctx.lineTo(x - trunkW * 0.5, baseY - trunkH);
  ctx.lineTo(x + trunkW * 0.5, baseY - trunkH);
  ctx.lineTo(x + trunkW * 0.9, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = trunk;
  ctx.lineWidth = Math.max(1, 1.4 * S);
  ctx.beginPath();
  ctx.moveTo(x, baseY - trunkH * 0.72);
  ctx.lineTo(x + sun * crownR * 0.45, baseY - trunkH * 1.05);
  ctx.moveTo(x, baseY - trunkH * 0.85);
  ctx.lineTo(x - sun * crownR * 0.4, baseY - trunkH * 1.15);
  ctx.stroke();

  // canopy — layered blobs, three tones, rim light on the sun side
  const cy = baseY - trunkH - crownR * 0.35;
  const dark = nA > 0.5 ? '#16301f' : '#28502f';
  const mid = nA > 0.5 ? '#1d3d27' : '#34653a';
  const lit = nA > 0.5 ? '#2a5334' : '#4a834d';

  const blobs = [];
  if (species === 0) {
    blobs.push([0, 0, crownR], [-crownR * 0.6, crownR * 0.2, crownR * 0.72], [crownR * 0.6, crownR * 0.18, crownR * 0.7]);
  } else if (species === 1) {
    blobs.push([0, -crownR * 0.35, crownR * 0.95], [0, crownR * 0.15, crownR * 0.8], [-crownR * 0.5, 0, crownR * 0.62], [crownR * 0.5, 0, crownR * 0.6]);
  } else {
    blobs.push([-crownR * 0.35, 0, crownR * 0.8], [crownR * 0.35, -crownR * 0.1, crownR * 0.85], [0, crownR * 0.3, crownR * 0.7]);
  }

  ctx.fillStyle = dark;
  for (const [bx, by, br] of blobs) {
    ctx.beginPath();
    ctx.arc(x + bx, cy + by, br, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = mid;
  for (const [bx, by, br] of blobs) {
    ctx.beginPath();
    ctx.arc(x + bx - sun * br * 0.12, cy + by - br * 0.18, br * 0.82, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = lit;
  for (const [bx, by, br] of blobs) {
    ctx.beginPath();
    ctx.arc(x + bx + sun * br * 0.3, cy + by - br * 0.34, br * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBin(ctx, x, baseY, S, nA) {
  ctx.fillStyle = nA > 0.5 ? '#272d34' : '#4c545d';
  rr(ctx, x, baseY - 14 * S, 8 * S, 14 * S, 1.5 * S);
  ctx.fill();
  ctx.fillStyle = nA > 0.5 ? '#31383f' : '#5c656f';
  rr(ctx, x - 1 * S, baseY - 16 * S, 10 * S, 3 * S, 1.5 * S);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(x, baseY - 2 * S, 8 * S, 2 * S);
}

function drawPlanter(ctx, x, baseY, S, nA, sun) {
  ctx.fillStyle = nA > 0.5 ? '#2b3038' : '#6f7681';
  rr(ctx, x, baseY - 11 * S, 20 * S, 11 * S, 2 * S);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(x, baseY - 11 * S, 20 * S, 1);
  const g = nA > 0.5 ? '#1d3a27' : '#33663d';
  const gl = nA > 0.5 ? '#2a5236' : '#478a4f';
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i === 3 ? gl : g;
    ctx.beginPath();
    ctx.arc(x + 4 * S + i * 4.4 * S, baseY - 13 * S - (i % 2) * 2 * S, 4.4 * S, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHydrant(ctx, x, baseY, S, nA) {
  ctx.fillStyle = nA > 0.5 ? '#5a2020' : '#b03a34';
  rr(ctx, x, baseY - 10 * S, 5 * S, 10 * S, 2 * S);
  ctx.fill();
  ctx.fillRect(x - 1.2 * S, baseY - 7 * S, 7.4 * S, 2 * S);
  ctx.beginPath();
  ctx.arc(x + 2.5 * S, baseY - 11 * S, 2.6 * S, 0, Math.PI * 2);
  ctx.fill();
}

function drawBench(ctx, x, baseY, S, nA) {
  const wood = nA > 0.5 ? '#2c2318' : '#6b5033';
  const metal = nA > 0.5 ? '#232830' : '#4e565f';
  ctx.fillStyle = metal;
  ctx.fillRect(x, baseY - 7 * S, 2 * S, 7 * S);
  ctx.fillRect(x + 22 * S, baseY - 7 * S, 2 * S, 7 * S);
  ctx.fillStyle = wood;
  rr(ctx, x - 1 * S, baseY - 10 * S, 26 * S, 3.4 * S, 1 * S);
  ctx.fill();
  rr(ctx, x - 1 * S, baseY - 16 * S, 26 * S, 3 * S, 1 * S);
  ctx.fill();
}

// ── vehicles (2.5D) ────────────────────────────────────────────

export function drawCar(ctx, car, cy, nA, tick) {
  const w = car.w;
  const h = car.h;
  const dir = car.dir;
  const x = car.x + w / 2;
  const y = cy;
  const S = Math.max(0.8, Math.min(1.3, w / 54));

  ctx.save();
  ctx.translate(x, y);
  if (dir === -1) ctx.scale(-1, 1);

  const bodyTop = -h * 0.55;
  const bodyBot = 0;

  // shadow
  const sh = ctx.createLinearGradient(0, 0, 0, 6 * S);
  sh.addColorStop(0, 'rgba(0,0,0,0.42)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.ellipse(0, 2 * S, w * 0.54, 4 * S, 0, 0, Math.PI * 2);
  ctx.fill();

  // lower body
  const bg = ctx.createLinearGradient(0, bodyTop, 0, bodyBot);
  bg.addColorStop(0, mix(car.color, '#ffffff', 0.22));
  bg.addColorStop(0.45, car.color);
  bg.addColorStop(1, mix(car.color, '#000000', 0.42));
  ctx.fillStyle = bg;
  rr(ctx, -w / 2, bodyBot - h * 0.42, w, h * 0.42, 3 * S);
  ctx.fill();

  // bonnet / boot line
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(-w / 2 + 2 * S, bodyBot - h * 0.42, w - 4 * S, 1.2 * S);

  // greenhouse (cabin) with glazing
  if (car.type === 'bus') {
    ctx.fillStyle = mix(car.color, '#ffffff', 0.12);
    rr(ctx, -w / 2 + 2 * S, bodyTop, w - 4 * S, h * 0.55, 3 * S);
    ctx.fill();
    const gg = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + h * 0.5);
    gg.addColorStop(0, 'rgba(150,195,225,0.85)');
    gg.addColorStop(1, 'rgba(60,90,120,0.9)');
    ctx.fillStyle = gg;
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(-w / 2 + 5 * S + i * (w - 10 * S) / 5, bodyTop + 2 * S, (w - 10 * S) / 5 - 3 * S, h * 0.36);
    }
  } else if (car.type === 'truck') {
    ctx.fillStyle = mix(car.color, '#ffffff', 0.12);
    rr(ctx, -w / 2 + 2 * S, bodyTop, w * 0.32, h * 0.5, 2 * S);
    ctx.fill();
    ctx.fillStyle = 'rgba(140,180,210,0.85)';
    ctx.fillRect(-w / 2 + 5 * S, bodyTop + 3 * S, w * 0.24, h * 0.3);
    ctx.fillStyle = mix('#c9ccd0', '#ffffff', 0.1);
    rr(ctx, -w / 2 + w * 0.36, bodyTop - 1 * S, w * 0.62, h * 0.78, 2 * S);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-w / 2 + w * 0.36 + i * w * 0.155, bodyTop);
      ctx.lineTo(-w / 2 + w * 0.36 + i * w * 0.155, bodyTop + h * 0.72);
      ctx.stroke();
    }
  } else {
    const cabW = car.type === 'van' ? w * 0.7 : w * 0.56;
    const cabH = h * 0.5;
    ctx.fillStyle = bg;
    rr(ctx, -w * 0.34, bodyTop, cabW, cabH, 3 * S);
    ctx.fill();

    const gg = ctx.createLinearGradient(-w * 0.3, bodyTop, w * 0.2, bodyTop + cabH);
    gg.addColorStop(0, 'rgba(150,195,225,0.9)');
    gg.addColorStop(0.6, 'rgba(70,105,140,0.95)');
    gg.addColorStop(1, 'rgba(40,70,100,0.95)');
    ctx.fillStyle = gg;
    const gw = cabW - 5 * S;
    rr(ctx, -w * 0.32, bodyTop + 2 * S, gw, cabH - 5 * S, 2 * S);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.moveTo(-w * 0.3, bodyTop + 2 * S);
    ctx.lineTo(-w * 0.16, bodyTop + 2 * S);
    ctx.lineTo(-w * 0.26, bodyTop + cabH - 4 * S);
    ctx.lineTo(-w * 0.3, bodyTop + cabH - 4 * S);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = mix(car.color, '#000000', 0.3);
    ctx.fillRect(-w * 0.16, bodyTop + 2 * S, 1.4 * S, cabH - 5 * S);

    if (car.roofSign) {
      ctx.fillStyle = '#f2d98a';
      rr(ctx, -w * 0.06, bodyTop - 4 * S, w * 0.18, 4.4 * S, 1 * S);
      ctx.fill();
    }
  }

  // wheel arches + wheels
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  const wheelY = -1 * S;
  for (const wx of [-w * 0.30, w * 0.30]) {
    ctx.beginPath();
    ctx.arc(wx, wheelY, h * 0.24, Math.PI, 0);
    ctx.fill();
  }
  for (const wx of [-w * 0.30, w * 0.30]) {
    ctx.fillStyle = '#14171c';
    ctx.beginPath();
    ctx.arc(wx, wheelY, h * 0.21, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#565f6b';
    ctx.beginPath();
    ctx.arc(wx, wheelY, h * 0.098, 0, Math.PI * 2);
    ctx.fill();
  }

  // lights
  const frontX = w / 2 - 1.5 * S;
  const backX = -w / 2 + 1.5 * S;
  if (nA > 0.25) {
    const beam = ctx.createLinearGradient(frontX, 0, frontX + 70 * S, 0);
    beam.addColorStop(0, `rgba(255,240,200,${0.22 * nA})`);
    beam.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(frontX, bodyBot - h * 0.30);
    ctx.lineTo(frontX + 70 * S, bodyBot - h * 0.6);
    ctx.lineTo(frontX + 70 * S, bodyBot + h * 0.1);
    ctx.lineTo(frontX, bodyBot - h * 0.05);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = `rgba(255,244,214,${0.85 * nA + 0.15})`;
    rr(ctx, frontX - 4 * S, bodyBot - h * 0.32, 4 * S, 2.6 * S, 1 * S);
    ctx.fill();
    ctx.fillStyle = `rgba(255,60,50,${0.8 * nA + 0.2})`;
    rr(ctx, backX, bodyBot - h * 0.34, 3.4 * S, 2.6 * S, 1 * S);
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(250,250,240,0.85)';
    rr(ctx, frontX - 4 * S, bodyBot - h * 0.32, 4 * S, 2.6 * S, 1 * S);
    ctx.fill();
    ctx.fillStyle = 'rgba(200,50,44,0.9)';
    rr(ctx, backX, bodyBot - h * 0.34, 3.4 * S, 2.6 * S, 1 * S);
    ctx.fill();
  }

  ctx.restore();
}
