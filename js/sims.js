// ═══════════════════════════════════════════════════════════════
//  SIMS — tenants, movement, and the trip state machine
//  Wippa Sky
//
//  Sims walk continuously across cells, queue at elevator shafts,
//  ride cars (driven by dispatch.js) and alight via the
//  `simAlightedOnFloor` hook.
// ═══════════════════════════════════════════════════════════════

import { FLOOR_TYPES, mulberry32, CELL_W } from './constants.js';
import { cellToScreenPerspective, cellToScreenLocal } from './grid.js';
import { getCell } from './state.js';
import { planItinerary } from './pathfind.js';
import { registerWaiting, unregisterWaiting, callShaft, hasPendingCall } from './dispatch.js';
import { makePerson, traitOf, prefers } from './people.js';

let _nextSimId = 1;

const WALK_SPEED = 1.4;       // cells per second
const CLIMB_STRESS = 0.5;

// ═══════════════════════════════════════════
//  CREATION
// ═══════════════════════════════════════════

export function createSim(floor, col, kind, state) {
  const rng = mulberry32(floor * 1000 + col * 97 + _nextSimId * 31);
  const id = _nextSimId++;
  const skinTones = ['#f7c99b', '#d99a73', '#8d5524', '#f0b27a', '#c68642'];
  const hairColors = ['#24180f', '#573b2a', '#18202b', '#c27a48', '#4a3728'];
  const shirtHues = [0, 18, 42, 60, 96, 140, 168, 200, 220, 248, 280, 320, 345];
  const hue = shirtHues[Math.floor(rng() * shirtHues.length)];

  const isWorker = kind === 'worker';
  const person = makePerson(rng);
  return {
    id, kind,
    name: person.name,
    trait: person.trait,
    home: (kind === 'resident' || kind === 'guest') ? { floor, col } : null,
    work: isWorker ? { floor, col } : null,
    floor, col,
    x: 0.25 + rng() * 0.5,
    walkTargetCol: col,
    walkTargetX: 0.2 + rng() * 0.6,
    speed: WALK_SPEED * (0.85 + rng() * 0.3),
    state: 'idle',
    stateTimer: 1 + rng() * 4,
    activity: 'idle',
    mood: 70 + rng() * 15,
    energy: 55 + rng() * 35,
    food: 45 + rng() * 45,
    leisure: 40 + rng() * 45,
    workNeed: isWorker ? 40 + rng() * 40 : 0,
    patience: 100,
    waitSince: 0,
    complaints: 0,
    grudge: 0,
    itinerary: null,
    legIndex: 0,
    routePhase: null,
    _furiousDay: null,
    _noRouteCooldown: 0,
    _shiftJitter: rng() * 0.28,
    ridingCar: null,
    color: `hsl(${hue}, 58%, 62%)`,
    skin: skinTones[Math.floor(rng() * skinTones.length)],
    hair: hairColors[Math.floor(rng() * hairColors.length)],
    direction: rng() > 0.5 ? 1 : -1,
    targetFloor: floor,
    targetCol: col,
    bubble: '',
    bubbleTimer: 0,
  };
}

export function spawnSimsForCell(state, row, col, type) {
  const ft = FLOOR_TYPES[type];
  if (!ft) return;

  const push = (kind) => {
    const sim = createSim(row, col, kind, state);
    state.tenants.push(sim);
    return sim;
  };

  if (type === 'residence') {
    const n = Math.max(1, (ft.capacity || 4) - 1);
    for (let i = 0; i < n; i++) {
      const s = push('resident');
      s.x = 0.15 + (i / n) * 0.7;
      s.walkTargetX = s.x;
    }
  } else if (type === 'hotel') {
    const n = Math.max(1, ft.capacity || 2);
    for (let i = 0; i < n; i++) {
      const s = push('guest');
      s.x = 0.3 + i * 0.35;
      s.walkTargetX = s.x;
    }
  } else if (type === 'office') {
    const n = Math.min(3, ft.staffCapacity || 3);
    for (let i = 0; i < n; i++) push('worker');
  } else if (['shop', 'restaurant', 'cinema', 'spa'].includes(type)) {
    push('worker');
  }
}

