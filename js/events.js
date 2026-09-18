// ═══════════════════════════════════════════════════════════════
//  EVENTS — Wippa News, world events, and the director
//
//  The director reads tower stress (waits, complaints, mood, vacancies)
//  and schedules events with intent: pressure when the tower is coasting,
//  relief when the player is drowning, and colour in between. It is a
//  dynamic-difficulty system for a management game.
// ═══════════════════════════════════════════════════════════════

import { getAllCellsOfType } from './grid.js';
import { getCityHappiness } from './needs.js';
import { createSim } from './sims.js';
import { weatherMods } from './weather.js';

const clamp01 = v => Math.max(0, Math.min(1, v));

const MAX_NEWS = 60;

export function initEvents(state) {
  state.news = [];
  state.events = { active: [], lastAt: -999, cooldown: 12 };
  state.director = { stress: 0, mode: 'steady', check: 0 };
  state.mods = { mood: 0, expenseMult: 1, visitorMult: 1, parkDemand: 1, indoorDemand: 1 };
}

export function pushNews(state, text, kind = 'info') {
  if (!state.news) state.news = [];
  state.news.unshift({ day: state.day, text, kind, id: `${state.day}-${Math.random().toString(36).slice(2, 7)}` });
  if (state.news.length > MAX_NEWS) state.news.length = MAX_NEWS;
  if (state._uiHooks && state._uiHooks.news) state._uiHooks.news(state.news[0]);
}

// ── event definitions ──────────────────────────────────────────

const EVENTS = [
  {
    id: 'power_outage', icon: '⚡', name: 'Power Outage', dur: 0.5, kind: 'challenge',
    mods: { mood: -8, indoorDemand: -0.2 },
    start(state) { pushNews(state, '⚡ Power outage — lifts and lighting are struggling on several floors.', 'bad'); },
    end(state) { pushNews(state, '🔌 Power restored. Engineers traced a failed substation.', 'good'); },
  },
  {
    id: 'inspection', icon: '📋', name: 'City Inspection', dur: 0, kind: 'challenge',
    start(state) {
      const complaints = state.stats.complaintsThisWeek || 0;
      if (complaints > 12) {
        state.money -= 30000;
        pushNews(state, `📋 Inspection failed — ${complaints} outstanding complaints. Fine $30,000.`, 'bad');
      } else {
        state.money += 15000;
        pushNews(state, '📋 Inspection passed with distinction. Grant $15,000.', 'good');
      }
    },
  },
  {
    id: 'celebrity', icon: '⭐', name: 'Celebrity Visit', dur: 0.5, kind: 'relief',
    mods: { mood: 7, visitorMult: 0.35, indoorDemand: 0.3 },
    start(state) {
      pushNews(state, '⭐ A celebrity checked in — the paparazzi are already on the pavement.', 'good');
      spawnGuest(state, 'VIP Guest', '🌟');
    },
    end(state) { pushNews(state, '⭐ The celebrity checked out. Tips were generous.', 'good'); },
  },
  {
    id: 'grant', icon: '💰', name: 'Development Grant', dur: 0, kind: 'relief',
    start(state) {
      state.money += 45000;
      pushNews(state, '💰 The city awarded a $45,000 development grant for the tower programme.', 'good');
    },
  },
  {
    id: 'rush', icon: '🚦', name: 'Rush Hour Surge', dur: 0.4, kind: 'challenge',
    mods: { visitorMult: 0.6, mood: -2 },
    start(state) { pushNews(state, '🚦 A downtown event is flooding the lobby — expect heavy lift traffic.', 'warn'); },
    end(state) { pushNews(state, '🚦 The crowds have dispersed.', 'info'); },
  },
  {
    id: 'festival', icon: '🎉', name: 'Street Festival', dur: 1, kind: 'relief',
    mods: { mood: 5, indoorDemand: 0.4, visitorMult: 0.25 },
    start(state) { pushNews(state, '🎉 A street festival is running below — the tower is buzzing.', 'good'); },
    end(state) { pushNews(state, '🎉 The festival packed up overnight.', 'info'); },
  },
  {
    id: 'heatwave', icon: '🔥', name: 'Heatwave', dur: 1.5, kind: 'challenge',
    mods: { mood: -3, parkDemand: 0.9, expenseMult: 0.12 },
    start(state) { pushNews(state, '🔥 Heatwave — cooling costs are up and the parks are packed.', 'warn'); },
    end(state) { pushNews(state, '🔥 The heatwave broke.', 'info'); },
  },
];

function defOf(id) { return EVENTS.find(e => e.id === id) || null; }

