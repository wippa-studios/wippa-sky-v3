// ═══════════════════════════════════════════════════════════
//  Wippa Sky v2 — Sky, Weather & Background Renderer
// ═══════════════════════════════════════════════════════════

import { nightAmount } from '../constants.js';
import { drawCity } from './city.js';

// Continuous sky keyframes (0..1 day clock). Interpolated every frame so the
// palette crossfades smoothly instead of snapping between four hard phases.
const SKY_POS = [0, 0.34, 0.7, 1.0];
const SKY_KEY = [
  { t: 0.00, c: ['#080d22', '#24345b', '#c36a78', '#f7b267'] }, // dawn
  { t: 0.15, c: ['#075985', '#1795c7', '#83cce0', '#d8e8e4'] }, // day
  { t: 0.50, c: ['#075985', '#1795c7', '#83cce0', '#d8e8e4'] }, // day
  { t: 0.70, c: ['#141744', '#4c397e', '#da6671', '#f0ae67'] }, // dusk
  { t: 0.88, c: ['#030617', '#081530', '#10294b', '#1a3c5a'] }, // night
  { t: 1.00, c: ['#080d22', '#24345b', '#c36a78', '#f7b267'] }, // back to dawn
];

function skyStops(t) {
  t = Math.max(0, Math.min(1, t));
  let i = 0;
  while (i < SKY_KEY.length - 1 && t > SKY_KEY[i + 1].t) i++;
  const a = SKY_KEY[i];
  const b = SKY_KEY[Math.min(i + 1, SKY_KEY.length - 1)];
  const span = Math.max(1e-6, b.t - a.t);
  const k = Math.max(0, Math.min(1, (t - a.t) / span));
  return a.c.map((c, idx) => lerpColor(c, b.c[idx], k));
}