export function removeSimsForCell(state, row, col) {
  const keep = [];
  for (const t of state.tenants) {
    const assigned = (t.home && t.home.floor === row && t.home.col === col) ||
      (t.work && t.work.floor === row && t.work.col === col);
    if (!assigned) keep.push(t);
  }
  state.tenants.length = 0;
  for (const t of keep) state.tenants.push(t);
}

export function getSimCount(state) { return state.tenants.length; }

export function getSimCountByKind(state, kind) {
  let n = 0;
  for (const t of state.tenants) if (t.kind === kind) n++;
  return n;
}

export function getResidentCount(state) {
  let n = 0;
  for (const t of state.tenants) if (t.kind === 'resident' || t.kind === 'guest') n++;
  return n;
}

// ═══════════════════════════════════════════
//  VENUE INDEX (rebuilt once per second)
// ═══════════════════════════════════════════

export function rebuildVenues(state) {
  const v = { homes: [], hotels: [], offices: [], food: [], shops: [], leisure: [], transit: [] };
  for (const [row, cells] of state.grid) {
    for (let c = 0; c < state.cols; c++) {
      const cell = cells[c];
      if (!cell) continue;
      const ref = { floor: row, col: c };
      switch (cell.type) {
        case 'residence': if (!cell.vacant) v.homes.push(ref); break;
        case 'hotel': if (!cell.vacant) v.hotels.push(ref); break;
        case 'office': if (!cell.vacant) v.offices.push(ref); break;
        case 'restaurant': v.food.push(ref); break;
        case 'shop': v.shops.push(ref); break;
        case 'park': case 'cinema': case 'spa': v.leisure.push(ref); break;
        case 'skyLobby': case 'lobby': case 'basementLobby':
        case 'subway': case 'parking': v.transit.push(ref); break;
      }
    }
  }
  state._venues = v;
  return v;
}

// ═══════════════════════════════════════════
//  OCCUPANCY / POPULATION SYNC (once per second)
// ═══════════════════════════════════════════

export function syncOccupancy(state) {
  for (const [, cells] of state.grid) {
    for (let c = 0; c < state.cols; c++) {
      const cell = cells[c];
      if (!cell) continue;
      cell.occupancy = 0;
      cell.staff = 0;
      cell.present = 0;
    }
  }
  for (const t of state.tenants) {
    if (t.home) {
      const hc = getCell(state, t.home.floor, t.home.col);
      if (hc) hc.occupancy++;
    }
    if (t.work) {
      const wc = getCell(state, t.work.floor, t.work.col);
      if (wc) { wc.occupancy++; wc.staff++; }
    }
    const here = getCell(state, t.floor, t.col);
    if (here) here.present++;
  }
  state.population = state.tenants.length;
  state.residents = getResidentCount(state);
}

// ═══════════════════════════════════════════
//  COMPLAINTS
// ═══════════════════════════════════════════

export function logComplaint(state, sim, reason, floorRef) {
  sim.complaints++;
  state.stats.complaintsThisWeek = (state.stats.complaintsThisWeek || 0) + 1;
  state.complainLogTotal = (state.complainLogTotal || 0) + 1;
  const floor = floorRef != null ? floorRef : sim.floor;
  let entry = state.complainLog.find(c => c.reason === reason && c.week === state.week);
  if (!entry) {
    entry = { reason, count: 0, floor, week: state.week };
    state.complainLog.push(entry);
  }
  entry.count++;
  if (state.complainLog.length > 60) state.complainLog.splice(0, state.complainLog.length - 60);
  if (state._uiHooks && state._uiHooks.complaint) {
    state._uiHooks.complaint(sim, reason, floor);
  }
}

// ═══════════════════════════════════════════
//  MAIN UPDATE
// ═══════════════════════════════════════════

