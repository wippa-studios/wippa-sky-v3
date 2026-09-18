// ═══════════════════════════════════════════════════════════════
//  CONTRACTS — objectives, progression and rank
//
//  The sandbox becomes a game: the tower board always offers up to three
//  live contracts drawn from a pool that unlocks as the tower grows. Each
//  has live progress, a reward, and some have deadlines.
// ═══════════════════════════════════════════════════════════════

import { getAllCellsOfType } from './grid.js';
import { getCityHappiness } from './needs.js';

const clamp01 = v => Math.max(0, Math.min(1, v));
const count = (state, type) => getAllCellsOfType(state, type).length;
const cellsOf = (state, types) => types.reduce((n, t) => n + count(state, t), 0);

// ── the pool ───────────────────────────────────────────────────

const DEFS = [
  {
    id: 'green_cert', icon: '🌿', title: 'Green Certificate',
    desc: 'Keep tower happiness at 72% or better for 3 days.',
    reward: { money: 90000 },
    tick(state, c) { c.streak = getCityHappiness(state) >= 72 ? c.streak + 1 : 0; },
    progress(state, c) { return clamp01(c.streak / 3); },
    label(state, c) { return `${Math.min(c.streak, 3)}/3 days`; },
    done(state, c) { return c.streak >= 3; },
  },
  {
    id: 'vertical_village', icon: '🏘️', title: 'Vertical Village',
    desc: 'Reach 120 residents, workers and guests in the tower.',
    minPop: 40, reward: { money: 120000 },
    progress(state) { return clamp01(state.population / 120); },
    label(state) { return `${state.population}/120 people`; },
    done(state) { return state.population >= 120; },
  },
  {
    id: 'skyline', icon: '🏗️', title: 'Skyline Contractor',
    desc: 'Build up to 20 occupied floors.',
    minFloors: 6, reward: { money: 90000 },
    progress(state) { return clamp01(state.highestFloor / 20); },
    label(state) { return `${state.highestFloor}/20 floors`; },
    done(state) { return state.highestFloor >= 20; },
  },
  {
    id: 'express_service', icon: '🔼', title: 'Express Service',
    desc: 'Get p95 lift wait under 15s with 60+ people.',
    minPop: 40, reward: { money: 140000 },
    progress(state) {
      if (state.population < 60) return clamp01(state.population / 60) * 0.5;
      return clamp01(1 - (state.stats.p95Wait || 0) / 30);
    },
    label(state) {
      return state.population < 60
        ? `${state.population}/60 people`
        : `p95 ${Math.round(state.stats.p95Wait || 0)}s / 15s`;
    },
    done(state) { return state.population >= 60 && (state.stats.p95Wait || 0) > 0 && state.stats.p95Wait <= 15; },
  },
  {
    id: 'hotelier', icon: '🏬', title: 'The Hotelier',
    desc: 'House 16 hotel guests at once.',
    reward: { money: 110000 },
    progress(state) { return clamp01(state.tenants.filter(t => t.kind === 'guest').length / 16); },
    label(state) { return `${state.tenants.filter(t => t.kind === 'guest').length}/16 guests`; },
    done(state) { return state.tenants.filter(t => t.kind === 'guest').length >= 16; },
  },
  {
    id: 'retail_empire', icon: '🛒', title: 'Retail Empire',
    desc: 'Operate 14 shops, restaurants and cafés.',
    reward: { money: 100000 },
    progress(state) { return clamp01(cellsOf(state, ['shop', 'restaurant']) / 14); },
    label(state) { return `${cellsOf(state, ['shop', 'restaurant'])}/14 venues`; },
    done(state) { return cellsOf(state, ['shop', 'restaurant']) >= 14; },
  },
  {
    id: 'deep_dig', icon: '⛏️', title: 'Deep Foundations',
    desc: 'Dig down to B3 and keep the tower profitable.',
    reward: { money: 85000 },
    progress(state) { return clamp01(Math.abs(Math.min(0, state.basementDepth)) / 3); },
    label(state) { return `B${Math.abs(Math.min(0, state.basementDepth))}/B3`; },
    done(state) { return state.basementDepth <= -3 && (state.net || 0) > 0; },
  },
  {
    id: 'transit_hub', icon: '🚇', title: 'Transit Oriented',
    desc: 'Open a subway station serving 300+ people.',
    minPop: 120, reward: { money: 260000 },
    progress(state) { return clamp01((count(state, 'subway') ? 0.5 : 0) + 0.5 * state.population / 300); },
    label(state) { return count(state, 'subway') ? `${state.population}/300 riders` : 'no subway yet'; },
    done(state) { return count(state, 'subway') >= 1 && state.population >= 300; },
  },
  {
    id: 'five_star', icon: '⭐', title: 'Five Star Tower',
    desc: 'Earn a 5-star rating.',
    minFloors: 4, reward: { money: 200000 },
    progress(state) { return clamp01((state.rating - 1) / 4); },
    label(state) { return `rating ${state.rating}/5`; },
    done(state) { return state.rating >= 5; },
  },
  {
    id: 'quiet_week', icon: '🤫', title: 'A Quiet Week',
    desc: 'Finish a week with zero complaints.',
    minFloors: 3, days: 8, reward: { money: 130000 },
    progress(state) { return clamp01((state.weekAccumulator || 0) / 5); },
    label(state) { return `${Math.min(state.weekAccumulator || 0, 5)}/5 quiet days`; },
    done(state) { return (state.stats.complaintsThisWeek || 0) === 0 && (state.weekAccumulator || 0) >= 5; },
  },
  {
    id: 'oasis', icon: '🌴', title: 'Urban Oasis',
    desc: 'Build 8 parks, cinemas and spas, and keep people happy.',
    reward: { money: 120000 },
    progress(state) { return clamp01((cellsOf(state, ['park', 'cinema', 'spa']) / 8) * 0.7 + 0.3 * clamp01(getCityHappiness(state) / 70)); },
    label(state) { return `${cellsOf(state, ['park', 'cinema', 'spa'])}/8 amenities`; },
    done(state) { return cellsOf(state, ['park', 'cinema', 'spa']) >= 8 && getCityHappiness(state) >= 65; },
  },
  {
    id: 'night_city', icon: '🌃', title: 'Night City',
    desc: 'Reach 60 residents with a lively night-life district.',
    minPop: 40, reward: { money: 150000 },
    progress(state) { return clamp01(state.tenants.filter(t => t.kind === 'resident').length / 60); },
    label(state) { return `${state.tenants.filter(t => t.kind === 'resident').length}/60 residents`; },
    done(state) { return state.tenants.filter(t => t.kind === 'resident').length >= 60 && cellsOf(state, ['cinema', 'spa', 'restaurant']) >= 6; },
  },
];