const GROUND_Y_OFFSET = 140;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function parseHex(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function lerpColor(hex1, hex2, t) {
  const c1 = parseHex(hex1);
  const c2 = parseHex(hex2);
  const r = Math.round(lerp(c1[0], c2[0], t));
  const g = Math.round(lerp(c1[1], c2[1], t));
  const b = Math.round(lerp(c1[2], c2[2], t));
  return `rgb(${r},${g},${b})`;
}

function lerpSkyStop(stops, pos) {
  for (let i = 0; i < stops.length - 1; i++) {
    if (pos >= stops[i][0] && pos <= stops[i + 1][0]) {
      const t = (pos - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
      return lerpColor(stops[i][1], stops[i + 1][1], t);
    }
  }
  return stops[stops.length - 1][1];
}

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ── Init ──────────────────────────────────────────────────

export function initSky(state, canvasW, canvasH) {
  state.clouds = [];
  state.stars = [];
  state.bgBuildings = [];

  const rng = seededRandom(42);

  for (let i = 0; i < 18; i++) {
    state.clouds.push({
      x: rng() * canvasW * 2 - canvasW * 0.5,
      y: 20 + rng() * 120,
      w: 100 + rng() * 200,
      h: 25 + rng() * 40,
      speed: 4 + rng() * 12,
      opacity: 0.12 + rng() * 0.18,
    });
  }

  for (let i = 0; i < 100; i++) {
    state.stars.push({
      x: rng() * canvasW,
      y: rng() * canvasH * 0.4,
      size: 0.5 + rng() * 1.5,
      twinkle: rng() * Math.PI * 2,
    });
  }

  for (let i = 0; i < 40; i++) {
    state.bgBuildings.push({
      x: i * (canvasW / 20) - 100,
      w: 20 + rng() * 50,
      h: 60 + rng() * 250,
      color: `hsl(${220 + rng() * 20}, ${10 + rng() * 15}%, ${12 + rng() * 8}%)`,
      windows: rng() > 0.3,
      windowRows: 3 + Math.floor(rng() * 10),
      windowCols: 2 + Math.floor(rng() * 3),
      layer: rng() > 0.5 ? 0 : 1,
    });
  }
}

// ── Update ────────────────────────────────────────────────

export function updateSky(state, dt, canvasW, canvasH) {
  for (let i = 0; i < state.clouds.length; i++) {
    const c = state.clouds[i];
    c.x += c.speed * dt * state.speed;
    if (c.x > canvasW + 200) {
      c.x = -c.w - 50;
    }
  }
}

// ── Draw ──────────────────────────────────────────────────

export function drawSky(ctx, state, canvasW, canvasH) {
  const p = state.dayTime;
  const reducedMotion = state.settings && state.settings.reducedMotion;

  drawSkyGradient(ctx, state, canvasW, canvasH);
  drawHorizonBloom(ctx, state, canvasW, canvasH);
  drawStars(ctx, state, canvasW, canvasH);

  if (!reducedMotion) {
    drawAurora(ctx, state, canvasW, canvasH);
  }

  drawSunMoon(ctx, state, canvasW, canvasH);
  drawClouds(ctx, state, canvasW, canvasH);
  drawCity(ctx, state, canvasW, canvasH, nightAmount(state.dayTime));
  drawHaze(ctx, state, canvasW, canvasH);
}

function drawSkyGradient(ctx, state, canvasW, canvasH) {
  const cols = skyStops(state.dayTime);
  const g = ctx.createLinearGradient(0, 0, 0, canvasH);
  for (let i = 0; i < cols.length; i++) g.addColorStop(SKY_POS[i], cols[i]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvasW, canvasH);
}

function drawHorizonBloom(ctx, state, canvasW, canvasH) {
  const p = state.dayTime;
  const horizon = ctx.createLinearGradient(0, canvasH * 0.2, 0, canvasH * 0.78);
  horizon.addColorStop(0, 'rgba(255,255,255,0)');
  horizon.addColorStop(0.7, p > 0.7 ? 'rgba(41,113,151,.08)' : 'rgba(255,225,190,.12)');
  horizon.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = horizon;
  ctx.fillRect(0, 0, canvasW, canvasH);
}

function drawStars(ctx, state, canvasW, canvasH) {
  const p = state.dayTime;
  if (p <= 0.65 && p >= 0.12) return;

  const a = p > 0.65
    ? Math.min(1, (p - 0.65) / 0.15)
    : Math.max(0, 1 - p / 0.12);

  for (let i = 0; i < state.stars.length; i++) {
    const s = state.stars[i];
    const tw = 0.5 + 0.5 * Math.sin(state.tick * 3 + s.twinkle);
    ctx.fillStyle = `rgba(218,241,255,${a * tw * 0.82})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
    ctx.fill();

    if (s.size > 1.5 && tw > 0.92) {
      ctx.strokeStyle = `rgba(200,235,255,${a * 0.35})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(s.x - 4, s.y);
      ctx.lineTo(s.x + 4, s.y);
      ctx.moveTo(s.x, s.y - 4);
      ctx.lineTo(s.x, s.y + 4);
      ctx.stroke();
    }
  }
}

function drawAurora(ctx, state, canvasW, canvasH) {
  const p = state.dayTime;
  if (p <= 0.68) return;

  const alpha = Math.min(1, (p - 0.68) / 0.12);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  for (let band = 0; band < 3; band++) {
    const yBase = 150 + band * 35;
    const r = 52 + band * 35;
    const g = 220 - band * 25;
    const b = 190 + band * 18;
    const fillAlpha = (0.075 - band * 0.012) * alpha;

    const ag = ctx.createLinearGradient(0, 80 + band * 50, canvasW, 220 + band * 50);
    ag.addColorStop(0, `rgba(49,215,196,0)`);
    ag.addColorStop(0.45, `rgba(${r},${g},${b},${fillAlpha})`);
    ag.addColorStop(1, `rgba(127,92,255,0)`);

    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.moveTo(-40, yBase);
    for (let x = -40; x <= canvasW + 40; x += 32) {
      ctx.lineTo(x, yBase + Math.sin(x * 0.008 + state.tick * 0.18 + band) * 28);
    }
    ctx.lineTo(canvasW + 40, 280 + band * 35);
    ctx.lineTo(-40, 280 + band * 35);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawSunMoon(ctx, state, canvasW, canvasH) {
  const p = state.dayTime;
  const ramp = (x, a, b) => Math.max(0, Math.min(1, (x - a) / (b - a)));

  // both fade in/out smoothly and meet at 0 on the dawn boundary (no pop)
  const sunA = Math.min(ramp(p, 0.06, 0.16), 1 - ramp(p, 0.62, 0.74));
  const moonA = Math.min(ramp(p, 0.62, 0.76), 1 - ramp(p, 0.92, 1.0));

  const orbX = canvasW * 0.1 + canvasW * 0.8 * p;
  const orbY = canvasH * 0.3 - Math.sin(p * Math.PI) * canvasH * 0.25;

  ctx.save();

  if (sunA > 0.01) {
    const R = 45;
    const sg = ctx.createRadialGradient(orbX, orbY, 0, orbX, orbY, R);
    sg.addColorStop(0, `rgba(255,250,205,${sunA})`);
    sg.addColorStop(0.25, `rgba(255,218,113,${0.92 * sunA})`);
    sg.addColorStop(1, 'rgba(255,174,75,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(orbX, orbY, R, 0, Math.PI * 2);
    ctx.fill();

    const gg = ctx.createRadialGradient(orbX, orbY, 35, orbX, orbY, 150);
    gg.addColorStop(0, `rgba(255,230,60,${0.14 * sunA})`);
    gg.addColorStop(1, 'rgba(255,230,60,0)');
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(orbX, orbY, 150, 0, Math.PI * 2);
    ctx.fill();
  }

  if (moonA > 0.01) {
    const gl = ctx.createRadialGradient(orbX, orbY, 0, orbX, orbY, 22);
    gl.addColorStop(0, `rgba(220,230,250,${moonA})`);
    gl.addColorStop(1, 'rgba(200,210,230,0)');
    ctx.fillStyle = gl;
    ctx.beginPath();
    ctx.arc(orbX, orbY, 22, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(232,244,255,${moonA})`;
    ctx.beginPath();
    ctx.arc(orbX, orbY, 10, 0, Math.PI * 2);
    ctx.fill();

    const mgl = ctx.createRadialGradient(orbX, orbY, 18, orbX, orbY, 90);
    mgl.addColorStop(0, `rgba(200,210,230,${0.1 * moonA})`);
    mgl.addColorStop(1, 'rgba(200,210,230,0)');
    ctx.fillStyle = mgl;
    ctx.beginPath();
    ctx.arc(orbX, orbY, 90, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawClouds(ctx, state, canvasW, canvasH) {
  const p = state.dayTime;
  const isNight = p > 0.7 || p < 0.12;

  for (let i = 0; i < state.clouds.length; i++) {
    const c = state.clouds[i];
    ctx.fillStyle = isNight
      ? `rgba(90,130,163,${c.opacity * 0.24})`
      : `rgba(255,255,255,${c.opacity * 0.72})`;
    drawCloudShape(ctx, c.x, c.y, c.w, c.h);
  }
}

function drawCloudShape(ctx, x, y, w, h) {
  ctx.save();
  ctx.shadowColor = 'rgba(12,36,60,.12)';
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.ellipse(x + w * 0.3, y, w * 0.3, h * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + w * 0.55, y - h * 0.15, w * 0.25, h * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + w * 0.75, y + h * 0.1, w * 0.2, h * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}


function drawHaze(ctx, state, canvasW, canvasH) {
  const horizon = canvasH - GROUND_Y_OFFSET + (state.cameraY || 0);
  const haze = ctx.createLinearGradient(0, horizon - 130, 0, horizon + 15);
  haze.addColorStop(0, 'rgba(174,212,226,0)');
  haze.addColorStop(1, 'rgba(174,212,226,.1)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, horizon - 130, canvasW, 145);
}