export function updateSims(state, dt) {
  updateLobbyInflux(state, dt);

  let write = 0;
  for (let read = 0; read < state.tenants.length; read++) {
    const sim = state.tenants[read];
    updateSim(sim, state, dt);
    if (sim.state !== 'remove') {
      state.tenants[write++] = sim;
    } else if (sim.ridingCar) {
      sim.ridingCar.passengers = sim.ridingCar.passengers.filter(p => p.sim !== sim);
      sim.ridingCar = null;
    }
  }
  state.tenants.length = write;
}

function updateSim(sim, state, dt) {
  if (sim.state !== 'riding') sim.stateTimer -= dt;
  if (sim.bubbleTimer > 0) sim.bubbleTimer = Math.max(0, sim.bubbleTimer - dt);
  if (sim.grudge > 0) sim.grudge = Math.max(0, sim.grudge - dt * 0.4);
  if (sim._noRouteCooldown > 0) sim._noRouteCooldown -= dt;

  switch (sim.state) {
    case 'idle': tickIdle(sim, state, dt); break;
    case 'walking': tickWalking(sim, state, dt); break;
    case 'waitingElevator': tickWaiting(sim, state, dt); break;
    case 'riding': tickRiding(sim, state, dt); break;
    default: tickEngaged(sim, state, dt); break; // working/resting/eating/leisure/leaving
  }

  // validate home/work
  if (sim.home && !getCell(state, sim.home.floor, sim.home.col)) sim.home = null;
  if (sim.work && !getCell(state, sim.work.floor, sim.work.col)) sim.work = null;
}

// ── walking ──────────────────────────────────

function stepWalk(sim, state, dt) {
  const tx = sim.walkTargetCol + sim.walkTargetX;
  const cx = sim.col + sim.x;
  const dx = tx - cx;
  const sp = sim.speed * dt;
  if (Math.abs(dx) <= sp || Math.abs(dx) < 0.012) {
    sim.col = clampCol(sim.walkTargetCol, state.cols);
    sim.x = sim.walkTargetX;
    return true;
  }
  sim.direction = dx > 0 ? 1 : -1;
  let nx = sim.x + sim.direction * sp;
  let ncol = sim.col;
  while (nx > 1) { nx -= 1; ncol++; }
  while (nx < 0) { nx += 1; ncol--; }
  sim.col = clampCol(ncol, state.cols);
  sim.x = Math.max(0, Math.min(0.999, nx));
  return false;
}

function tickWalking(sim, state, dt) {
  sim.activity = 'commuting';
  if (!stepWalk(sim, state, dt)) return;

  if (sim.routePhase === 'toShaft') {
    beginWaiting(sim, state);
  } else if (sim.routePhase === 'toVenue') {
    finishTrip(sim, state);
  } else {
    sim.state = 'idle';
    sim.stateTimer = 1.5 + Math.random() * 3;
  }
}

// ── idle / destination choice ────────────────

function tickIdle(sim, state, dt) {
  sim.activity = 'idle';
  if (sim.stateTimer > 0) return;

  if (sim.mood < 25 || sim.patience <= 0) {
    sim.bubble = '😠';
    sim.bubbleTimer = 2.5;
  }

  // random idle wander
  if (Math.random() < 0.6) {
    const cell = getCell(state, sim.floor, sim.col);
    sim.walkTargetCol = sim.col;
    sim.walkTargetX = 0.15 + Math.random() * 0.7;
    sim.routePhase = null;
    sim.state = 'walking';
    sim.stateTimer = 3;
    return;
  }

  const dest = pickDestination(sim, state);
  if (!dest) { sim.stateTimer = 2 + Math.random() * 3; return; }
  beginTrip(sim, state, dest.floor, dest.col, dest.activity);
}

// ── trip planning ────────────────────────────

