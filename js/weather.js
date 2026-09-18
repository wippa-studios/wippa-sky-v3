// ═══════════════════════════════════════════════════════════════
//  WEATHER — a world state that changes the look AND the sim
//
//  clear / overcast / rain / storm / snow / fog, with smooth
//  cross-fades. Publishes a mod bundle the rest of the sim reads:
//  mood, expense multiplier, visitor appetite, park vs indoor demand.
// ═══════════════════════════════════════════════════════════════

export const TYPES = {
  clear:  { icon: '☀️', label: 'Clear',    wet: 0,    snow: 0, fog: 0.0,  cloud: 0.20, rain: 0,   flakes: 0 },
  cloudy: { icon: '☁️', label: 'Overcast', wet: 0.18, snow: 0, fog: 0.10, cloud: 0.95, rain: 0,   flakes: 0 },
  rain:   { icon: '🌧️', label: 'Rain',     wet: 1.0,  snow: 0, fog: 0.28, cloud: 0.85, rain: 1,   flakes: 0 },
  storm:  { icon: '⛈️', label: 'Storm',    wet: 1.0,  snow: 0, fog: 0.34, cloud: 1.0,  rain: 1.7, flakes: 0, lightning: true },
  snow:   { icon: '❄️', label: 'Snow',     wet: 0.35, snow: 1, fog: 0.22, cloud: 0.80, rain: 0,   flakes: 1 },
  fog:    { icon: '🌫️', label: 'Fog',      wet: 0.55, snow: 0, fog: 1.0,  cloud: 0.45, rain: 0,   flakes: 0 },
};

// rough Markov weights from each state
const NEXT = {
  clear:  [['clear', 3], ['cloudy', 4], ['fog', 1], ['rain', 1]],
  cloudy: [['cloudy', 2], ['clear', 2], ['rain', 3], ['storm', 1], ['fog', 1]],
  rain:   [['rain', 2], ['cloudy', 2], ['storm', 2], ['clear', 1]],
  storm:  [['rain', 3], ['cloudy', 2], ['clear', 1]],
  snow:   [['snow', 2], ['cloudy', 2], ['fog', 1], ['clear', 1]],
  fog:    [['fog', 1], ['cloudy', 2], ['clear', 2], ['rain', 1]],
};

const IDLE = { mood: 0, expenseMult: 1, visitorMult: 1, parkDemand: 1, indoorDemand: 1 };

export const WEATHER_SEASON = 'temperate';

export function initWeather(state) {
  if (state.weather) return;
  state.weather = {
    type: 'clear', prev: 'clear', blend: 1, daysLeft: 3,
    wet: 0, snow: 0, fog: 0, cloud: 0.2, rain: 0, flakes: 0,
    drops: [], flakesArr: [], flash: 0, nextFlash: 6,
  };
  fillParticles(state);
}

function pickNext(type) {
  const row = NEXT[type] || NEXT.clear;
  const total = row.reduce((s, r) => s + r[1], 0);
  let roll = Math.random() * total;
  for (const [t, w] of row) { roll -= w; if (roll <= 0) return t; }
  return 'clear';
}

export function weatherOnDay(state) {
  const w = state.weather;
  if (!w) return null;
  w.daysLeft--;
  if (w.daysLeft > 0) return null;
  const t = pickNext(w.type);
  w.prev = w.type;
  w.type = t;
  w.blend = 0;
  w.daysLeft = 2 + Math.floor(Math.random() * 4);
  return t;
}

function copyParticles(src, dst) {
  for (let i = 0; i < src.length; i++) dst.push({ ...src[i] });
}

function fillParticles(state) {
  const w = state.weather;
  const W = (state.canvasW || 1280) + 200;
  const H = (state.canvasH || 800) + 200;
  for (let i = 0; i < 420; i++) {
    w.drops.push({ x: Math.random() * W - 100, y: Math.random() * H, l: 10 + Math.random() * 16, s: 520 + Math.random() * 380 });
  }
  for (let i = 0; i < 260; i++) {
    w.flakesArr.push({ x: Math.random() * W - 100, y: Math.random() * H, r: 1 + Math.random() * 2.2, s: 26 + Math.random() * 46, ph: Math.random() * 6.28 });
  }
}

const lerp = (a, b, t) => a + (b - a) * t;

export function updateWeather(state, dt) {
  if (!state.weather) initWeather(state);
  const w = state.weather;
  const A = TYPES[w.prev] || TYPES.clear;
  const B = TYPES[w.type] || TYPES.clear;
  const k = Math.max(0, Math.min(1, w.blend + dt * (state.speed || 1) * 0.25));
  w.blend = k;

  w.wet = lerp(A.wet, B.wet, k);
  w.snow = lerp(A.snow, B.snow, k);
  w.fog = lerp(A.fog, B.fog, k);
  w.cloud = lerp(A.cloud, B.cloud, k);
  w.rain = lerp(A.rain, B.rain, k);
  w.flakes = lerp(A.flakes, B.flakes, k);

  // particles (visual time, not game time)
  const W = state.canvasW || 1280, H = state.canvasH || 800;
  const wind = 60 + 40 * Math.sin((state.tick || 0) * 0.05);
  for (const d of w.drops) {
    d.y += d.s * dt;
    d.x += wind * dt;
    if (d.y > H + 40) { d.y = -40; d.x = Math.random() * (W + 200) - 100; }
    if (d.x > W + 100) d.x = -100;
  }
  for (const f of w.flakesArr) {
    f.y += f.s * dt;
    f.x += (Math.sin((state.tick || 0) * 0.6 + f.ph) * 22 + 18) * dt;
    if (f.y > H + 20) { f.y = -20; f.x = Math.random() * (W + 200) - 100; }
    if (f.x > W + 100) f.x = -100;
  }

  // lightning
  if ((TYPES[w.type] || {}).lightning && k > 0.6) {
    w.nextFlash -= dt;
    if (w.nextFlash <= 0) { w.flash = 1; w.nextFlash = 4 + Math.random() * 9; }
  }
  if (w.flash > 0) w.flash = Math.max(0, w.flash - dt * 3.2);
}

export function weatherMods(state) {
  const w = state.weather;
  if (!w) return IDLE;
  let mood = 0, expenseMult = 1, visitorMult = 1, parkDemand = 1, indoorDemand = 1;
  if (w.wet > 0.35) {
    mood -= 4 * w.wet;
    expenseMult += 0.06 * w.wet;
    visitorMult -= 0.28 * w.wet;
    parkDemand -= 0.65 * w.wet;
    indoorDemand += 0.55 * w.wet;
  }
  if (w.snow > 0.35) {
    mood -= 3.5 * w.snow;
    expenseMult += 0.16 * w.snow;      // heating
    parkDemand -= 0.95 * w.snow;
    indoorDemand += 0.45 * w.snow;
    visitorMult -= 0.15 * w.snow;
  }
  if (w.fog > 0.7) { visitorMult -= 0.15; mood -= 1.5; }
  return { mood, expenseMult, visitorMult, parkDemand, indoorDemand };
}

export function weatherInfo(state) {
  const w = state.weather || { type: 'clear' };
  const t = TYPES[w.type] || TYPES.clear;
  return { icon: t.icon, label: t.label, type: w.type };
}
