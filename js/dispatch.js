// ═══════════════════════════════════════════════════════════════
//  DISPATCH — Elevator transport (SCAN / collective control)
//  Wippa Sky
//
//  Cars are driven here. Sims never teleport: they register in
//  `state._waitingPassengers`, board a car (state -> 'riding'),
//  ride, and are handed back to the sim module through
//  `state._simHooks.onAlight` when they reach their destination.
// ═══════════════════════════════════════════════════════════════

import { ELEVATOR_SPEED, EXPRESS_SPEED_MULT, EXPRESS_CAPACITY } from './constants.js';

const DOOR_OPEN = 0.42;   // seconds
const DOOR_DWELL = 0.75;  // seconds doors stay open
const DOOR_CLOSE = 0.42;  // seconds
const EXPRESS_STOP_INTERVAL = 15;

function shaftOf(state, id) {
  return (state.elevators || []).find(e => e.id === id) || null;
}

function floorSpeed(elev) {
  return ELEVATOR_SPEED * (elev.kind === 'express' ? EXPRESS_SPEED_MULT : 1);
}

export function isExpressStopFloor(elev, floor) {
  if (elev.kind !== 'express') return true;
  if (floor === 0) return true;
  if (floor === elev.floorMax || floor === elev.floorMin) return true;
  return floor % EXPRESS_STOP_INTERVAL === 0;
}

export function carriageCapacity(elev) {
  return elev.kind === 'express' ? EXPRESS_CAPACITY : 8;
}

// ── init ───────────────────────────────────────────────────────

export function initDispatch(state) {
  if (!state._callButtons) state._callButtons = new Map();
  if (!state._waitingPassengers) state._waitingPassengers = [];
  if (!state.elevatorCars) state.elevatorCars = [];
}

// ── waiting registry ──────────────────────────────────────────

export function registerWaiting(state, sim, shaftId, destFloor) {
  if (!state._waitingPassengers) state._waitingPassengers = [];
  const existing = state._waitingPassengers.find(w => w.sim === sim && w.waiting);
  if (existing) {
    existing.shaftId = shaftId;
    existing.destFloor = destFloor;
    return existing;
  }
  const entry = {
    sim, simId: sim.id, floor: sim.floor, shaftId, destFloor,
    waiting: true, timestamp: state.tick || 0, slot: 0,
  };
  entry.slot = state._waitingPassengers.filter(
    w => w.waiting && w.floor === sim.floor && w.shaftId === shaftId
  ).length;
  state._waitingPassengers.push(entry);
  callShaft(state, shaftId, sim.floor, destFloor > sim.floor ? 'up' : 'down');
  return entry;
}

export function unregisterWaiting(state, sim) {
  if (!state._waitingPassengers) return;
  for (const w of state._waitingPassengers) {
    if (w.sim === sim) w.waiting = false;
  }
  pruneWaiting(state);
}

function pruneWaiting(state) {
  if (!state._waitingPassengers || state._waitingPassengers.length === 0) return;
  if (state._waitingPassengers.some(w => !w.waiting)) {
    state._waitingPassengers = state._waitingPassengers.filter(w => w.waiting);
  }
}

export function getWaitingFor(state, floor, shaftId) {
  return (state._waitingPassengers || []).filter(
    w => w.waiting && w.floor === floor && w.shaftId === shaftId
  );
}

// ── call buttons ───────────────────────────────────────────────

export function callShaft(state, shaftId, floor, dir) {
  if (!state._callButtons) initDispatch(state);
  const key = `${shaftId}-${floor}-${dir}`;
  if (!state._callButtons.has(key)) {
    state._callButtons.set(key, { shaftId, floor, dir, timestamp: state.tick || 0, served: false });
  }
}

export function findBestShaftForFloor(state, floor, col) {
  const candidates = (state.elevators || []).filter(
    e => floor >= e.floorMin && floor <= e.floorMax && e.floors.length > 0
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => Math.abs(a.col - col) - Math.abs(b.col - col));
  return candidates[0];
}

export function callElevator(state, floor, col, direction) {
  const shaft = findBestShaftForFloor(state, floor, col);
  if (!shaft) return null;
  callShaft(state, shaft.id, floor, direction);
  return shaft;
}

export function getShaftForSim(state, sim, fromFloor, toFloor) {
  const legs = planShafts(state, fromFloor, toFloor);
  if (!legs) return null;
  return shaftOf(state, legs[0].shaftId);
}

function planShafts(state, from, to) {
  // lightweight fallback: a single shaft serving both floors
  const direct = (state.elevators || []).find(
    e => e.floors.includes(from) && e.floors.includes(to)
  );
  if (direct) return [{ shaftId: direct.id }];
  return null;
}

// ── main update ────────────────────────────────────────────────