export function beginTrip(sim, state, toFloor, toCol, activity) {
  sim.targetFloor = toFloor;
  sim.targetCol = toCol;
  sim.targetActivity = activity || null;

  if (toFloor === sim.floor) {
    sim.itinerary = null;
    sim.legIndex = 0;
    sim.routePhase = 'toVenue';
    sim.walkTargetCol = toCol;
    sim.walkTargetX = 0.5;
    sim.state = 'walking';
    sim.stateTimer = 30;
    return;
  }

  const legs = planItinerary(state, sim.floor, toFloor, { fromCol: sim.col });
  if (!legs || legs.length === 0) {
    if (sim._noRouteCooldown <= 0) {
      sim._noRouteCooldown = 15;
      sim.grudge = Math.min(40, sim.grudge + 14);
      sim.bubble = '🚫';
      sim.bubbleTimer = 3;
      logComplaint(state, sim, `no elevator route to ${floorLabel(toFloor)}`);
    }
    sim.state = 'idle';
    sim.stateTimer = 3 + Math.random() * 4;
    return;
  }
  sim.itinerary = legs;
  sim.legIndex = 0;
  startLeg(sim, state);
}

function startLeg(sim, state) {
  const leg = sim.itinerary && sim.itinerary[sim.legIndex];
  if (!leg) { finishTrip(sim, state); return; }
  const shaft = (state.elevators || []).find(e => e.id === leg.shaftId);
  if (!shaft) {
    sim.itinerary = null;
    sim.state = 'idle';
    sim.stateTimer = 2;
    return;
  }
  sim.routePhase = 'toShaft';
  sim.walkTargetCol = shaft.col;
  sim.walkTargetX = leg.destFloor > leg.boardFloor ? 0.18 : 0.82;
  sim.state = 'walking';
  sim.stateTimer = 30;
}

function beginWaiting(sim, state) {
  const leg = sim.itinerary && sim.itinerary[sim.legIndex];
  if (!leg) { finishTrip(sim, state); return; }
  sim.state = 'waitingElevator';
  sim.waitSince = state.tick;
  sim.patience = 100;
  sim.activity = 'commuting';
  sim.routePhase = 'waiting';

  const goingUp = leg.destFloor > leg.boardFloor;
  const entry = registerWaiting(state, sim, leg.shaftId, leg.destFloor);
  const jitter = Math.min(entry.slot || 0, 5) * 0.12 * (goingUp ? 1 : -1);
  sim.x = Math.max(0.06, Math.min(0.94, sim.x + jitter));

  if (!sim.bubbleTimer) { sim.bubble = '⏳'; sim.bubbleTimer = 1.5; }
}

// ── waiting for a car ────────────────────────

function tickWaiting(sim, state, dt) {
  sim.activity = 'commuting';
  const leg = sim.itinerary && sim.itinerary[sim.legIndex];
  if (!leg) { sim.state = 'idle'; sim.stateTimer = 1; return; }
  if (!(state.elevators || []).some(e => e.id === leg.shaftId)) {
    // the shaft we were waiting for is gone
    unregisterWaiting(state, sim);
    sim.itinerary = null;
    sim.state = 'idle';
    sim.stateTimer = 1;
    return;
  }

  const waitedS = state.tick - sim.waitSince;
  sim.patience = 100 - waitedS * 3;

  // periodically re-press the call if the car hasn't come
  if (waitedS > 8) {
    callShaft(state, leg.shaftId, sim.floor, leg.destFloor > sim.floor ? 'up' : 'down');
    registerWaiting(state, sim, leg.shaftId, leg.destFloor);
  }

  if (sim.patience <= 0) {
    unregisterWaiting(state, sim);
    sim.bubble = '😠';
    sim.bubbleTimer = 3;
    logComplaint(state, sim, 'elevator wait too long');
    sim.grudge = Math.min(45, sim.grudge + 12);
    sim.itinerary = null;
    sim.state = 'idle';
    sim.stateTimer = 2;
    return;
  }

  if (waitedS > 60) {
    unregisterWaiting(state, sim);
    sim.itinerary = null;
    sim.state = 'idle';
    sim.stateTimer = 1;
    return;
  }

  if (waitedS > 8 && sim.bubbleTimer <= 0) {
    sim.bubble = '⏳';
    sim.bubbleTimer = 2;
  }
}

// ── riding (car drives us; dispatch calls simAlightedOnFloor) ──