const MAX_ACTIVE = 3;

const RANKS = [
  { min: 0, name: 'Founder', icon: '🪧' },
  { min: 2, name: 'Developer', icon: '🧱' },
  { min: 5, name: 'Architect', icon: '📐' },
  { min: 9, name: 'Master Builder', icon: '🏛️' },
  { min: 14, name: 'Skyline Legend', icon: '👑' },
];

export function defOf(id) { return DEFS.find(d => d.id === id) || null; }

export function initContracts(state) {
  if (!state.contracts) {
    state.contracts = { active: [], completed: 0, failed: 0, history: [], total: 0 };
  }
  if (!state.contracts.history) state.contracts.history = [];
}

function seen(state, id) { return state.contracts.history.some(h => h.id === id); }

export function offerContract(state) {
  const c = state.contracts;
  const pool = DEFS.filter(d =>
    !c.active.some(a => a.id === d.id) &&
    !seen(state, d.id) &&
    state.highestFloor >= (d.minFloors || 0) &&
    state.population >= (d.minPop || 0)
  );
  if (pool.length === 0) return null;
  const d = pool[Math.floor(Math.random() * pool.length)];
  c.active.push({ id: d.id, startedDay: state.day, streak: 0, daysLeft: d.days || null, progress: 0, label: '' });
  c.total++;
  return d;
}

export function refreshContractLabels(state) {
  for (const inst of state.contracts.active) {
    const def = defOf(inst.id);
    if (!def) continue;
    inst.progress = def.progress(state, inst);
    inst.label = def.label(state, inst);
  }
}

// Called once per game-day: deadlines.
export function contractsOnDay(state) {
  const out = { failed: [] };
  for (let i = state.contracts.active.length - 1; i >= 0; i--) {
    const inst = state.contracts.active[i];
    if (inst.daysLeft == null) continue;
    inst.daysLeft--;
    if (inst.daysLeft <= 0) {
      const def = defOf(inst.id);
      state.contracts.active.splice(i, 1);
      state.contracts.failed++;
      out.failed.push(def);
    }
  }
  return out;
}

// Called ~1/s: offer + evaluate.
export function updateContracts(state) {
  const c = state.contracts;
  if (!c) return { completed: [] };

  while (c.active.length < MAX_ACTIVE) {
    if (!offerContract(state)) break;
  }

  const completed = [];
  for (let i = c.active.length - 1; i >= 0; i--) {
    const inst = c.active[i];
    const def = defOf(inst.id);
    if (!def) { c.active.splice(i, 1); continue; }
    inst.progress = def.progress(state, inst);
    inst.label = def.label(state, inst);
    if (def.done(state, inst)) {
      c.active.splice(i, 1);
      c.completed++;
      c.history.push({ id: def.id, day: state.day });
      if (def.reward && def.reward.money) state.money += def.reward.money;
      completed.push(def);
    }
  }
  return { completed };
}

export function rankOf(state) {
  const n = state.contracts ? state.contracts.completed : 0;
  let r = RANKS[0];
  for (const k of RANKS) if (n >= k.min) r = k;
  return r;
}

export function contractDefs() { return DEFS; }
