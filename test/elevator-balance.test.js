import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, updateHighestFloor } from '../js/state.js';
import { buildFloor } from '../js/grid.js';
import { planItinerary } from '../js/pathfind.js';
import { callShaft, markCallsServed, pendingCalls, initDispatch } from '../js/dispatch.js';
import { spawnSimsForCell } from '../js/sims.js';
import { cellToScreenLocal } from '../js/grid.js';

// ── helpers ────────────────────────────────────────────────────

function stateWithShafts(shafts, opts = {}) {
  const s = createState();
  s.canvasW = 800; s.canvasH = 600; s.zoom = 1;
  s.elevators = shafts.map((sh, i) => ({
    id: i, col: sh.col, kind: sh.kind || 'standard',
    floors: [...sh.floors],
    floorMin: Math.min(...sh.floors),
    floorMax: Math.max(...sh.floors),
  }));
  if (opts.cars !== false) {
    s.elevatorCars = s.elevators.map(e => ({
      elevatorId: e.id, pos: e.floorMin, dir: 'idle', state: 'idle',
      doorOpen: 0, doorTimer: 0, doorPhase: null, passengers: [], capacity: 8, stops: new Set(),
    }));
    if (opts.extraCars) {
      for (const [shaftId, n] of Object.entries(opts.extraCars)) {
        for (let i = 0; i < n; i++) {
          s.elevatorCars.push({ elevatorId: Number(shaftId), pos: 0, dir: 'idle', state: 'idle',
            doorOpen: 0, doorTimer: 0, doorPhase: null, passengers: [], capacity: 8, stops: new Set() });
        }
      }
    }
  }
  initDispatch(s);
  return s;
}

function loadShaft(s, shaftId, waiters) {
  if (!s._waitingPassengers) s._waitingPassengers = [];
  for (let i = 0; i < waiters; i++) {
    s._waitingPassengers.push({ sim: { id: i }, simId: i, floor: 0, shaftId, destFloor: 40, waiting: true, timestamp: 0, slot: 0 });
  }
}

function loadCalls(s, shaftId, floors) {
  for (const f of floors) callShaft(s, shaftId, f, 'up');
}

// ── load-aware routing ─────────────────────────────────────────

test('a loaded shaft is avoided even when it is the nearest one', () => {
  const s = stateWithShafts([
    { col: 0, floors: [0, 40] },
    { col: 4, floors: [0, 40] },
    { col: 8, floors: [0, 40] },
  ]);
  loadShaft(s, 0, 10);   // 10 sims already waiting on shaft 0
  loadCalls(s, 0, [20]); // plus a pending call

  const legs = planItinerary(s, 0, 40, { fromCol: 0 });
  assert.ok(legs && legs.length >= 1, 'a route must exist');
  assert.notEqual(legs[0].shaftId, 0, 'sims must pick a less-loaded shaft');
});

test('a shaft with more cars absorbs the same load', () => {
  const s = stateWithShafts([
    { col: 0, floors: [0, 40] },   // 1 car
    { col: 1, floors: [0, 40], kind: 'standard' }, // given 2 extra cars below
  ], { extraCars: { 1: 1 } });     // shaft 1 now has 2 cars total
  // identical load on both shafts
  loadShaft(s, 0, 4);
  loadShaft(s, 1, 4);

  const legs = planItinerary(s, 0, 40, { fromCol: 5 });
  assert.ok(legs && legs.length >= 1);
  assert.equal(legs[0].shaftId, 1, 'the 2-car shaft must win the same load');
});

test('unloaded plan keeps its classic behaviour (nearest shaft, direct)', () => {
  const s = stateWithShafts([
    { col: 0, floors: [0, 1, 2, 3, 4, 5] },
    { col: 4, floors: [0, 1, 2, 3, 4, 5] },
  ]);
  const legs = planItinerary(s, 5, 0, { fromCol: 0 });
  assert.equal(legs.length, 1);
  assert.equal(legs[0].shaftId, 0);
  assert.deepEqual({ b: legs[0].boardFloor, e: legs[0].exitFloor }, { b: 5, e: 0 });
});

// ── direction-aware call clearing ──────────────────────────────