function tickRiding(sim, state, dt) {
  sim.activity = 'commuting';
  // gentle stress while in a car too
  if (sim.waitSince > 0 && sim.bubbleTimer <= 0 && Math.random() < 0.001) {
    sim.bubble = '⌁';
    sim.bubbleTimer = 2;
  }
}

// Called by dispatch when a car reaches this sim's destination.
export function simAlightedOnFloor(state, sim, floor, car) {
  if (!sim) return;
  sim.floor = floor;
  sim.waitSince = 0;

  const leg = sim.itinerary && sim.itinerary[sim.legIndex];
  if (!leg) {
    sim.state = 'idle';
    sim.stateTimer = 1;
    return;
  }

  if (leg.isLast) {
    sim.itinerary = null;
    sim.legIndex = 0;
    sim.col = clampCol(sim.targetCol, state.cols);
    sim.x = 0.5;
    sim.routePhase = 'toVenue';
    // walk from the shaft to the actual venue on this floor
    sim.walkTargetCol = sim.targetCol;
    sim.walkTargetX = 0.5;
    if (sim.targetCol === sim.col) {
      finishTrip(sim, state);
    } else {
      sim.state = 'walking';
      sim.stateTimer = 30;
    }
  } else {
    sim.legIndex++;
    startLeg(sim, state);
  }
}

// ── arrival & activities ─────────────────────

function finishTrip(sim, state) {
  sim.itinerary = null;
  sim.legIndex = 0;
  sim.routePhase = null;
  sim.waitSince = 0;

  const cell = getCell(state, sim.floor, sim.col);
  const type = cell ? cell.type : null;
  const isHome = sim.home && sim.home.floor === sim.floor && sim.home.col === sim.col;
  const isWork = sim.work && sim.work.floor === sim.floor && sim.work.col === sim.col;

  if (sim.leaving) {
    if (sim.floor <= 0) { sim.state = 'remove'; return; }
  }

  if (isHome) { enter(sim, 'resting', 'resting', 8 + Math.random() * 12); sim.bubble = '💤'; sim.bubbleTimer = 2.5; return; }
  if (isWork) { enter(sim, 'working', 'working', 12 + Math.random() * 16); sim.bubble = '⌁'; sim.bubbleTimer = 2; return; }

  switch (type) {
    case 'restaurant':
      enter(sim, 'eating', 'eating', 5 + Math.random() * 4); sim.bubble = '🍴'; sim.bubbleTimer = 2.5; break;
    case 'hotel':
      enter(sim, 'resting', 'resting', 8 + Math.random() * 8); sim.bubble = '🛏️'; sim.bubbleTimer = 2.5; break;
    case 'shop':
      enter(sim, 'leisure', 'leisure', 4 + Math.random() * 4); sim.bubble = '🛒'; sim.bubbleTimer = 2.5; break;
    case 'cinema':
      enter(sim, 'leisure', 'leisure', 7 + Math.random() * 5); sim.bubble = '🎬'; sim.bubbleTimer = 2.5; break;
    case 'spa':
      enter(sim, 'leisure', 'leisure', 6 + Math.random() * 4); sim.bubble = '💆'; sim.bubbleTimer = 2.5; break;
    case 'park':
      enter(sim, 'leisure', 'leisure', 5 + Math.random() * 5); sim.bubble = '🌳'; sim.bubbleTimer = 2.5; break;
    default:
      enter(sim, 'idle', 'idle', 2 + Math.random() * 3); break;
  }
}

function enter(sim, stateName, activity, duration) {
  sim.state = stateName;
  sim.activity = activity;
  sim.stateTimer = duration;
}

function tickEngaged(sim, state, dt) {
  if (sim.stateTimer > 0) return;

  if (sim.state === 'leaving') {
    if (sim.floor <= 0) { sim.state = 'remove'; return; }
    sim.state = 'idle';
    sim.stateTimer = 1;
    return;
  }
  // finished activity → become idle and pick something new
  sim.state = 'idle';
  sim.stateTimer = 0.5 + Math.random() * 2;
}

// ── destination choice ───────────────────────

