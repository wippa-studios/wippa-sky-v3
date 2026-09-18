// ═══════════════════════════════════════════════════════════════
//  NEEDS — decay, mood, bands and consequences
//  Wippa Sky
// ═══════════════════════════════════════════════════════════════

import {
  MOOD_CONTENT, MOOD_ANNYED, MOOD_ANGRY, MOOD_FURIOUS,
  ELEVATOR_WAIT_STRESS_START, ELEVATOR_WAIT_STRESS_RATE,
  FURIOUS_DAYS_BEFORE_MOVEOUT, RELET_MIN_RATING, RELET_DAYS,
  FLOOR_TYPES,
} from './constants.js';
import { getCell } from './state.js';
import { beginDeparture, logComplaint, spawnSimsForCell } from './sims.js';
import { needMult } from './people.js';

const clamp = v => Math.max(0, Math.min(100, v));

// ── per-frame decay / recovery ─────────────────────────────────

export function updateNeeds(sim, state, dt) {
  const rate = dt;
  // personal habits: traits make some needs drain faster or slower
  const tm = n => needMult(sim.trait, n);

  switch (sim.activity) {
    case 'resting':
      sim.energy += 9 * rate;
      sim.food -= 0.3 * rate * tm('food');
      sim.leisure += 1.5 * rate;
      break;
    case 'eating':
      sim.food += 18 * rate;
      sim.energy += 1 * rate;
      sim.leisure += 1 * rate;
      break;
    case 'leisure':
      sim.leisure += 9 * rate;
      sim.energy -= 0.5 * rate * tm('energy');
      sim.food -= 0.4 * rate * tm('food');
      break;
    case 'working':
      sim.workNeed -= 3 * rate;
      sim.energy -= 1.0 * rate * tm('energy');
      sim.food -= 0.7 * rate * tm('food');
      sim.leisure -= 0.45 * rate * tm('leisure');
      break;
    case 'commuting':
      sim.energy -= 0.5 * rate * tm('energy');
      sim.food -= 0.5 * rate * tm('food');
      sim.leisure -= 0.35 * rate * tm('leisure');
      if (sim.kind === 'worker') sim.workNeed += 0.8 * rate * tm('work');
      break;
    default: // idle
      sim.energy -= 0.55 * rate * tm('energy');
      sim.food -= 0.6 * rate * tm('food');
      sim.leisure -= 0.5 * rate * tm('leisure');
      if (sim.kind === 'worker') sim.workNeed += 0.9 * rate * tm('work');
      break;
  }

  sim.energy = clamp(sim.energy);
  sim.food = clamp(sim.food);
  sim.leisure = clamp(sim.leisure);
  sim.workNeed = clamp(sim.workNeed);
}

// ── mood ───────────────────────────────────────────────────────

export function calculateMood(sim, state) {
  const needPenalty =
    (100 - sim.energy) * 0.30 +
    (100 - sim.food) * 0.25 +
    (100 - sim.leisure) * 0.22;

  let mood = 100 - needPenalty;

  if (sim.kind === 'worker' && sim.workNeed > 60) {
    mood -= (sim.workNeed - 60) * 0.4;
  }

  if (sim.state === 'waitingElevator' || sim.state === 'riding') {
    const waitS = state.tick - (sim.waitSince || 0);
    if (waitS > ELEVATOR_WAIT_STRESS_START) {
      mood -= (waitS - ELEVATOR_WAIT_STRESS_START) * ELEVATOR_WAIT_STRESS_RATE * 1.1;
    }
  }

  const cell = getCell(state, sim.floor, sim.col);
  if (cell) {
    const cap = FLOOR_TYPES[cell.type] ? (FLOOR_TYPES[cell.type].capacity || 0) : 0;
    // only real venues can be "crowded" — lobbies and transit are exempt
    if (cap > 0 && (cell.present || 0) > cap) mood -= 12;
  }

  mood += getAmenityScore(state, sim.floor, sim.col);
  if (sim.grudge) mood -= sim.grudge;
  if (state.mods && state.mods.mood) mood += state.mods.mood;

  sim.mood = clamp(mood);
  return sim.mood;
}

export function getAmenityScore(state, row, col) {
  let bonus = 0;
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      if (dr === 0 && dc === 0) continue;
      const cell = getCell(state, row + dr, col + dc);
      if (!cell) continue;
      const ft = FLOOR_TYPES[cell.type];
      if (ft && ft.satisfaction > 0) bonus += ft.satisfaction * 0.32;
    }
  }
  return Math.min(bonus, 18);
}

// ── bands ──────────────────────────────────────────────────────

export function getMoodBand(mood) {
  if (mood >= MOOD_CONTENT) return 'content';
  if (mood >= MOOD_ANNYED) return 'annoyed';
  if (mood >= MOOD_ANGRY) return 'angry';
  return 'furious';
}

export function getMoodColor(mood) {
  if (mood >= MOOD_CONTENT) return '#4ade80';
  if (mood >= MOOD_ANNYED) return '#fbbf24';
  if (mood >= MOOD_ANGRY) return '#f87171';
  return '#ef4444';
}