export function updateDispatch(state, dt) {
  initDispatch(state);
  for (const car of state.elevatorCars) {
    const elev = shaftOf(state, car.elevatorId);
    if (!elev || elev.floors.length === 0) continue;
    updateCar(car, elev, state, dt);
  }
  // drop served calls eventually
  for (const [key, call] of state._callButtons) {
    if (call.served) state._callButtons.delete(key);
  }
  pruneWaiting(state);
}

function updateCar(car, elev, state, dt) {
  switch (car.state) {
    case 'idle': tickIdleCar(car, elev, state); break;
    case 'moving': tickMovingCar(car, elev, state, dt); break;
    case 'doors': tickDoorsCar(car, elev, state, dt); break;
    default: car.state = 'idle';
  }
}

function tickIdleCar(car, elev, state) {
  // clear any stale stops outside this shaft
  for (const f of [...car.stops]) {
    if (f < elev.floorMin || f > elev.floorMax) car.stops.delete(f);
  }
  const target = computeTarget(car, elev, state);
  if (target === null) {
    if (car.passengers.length === 0) car.dir = 'idle';
    return;
  }
  const cur = Math.round(car.pos);
  // If we're already sitting on a call floor, keep the current direction (or
  // stay idle) so boarding can decide which way to go.
  car.dir = target > cur ? 'up' : target < cur ? 'down' : car.dir;
  car.state = 'moving';
}

function tickMovingCar(car, elev, state, dt) {
  const target = computeTarget(car, elev, state);
  if (target === null) {
    car.dir = 'idle';
    car.state = 'idle';
    return;
  }
  const speed = floorSpeed(elev);
  const diff = target - car.pos;
  car.dir = diff > 0 ? 'up' : diff < 0 ? 'down' : car.dir;

  // ease out as the car approaches a floor (feels mechanical, not robotic)
  const dist = Math.abs(diff);
  const step = speed * dt * (0.55 + 0.45 * Math.min(1, dist));

  if (dist <= step) {
    car.pos = target;
    // Don't waste a full door cycle if there is nobody to pick up or drop
    // off in this direction — just clear the call and keep rolling.
    if (hasBusinessAtFloor(car, elev, state, target)) {
      arriveAtFloor(car, elev, state, target);
    } else {
      car.stops.delete(target);
      markCallsServed(state, elev.id, target, car.dir);
    }
    return;
  }
  car.pos += Math.sign(diff) * step;
}

function hasBusinessAtFloor(car, elev, state, floor) {
  for (const p of car.passengers) {
    if (p.destFloor === floor) return true;
  }
  const cap = car.capacity || carriageCapacity(elev);
  if (car.passengers.length >= cap) return false;
  for (const w of getWaitingFor(state, floor, elev.id)) {
    const wantUp = w.destFloor > floor;
    const wantDown = w.destFloor < floor;
    if (!wantUp && !wantDown) continue;
    if (!isExpressStopFloor(elev, w.destFloor)) continue;
    const dirOk = car.dir === 'idle' || car.passengers.length === 0 ||
      (car.dir === 'up' && wantUp) || (car.dir === 'down' && wantDown);
    if (dirOk) return true;
  }
  return false;
}

function arriveAtFloor(car, elev, state, floor) {
  car.pos = floor;
  car.stops.delete(floor);
  car.state = 'doors';
  car.doorPhase = 'opening';
  car.doorOpen = 0;
  car.doorTimer = 0;
  car._alighted = false;
  markCallsServed(state, elev.id, floor, car.dir === 'idle' ? null : car.dir);
}

function tickDoorsCar(car, elev, state, dt) {
  if (car.doorPhase === 'opening') {
    car.doorOpen = Math.min(1, car.doorOpen + dt / DOOR_OPEN);
    if (car.doorOpen >= 1) {
      car.doorPhase = 'dwell';
      car.doorTimer = 0;
      alightPassengers(car, state);
      boardPassengers(car, elev, state);
    }
    return;
  }
  if (car.doorPhase === 'dwell') {
    car.doorTimer += dt;
    boardPassengers(car, elev, state); // allow late arrivals to board
    if (car.doorTimer >= DOOR_DWELL) car.doorPhase = 'closing';
    return;
  }
  // closing
  car.doorOpen = Math.max(0, car.doorOpen - dt / DOOR_CLOSE);
  if (car.doorOpen <= 0) {
    car.doorOpen = 0;
    car.doorPhase = null;
    car.state = 'moving';
  }
}

// ── target selection (SCAN lookahead) ──────────────────────────