export function pickDestination(sim, state) {
  const v = state._venues || rebuildVenues(state);
  const phase = state.dayPhase;

  const nearest = (list) => {
    if (!list.length) return null;
    let best = null, bestCost = Infinity;
    for (const r of list) {
      const cost = Math.abs(r.floor - sim.floor) * 1.0 + Math.abs(r.col - sim.col) * 0.2;
      if (cost < bestCost) { bestCost = cost; best = r; }
    }
    return best;
  };

  if (sim.leaving) {
    const lobby = nearest(v.transit.filter(t => t.floor <= 0)) || { floor: 0, col: Math.max(0, Math.round(state.cols / 2)) };
    return { ...lobby, activity: 'leaving' };
  }

  const leisure = leisureFor(state, v);

  // habit: people with a trait often head straight for what they love
  if (Math.random() < 0.40) {
    const pl = prefList(state, sim.trait, v);
    if (pl) {
      const pick = nearest(pl);
      if (pick) {
        const cell = getCell(state, pick.floor, pick.col);
        return { ...pick, activity: activityForType(cell && cell.type) };
      }
    }
  }

  if (sim.food < 45 && v.food.length) {
    return { ...nearest(v.food), activity: 'eating' };
  }
  if (sim.leisure < 45 && leisure.length) {
    return { ...nearest(leisure), activity: 'leisure' };
  }

  if (sim.kind === 'worker') {
    // Staggered shifts: workers trickle in over the morning instead of all
    // hitting the elevators in the same instant (which is what makes the
    // rush-hour bottleneck brutal).
    if (phase === 'day' && sim.work && state.dayTime >= 0.12 + (sim._shiftJitter || 0)) {
      return { floor: sim.work.floor, col: sim.work.col, activity: 'working' };
    }
    if (sim.workNeed > 70 && sim.work) return { floor: sim.work.floor, col: sim.work.col, activity: 'working' };
    if (sim.home && (sim.energy < 55 || phase === 'night')) return { floor: sim.home.floor, col: sim.home.col, activity: 'resting' };
    if (leisure.length) return { ...nearest(leisure), activity: 'leisure' };
    if (v.food.length) return { ...nearest(v.food), activity: 'eating' };
    if (sim.work) return { floor: sim.work.floor, col: sim.work.col, activity: 'working' };
    return null;
  }

  if (sim.kind === 'resident' || sim.kind === 'guest') {
    if (sim.energy < 50 || phase === 'night' || phase === 'dawn') {
      if (sim.home) return { floor: sim.home.floor, col: sim.home.col, activity: 'resting' };
    }
    if (sim.kind === 'guest' && leisure.length) return { ...nearest(leisure), activity: 'leisure' };
    if (sim.kind === 'guest' && v.hotels.length) return { ...nearest(v.hotels), activity: 'resting' };
    if (phase === 'day' && v.shops.length) return { ...nearest(v.shops), activity: 'leisure' };
    if (leisure.length) return { ...nearest(leisure), activity: 'leisure' };
    if (v.food.length) return { ...nearest(v.food), activity: 'eating' };
    if (sim.home) return { floor: sim.home.floor, col: sim.home.col, activity: 'resting' };
    return null;
  }

  // visitor
  if (sim.food < 60 && v.food.length) return { ...nearest(v.food), activity: 'eating' };
  if (leisure.length) return { ...nearest(leisure), activity: 'leisure' };
  if (v.shops.length) return { ...nearest(v.shops), activity: 'leisure' };
  return null;
}

// trait → venue bucket
const PREF_MAP = {
  office: 'offices', restaurant: 'food', park: 'leisure', spa: 'leisure',
  cinema: 'leisure', skyLobby: 'transit', shop: 'shops', residence: 'homes', hotel: 'hotels',
};

function prefList(state, trait, v) {
  const t = traitOf(trait);
  if (!t || !t.prefer) return null;
  for (const p of t.prefer) {
    const k = PREF_MAP[p];
    if (k && v[k] && v[k].length) return v[k];
  }
  return null;
}