test('serving one direction keeps the opposite call alive', () => {
  const s = stateWithShafts([{ col: 0, floors: [0, 1, 2, 3] }]);
  const id = s.elevators[0].id;
  callShaft(s, id, 2, 'up');
  callShaft(s, id, 2, 'down');

  markCallsServed(s, id, 2, 'up');
  assert.equal(pendingCalls(s, id).some(c => c.floor === 2 && c.dir === 'up'), false);
  assert.equal(pendingCalls(s, id).some(c => c.floor === 2 && c.dir === 'down'), true,
    'down call must survive an up-bound serving');

  markCallsServed(s, id, 2, 'down');
  assert.equal(pendingCalls(s, id).some(c => c.floor === 2), false);
});

test('an idle-direction arrival clears both directions (classic pickup)', () => {
  const s = stateWithShafts([{ col: 0, floors: [0, 1, 2, 3] }]);
  const id = s.elevators[0].id;
  callShaft(s, id, 2, 'up');
  callShaft(s, id, 2, 'down');
  markCallsServed(s, id, 2, null);
  assert.equal(pendingCalls(s, id).some(c => c.floor === 2), false);
});

// ── express shafts only plan stops they actually serve ─────────

test('express planners never route to a non-stop floor', () => {
  const s = stateWithShafts([{ col: 0, floors: [0, 7, 15, 30], kind: 'express' }]);
  assert.equal(planItinerary(s, 0, 7), null, 'no express route to a non-stop floor');
  const legs = planItinerary(s, 0, 15);
  assert.ok(legs && legs.length === 1);
  assert.equal(legs[0].exitFloor, 15);
});

test('a mixed network uses the standard shaft for non-stop destinations', () => {
  const s = stateWithShafts([
    { col: 0, floors: [0, 15, 30], kind: 'express' },
    { col: 1, floors: [0, 7, 15, 30, 40] },
  ]);
  const legs = planItinerary(s, 0, 7, { fromCol: 5 });
  assert.ok(legs && legs.length === 1, 'one direct standard leg');
  assert.equal(legs[0].shaftId, 1);
  assert.equal(legs[0].exitFloor, 7);
});

// ── starter tower shape (mirrors initNewGame's non-minimal path) ─

test('a new game builds the full 4-floor starter tower', () => {
  const s = createState();
  s.canvasW = 800; s.canvasH = 600; s.zoom = 1;
  const rows = {
    0: ['elevator', 'lobby', 'lobby', 'lobby', 'elevator', 'lobby', 'lobby', 'lobby', 'elevator'],
    1: ['elevator', 'office', 'shop', 'restaurant', 'elevator', 'office', 'shop', 'residence', 'elevator'],
    2: ['elevator', 'office', 'residence', 'residence', 'elevator', 'residence', 'office', 'office', 'elevator'],
    3: ['elevator', 'residence', 'office', 'office', 'elevator', 'park', 'cinema', 'spa', 'elevator'],
  };
  for (const key of Object.keys(rows)) {
    const row = Number(key);
    for (let c = 0; c < rows[key].length; c++) {
      assert.ok(buildFloor(s, row, c, rows[key][c]), `build floor ${row},${c}`);
    }
  }
  for (const key of Object.keys(rows)) {
    const row = Number(key);
    for (let c = 0; c < rows[key].length; c++) {
      const type = rows[key][c];
      if (type !== 'elevator' && type !== 'lobby') spawnSimsForCell(s, row, c, type);
    }
  }

  updateHighestFloor(s);
  assert.equal(s.grid.size, 4, 'four built floor rows');
  assert.equal(s.highestFloor, 3);
  assert.equal(s.elevators.length, 3, 'three shafts, one per elevator column');
  assert.equal(s.elevatorCars.length, 3, 'one starter car per shaft');
  assert.ok(s.elevators.every(e => e.floors.length === 4), 'shafts span all four floors');
  assert.ok(s.tenants.length > 0, 'the starter tower is populated');
  assert.ok(s.money < 500000, 'starter floors have a build cost');
  // the minimal starter previously left the grid bare; assert cells exist everywhere
  for (let row = 0; row <= 3; row++) {
    for (let c = 0; c < 9; c++) {
      assert.ok(s.grid.get(row)[c], `cell ${row},${c} built`);
    }
  }
  // ground floor renders to a visible screen position (regression guard)
  const pos = cellToScreenLocal(s, 0, 0);
  assert.ok(pos.y + pos.h > -40, 'ground floor is on screen at default camera');
});