// Proper SCAN: a car sweeps in one direction collecting same-direction calls and
// dropping passengers, then reverses. Direction is taken from the call itself,
// never guessed from the floor number.
function computeTarget(car, elev, state) {
  const cur = Math.round(car.pos);
  const cap = car.capacity || carriageCapacity(elev);
  const hasRoom = car.passengers.length < cap;
  const inRange = f => f >= elev.floorMin && f <= elev.floorMax &&
    (elev.kind !== 'express' || isExpressStopFloor(elev, f));

  const dests = car.passengers.map(p => p.destFloor).filter(inRange);
  const calls = pendingCalls(state, elev.id).filter(c => inRange(c.floor));

  const nearest = arr => arr.slice().sort((a, b) => Math.abs(a - cur) - Math.abs(b - cur))[0];
  const ahead = d => (d === 'up' ? f => f > cur : f => f < cur);

  const toward = (d) => {
    const set = new Set(dests.filter(ahead(d)));
    if (hasRoom) {
      for (const c of calls) if (c.dir === d && ahead(d)(c.floor)) set.add(c.floor);
      if (calls.some(c => c.floor === cur && c.dir === d)) set.add(cur);
    }
    return [...set];
  };

  if (car.dir === 'up' || car.dir === 'down') {
    const here = toward(car.dir);
    if (here.length) return nearest(here);
    const rev = car.dir === 'up' ? 'down' : 'up';
    const there = toward(rev);
    if (there.length) { car.dir = rev; return nearest(there); }
    return null;
  }

  // idle: finish our own drop-offs first, else answer the oldest call
  if (dests.length) return nearest(dests);
  if (hasRoom && calls.length) {
    const oldest = calls.slice().sort((a, b) => a.timestamp - b.timestamp)[0];
    car.dir = oldest.dir || (oldest.floor >= cur ? 'up' : 'down');
    return oldest.floor;
  }
  return null;
}

// ── boarding / alighting ───────────────────────────────────────

function alightPassengers(car, state) {
  const floor = Math.round(car.pos);
  const remaining = [];
  for (const p of car.passengers) {
    if (p.destFloor === floor) {
      const sim = p.sim;
      if (sim) {
        sim.ridingCar = null;
        state.stats.alights = (state.stats.alights || 0) + 1;
        if (state._simHooks && state._simHooks.onAlight) state._simHooks.onAlight(sim, floor, car);
      }
    } else {
      remaining.push(p);
    }
  }
  car.passengers = remaining;
}

function boardPassengers(car, elev, state) {
  const capacity = car.capacity || carriageCapacity(elev);
  if (car.passengers.length >= capacity) return;
  const floor = Math.round(car.pos);
  const queue = getWaitingFor(state, floor, elev.id).sort((a, b) => a.timestamp - b.timestamp);

  for (const w of queue) {
    if (car.passengers.length >= capacity) break;
    const sim = w.sim;
    if (!sim || sim.state !== 'waitingElevator') { w.waiting = false; continue; }
    const wantUp = w.destFloor > floor;
    const wantDown = w.destFloor < floor;
    if (!wantUp && !wantDown) { w.waiting = false; continue; }
    if (!isExpressStopFloor(elev, w.destFloor)) continue;

    const dirOk = car.dir === 'idle' || car.passengers.length === 0 ||
      (car.dir === 'up' && wantUp) || (car.dir === 'down' && wantDown);
    if (!dirOk) continue;

    if (car.dir === 'idle') car.dir = wantUp ? 'up' : 'down';
    car.passengers.push({ simId: sim.id, sim, destFloor: w.destFloor });
    car.stops.add(w.destFloor);
    w.waiting = false;
    sim.state = 'riding';
    sim.ridingCar = car;
    sim.bubble = '';
    sim.bubbleTimer = 0;
    state.stats.rides = (state.stats.rides || 0) + 1;
    if (state._simHooks && state._simHooks.onBoard) state._simHooks.onBoard(sim, car);
  }
}

// ── call bookkeeping ───────────────────────────────────────────

export function pendingCalls(state, shaftId) {
  if (!state._callButtons) return [];
  const calls = [];
  for (const [, call] of state._callButtons) {
    if (call.shaftId === shaftId && !call.served) calls.push(call);
  }
  return calls;
}

export function markCallsServed(state, shaftId, floor, dir) {
  for (const [, call] of state._callButtons) {
    if (call.shaftId === shaftId && call.floor === floor && !call.served) {
      // A car only serves the direction it is travelling in — wiping the
      // opposite-direction call too would silently strand those sims until
      // they re-press (8s later) and would inflate wait times.
      if (dir && call.dir !== dir) continue;
      call.served = true;
    }
  }
}

export function hasPendingCall(state, shaftId, floor, dir) {
  if (!state._callButtons) return false;
  for (const [, call] of state._callButtons) {
    if (call.shaftId === shaftId && call.floor === floor && !call.served) {
      if (!dir || call.dir === dir || call.dir === 'both') return true;
    }
  }
  return false;
}