export function activityForType(type) {
  switch (type) {
    case 'residence':
    case 'hotel': return 'resting';
    case 'office': return 'working';
    case 'restaurant': return 'eating';
    default: return 'leisure';
  }
}

// Weather and events shift the mix between outdoor and indoor leisure.
function leisureFor(state, v) {
  if (!v.leisure.length) return v.leisure;
  const m = state.mods || { parkDemand: 1, indoorDemand: 1 };
  const park = [], indoor = [];
  for (const r of v.leisure) {
    const c = getCell(state, r.floor, r.col);
    (c && c.type === 'park' ? park : indoor).push(r);
  }
  const out = [];
  if (m.parkDemand > 0.65) out.push(...park);
  if (m.indoorDemand > 0.7 || out.length === 0) out.push(...indoor);
  return out.length ? out : v.leisure;
}

// ═══════════════════════════════════════════
//  ANGER / DEPARTURE (called from needs/consequences)
// ═══════════════════════════════════════════

export function beginDeparture(sim, state, reason) {
  if (sim.leaving) return;
  sim.leaving = true;
  sim.bubble = reason === 'quit' ? '🚪' : '🧳';
  sim.bubbleTimer = 3;
  sim.itinerary = null;
  sim.legIndex = 0;
  sim.waitSince = 0;
  unregisterWaiting(state, sim);

  if (sim.floor <= 0) { sim.state = 'remove'; return; }
  const legs = planItinerary(state, sim.floor, 0);
  if (legs && legs.length) {
    sim.itinerary = legs;
    sim.legIndex = 0;
    sim.targetFloor = 0;
    sim.targetCol = legs[legs.length - 1].exitFloor === 0 ? sim.col : sim.col;
    startLeg(sim, state);
  } else {
    // no way down — walk off the books
    sim.state = 'remove';
  }
}

// ═══════════════════════════════════════════
//  LOBBY INFLUX — new visitors/workers arrive and ride up
// ═══════════════════════════════════════════

const LOBBY_INFLUX_INTERVAL = 4;
let _lobbyTimer = 0;

function updateLobbyInflux(state, dt) {
  _lobbyTimer += dt;
  if (_lobbyTimer < LOBBY_INFLUX_INTERVAL) return;
  _lobbyTimer = 0;

  const lobbyCell = getCell(state, 0, 0) || getCell(state, 0, Math.floor(state.cols / 2));
  if (!lobbyCell || (state.elevators || []).length === 0) return;

  // Enter at a random shaft column so arrivals spread across the lobby's shafts
  // instead of everyone queueing for the first one.
  const shafts = state.elevators;
  const entryCol = shafts[Math.floor(Math.random() * shafts.length)].col;

  const v = state._venues || rebuildVenues(state);
  const demand = 0.25 + state.rating * 0.14 + (state.satisfaction || 0) * 0.004;
  const cap = 900;
  if (state.tenants.length >= cap) return;

  const spawn = (kind, dest, activity) => {
    const sim = createSim(0, entryCol, kind, state);
    sim.x = 0.3 + Math.random() * 0.4;
    sim.walkTargetX = sim.x;
    if (dest) { sim.home = kind === 'resident' ? dest : sim.home; sim.work = kind === 'worker' ? dest : sim.work; }
    state.tenants.push(sim);
    if (dest) beginTrip(sim, state, dest.floor, dest.col, activity);
    return sim;
  };

  if (v.offices.length && getSimCountByKind(state, 'worker') < v.offices.length * 3 && Math.random() < demand) {
    const office = v.offices[Math.floor(Math.random() * v.offices.length)];
    spawn('worker', office, 'working');
    return;
  }
  if (v.leisure.length && Math.random() < demand * 0.8) {
    spawn('visitor', null, null);
    return;
  }
  if ((v.food.length || v.shops.length) && Math.random() < demand * 0.6) {
    spawn('visitor', null, null);
  }
}

// ═══════════════════════════════════════════
//  DRAWING
// ═══════════════════════════════════════════