export function getMoodLabel(mood) {
  const b = getMoodBand(mood);
  return { content: 'Content', annoyed: 'Annoyed', angry: 'Angry', furious: 'Furious' }[b];
}

export function getIncomeMult(mood) {
  if (mood >= MOOD_CONTENT) return 1.15;
  if (mood >= MOOD_ANNYED) return 0.95;
  if (mood >= MOOD_ANGRY) return 0.7;
  return 0.4;
}

// ── per-cell mood → income multiplier ──────────────────────────

export function updateCellMoodAndIncome(state) {
  const acc = new Map();
  const bump = (ref, mood) => {
    if (!ref) return;
    const k = `${ref.floor},${ref.col}`;
    let a = acc.get(k);
    if (!a) { a = { sum: 0, n: 0 }; acc.set(k, a); }
    a.sum += mood; a.n++;
  };
  for (const t of state.tenants) {
    bump(t.home, t.mood);
    bump(t.work, t.mood);
  }
  for (const [key, a] of acc) {
    const [r, c] = key.split(',').map(Number);
    const cell = getCell(state, r, c);
    if (!cell) continue;
    const mean = a.sum / a.n;
    cell.happiness = mean;
    cell.incomeMult = getIncomeMult(mean);
  }
}

// ── consequences: move-outs, vacancies, re-lets ────────────────

export function applyConsequences(state) {
  // furious sims leave
  for (const sim of state.tenants) {
    if (sim.leaving) continue;
    if (sim.mood < MOOD_FURIOUS) {
      if (sim._furiousDay == null) sim._furiousDay = state.day;
      else if (state.day - sim._furiousDay >= FURIOUS_DAYS_BEFORE_MOVEOUT) {
        const isWorker = sim.kind === 'worker';
        beginDeparture(sim, state, isWorker ? 'quit' : 'moveout');
        state.stats.moveOuts = (state.stats.moveOuts || 0) + 1;
        logComplaint(state, sim, isWorker ? 'worker quit' : 'resident moved out');
      }
    } else {
      sim._furiousDay = null;
    }
  }

  // residential vacancy + re-let
  for (const [row, cells] of state.grid) {
    for (let c = 0; c < state.cols; c++) {
      const cell = cells[c];
      if (!cell) continue;
      if (cell.type !== 'residence' && cell.type !== 'hotel') continue;

      const occ = cell.occupancy || 0;
      if (occ > 0) {
        cell._everOccupied = true;
        if (cell.vacant) { cell.vacant = false; cell.vacantSince = 0; }
        continue;
      }
      if (!cell._everOccupied || cell.built >= state.day) continue;
      if (!cell.vacant) {
        cell.vacant = true;
        cell.vacantSince = state.day;
        state._uiHooks && state._uiHooks.event && state._uiHooks.event(`${cell.type === 'hotel' ? 'Hotel' : 'Residence'} empty on ${floorLabel(row)}`, 'warning');
        continue;
      }
      // re-let
      if (state.day - cell.vacantSince >= RELET_DAYS &&
          state.rating >= RELET_MIN_RATING &&
          Math.random() < 0.4) {
        cell.vacant = false;
        cell.vacantSince = 0;
        spawnSimsForCell(state, row, c, cell.type);
        state.stats.moveIns = (state.stats.moveIns || 0) + 1;
        state._uiHooks && state._uiHooks.event && state._uiHooks.event(`New tenants on ${floorLabel(row)}`, 'income');
      }
    }
  }
}

export function shouldMoveOut(sim, state) {
  if (sim.mood >= MOOD_FURIOUS) { sim._furiousDay = null; return false; }
  if (sim._furiousDay == null) sim._furiousDay = state.day;
  return state.day - sim._furiousDay >= FURIOUS_DAYS_BEFORE_MOVEOUT;
}

export function shouldRelet(state, cell) {
  if (!cell.vacant) return false;
  if (state.day - (cell.vacantSince || 0) < RELET_DAYS) return false;
  if (state.rating < RELET_MIN_RATING) return false;
  return Math.random() < 0.4;
}

// ── queries used by the HUD ────────────────────────────────────

export function getCellHappiness(state, row, col) {
  const cell = getCell(state, row, col);
  if (cell && typeof cell.happiness === 'number' && cell.happiness > 0) return cell.happiness;
  const sims = state.tenants.filter(t => t.floor === row && t.col === col);
  if (sims.length === 0) return 70;
  return sims.reduce((s, t) => s + t.mood, 0) / sims.length;
}

export function getCellWaitingStats(state, row, col) {
  const sims = state.tenants.filter(
    t => t.floor === row && t.col === col && t.state === 'waitingElevator'
  );
  if (sims.length === 0) return { count: 0, avgWait: 0 };
  const waits = sims.map(t => state.tick - t.waitSince);
  return { count: sims.length, avgWait: waits.reduce((a, b) => a + b, 0) / waits.length };
}

export function getCityHappiness(state) {
  if (state.tenants.length === 0) return 70;
  let sum = 0;
  for (const t of state.tenants) sum += t.mood;
  return sum / state.tenants.length;
}

function floorLabel(row) {
  return row < 0 ? 'B' + Math.abs(row) : 'F' + (row + 1);
}