function spawnGuest(state, name, bubble) {
  const sim = createSim(0, 2, 'guest', state);
  sim.name = name;
  sim.bubble = bubble || '⭐';
  sim.bubbleTimer = 6;
  sim.mood = 95;
  state.tenants.push(sim);
  return sim;
}

// ── mods bus ───────────────────────────────────────────────────

function eventMods(state) {
  const m = { mood: 0, expenseMult: 1, visitorMult: 1, parkDemand: 1, indoorDemand: 1 };
  for (const a of state.events.active) {
    const d = defOf(a.id);
    if (!d || !d.mods) continue;
    m.mood += d.mods.mood || 0;
    m.expenseMult += d.mods.expenseMult || 0;
    m.visitorMult += d.mods.visitorMult || 0;
    m.parkDemand += d.mods.parkDemand || 0;
    m.indoorDemand += d.mods.indoorDemand || 0;
  }
  return m;
}

export function recomputeMods(state) {
  const e = eventMods(state);
  const w = weatherMods(state);
  state.mods = {
    mood: e.mood + w.mood,
    expenseMult: Math.max(0.2, e.expenseMult * w.expenseMult),
    visitorMult: Math.max(0.1, e.visitorMult * w.visitorMult),
    parkDemand: Math.max(0.05, e.parkDemand * w.parkDemand),
    indoorDemand: Math.max(0.2, e.indoorDemand * w.indoorDemand),
  };
  return state.mods;
}

// ── the director ───────────────────────────────────────────────

export function towerStress(state) {
  const waits = clamp01((state.stats.p95Wait || 0) / 45);
  const complaints = clamp01((state.stats.complaintsThisWeek || 0) / 20);
  const mood = clamp01((72 - getCityHappiness(state)) / 72);
  let vacant = 0;
  for (const [, cells] of state.grid) for (let c = 0; c < state.cols; c++) if (cells[c] && cells[c].vacant) vacant++;
  const vac = clamp01(vacant / 12);
  const cash = state.money < 0 ? 1 : clamp01((60000 - state.money) / 60000) * 0.5;
  return clamp01(waits * 0.32 + complaints * 0.22 + mood * 0.22 + vac * 0.14 + cash * 0.10);
}

function startEvent(state, def) {
  const inst = { id: def.id, daysLeft: def.dur || 0 };
  state.events.active.push(inst);
  state.events.lastAt = state.day;
  if (def.start) def.start(state);
  if (def.dur > 0) {
    pushNews(state, `${def.icon} ${def.name} begins.`, def.kind === 'challenge' ? 'warn' : 'good');
  }
}

export function directorTick(state) {
  const d = state.director;
  d.stress = towerStress(state);
  const mode = d.stress > 0.6 ? 'drowning' : d.stress < 0.25 ? 'calm' : 'steady';
  const changed = mode !== d.mode;
  d.mode = mode;

  if (changed) {
    const line = {
      calm: '🛰️ Operations are running smooth. The board is pleased.',
      steady: '📊 Steady as she goes — a few grumbles in the lift queue.',
      drowning: '🚨 The board is concerned about service levels.',
    }[mode];
    if (line) pushNews(state, line, mode === 'drowning' ? 'warn' : 'info');
  }

  if (state.events.cooldown > 0) { state.events.cooldown--; return; }
  if (state.events.active.length > 0) return;
  if (state.day - state.events.lastAt < 1) return;

  let pool;
  if (mode === 'calm') pool = EVENTS.filter(e => e.kind === 'challenge');
  else if (mode === 'drowning') pool = EVENTS.filter(e => e.kind === 'relief');
  else pool = EVENTS;
  const chance = mode === 'calm' ? 0.55 : mode === 'drowning' ? 0.5 : 0.32;
  if (Math.random() > chance || pool.length === 0) { state.events.cooldown = 10; return; }

  startEvent(state, pool[Math.floor(Math.random() * pool.length)]);
  state.events.cooldown = 25 + Math.floor(Math.random() * 35);
}

export function eventsOnDay(state) {
  // expire timed events
  for (let i = state.events.active.length - 1; i >= 0; i--) {
    const a = state.events.active[i];
    const def = defOf(a.id);
    if (a.daysLeft > 0) a.daysLeft -= 1;
    if (a.daysLeft <= 0) {
      state.events.active.splice(i, 1);
      if (def && def.end) def.end(state);
    }
  }
}

export function activeEventNames(state) {
  return state.events.active.map(a => {
    const d = defOf(a.id);
    return d ? `${d.icon} ${d.name}` : a.id;
  });
}

export function eventDefs() { return EVENTS; }