function isCellVisible(state, row) {
  const pos = cellToScreenLocal(state, row, 0);
  const canvasH = state.canvasH || 600;
  return pos.y + pos.h > -40 && pos.y < canvasH + 40;
}

export function drawSims(ctx, state) {
  const s = state.zoom || 1;
  for (const sim of state.tenants) {
    if (sim.state === 'riding' || sim.state === 'remove') continue;
    if (!isCellVisible(state, sim.floor)) continue;
    const pos = cellToScreenPerspective(state, sim.floor, sim.col);
    // scale relative to a full-size cell so upper floors (smaller projected
    // cells) and basements (larger) get proportionally smaller/bigger sims
    const simScale = (pos.w / (CELL_W * s)) * s;
    drawSim(ctx, sim, pos, simScale, state);
  }
}

export function drawSim(ctx, sim, pos, s, state) {
  const px = pos.x + sim.x * pos.w;
  const isWalking = sim.state === 'walking';
  const bob = isWalking ? Math.sin(state.tick * 10 + sim.x * 12) * s * 1.4 : 0;
  const py = pos.y + pos.h * 0.52 + bob;
  const scale = s * 0.95;

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(px + 1.5 * scale, py + 4 * scale, 3.6 * scale, 1.2 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  // body
  ctx.fillStyle = sim.color;
  const bodyH = (sim.kind === 'worker' ? 6.6 : sim.kind === 'guest' ? 6.8 : 6.4) * scale;
  ctx.beginPath();
  ctx.roundRect(px - 2.4 * scale, py - 1.6 * scale, 4.8 * scale, bodyH, 1.6);
  ctx.fill();

  // legs
  ctx.strokeStyle = 'rgba(20,24,40,0.7)';
  ctx.lineWidth = 1 * scale;
  const legPhase = isWalking ? Math.sin(state.tick * 10 + sim.x * 12) : 0;
  ctx.beginPath();
  ctx.moveTo(px - 1 * scale, py + bodyH - 1.6 * scale);
  ctx.lineTo(px - 1 * scale + legPhase * 1.4 * scale, py + bodyH + 2 * scale);
  ctx.moveTo(px + 1 * scale, py + bodyH - 1.6 * scale);
  ctx.lineTo(px + 1 * scale - legPhase * 1.4 * scale, py + bodyH + 2 * scale);
  ctx.stroke();

  // head
  ctx.fillStyle = sim.skin || '#f3c59b';
  ctx.beginPath();
  ctx.arc(px, py - 3.6 * scale, 2.7 * scale, 0, Math.PI * 2);
  ctx.fill();

  // hair
  ctx.fillStyle = sim.hair || '#24180f';
  ctx.beginPath();
  ctx.arc(px, py - 4.5 * scale, 2.5 * scale, Math.PI, 0);
  ctx.fill();

  // mood ring (subtle)
  if (sim.mood < 40) {
    ctx.strokeStyle = sim.mood < 25 ? 'rgba(239,68,68,0.85)' : 'rgba(251,191,36,0.75)';
    ctx.lineWidth = 1 * scale;
    ctx.beginPath();
    ctx.arc(px, py + bodyH * 0.4, 4.2 * scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  // bubble
  if (sim.bubbleTimer > 0 && sim.bubble) {
    const bx = px + 7 * scale;
    const by = py - 11 * scale;
    const wide = sim.bubble.length > 2;
    const bw = (wide ? 13 : 10) * scale;
    ctx.fillStyle = 'rgba(240,250,255,0.94)';
    ctx.beginPath();
    ctx.roundRect(bx - bw / 2, by - 5 * scale, bw, 9 * scale, 3 * scale);
    ctx.fill();
    ctx.fillStyle = '#173342';
    ctx.font = `${Math.max(6, 7 * scale)}px 'DM Sans',sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sim.bubble, bx, by + 0.5 * scale);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }
}

// ═══════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════

function clampCol(c, cols) { return Math.max(0, Math.min(cols - 1, Math.round(c))); }
function floorLabel(row) { return row < 0 ? 'B' + Math.abs(row) : 'F' + (row + 1); }
