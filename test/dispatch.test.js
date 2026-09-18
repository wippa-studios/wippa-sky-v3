import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../js/state.js';
import { buildFloor } from '../js/grid.js';
import {
  registerWaiting, updateDispatch, isExpressStopFloor, carriageCapacity, pendingCalls,
} from '../js/dispatch.js';

// Build a continuous shaft from `min` to `max` at column 0.
function worldWithShaft(min, max, opts = {}) {
  const s = createState();
  s.canvasW = 800; s.canvasH = 600; s.zoom = 1;
  for (let f = min; f <= max; f++) buildFloor(s, f, 0, 'elevator');
  if (opts.express) s.elevators[0].kind = 'express';
  s._simHooks = {};
  return s;
}

function waitingSim(floor, id) {
  return { id, state: 'waitingElevator', floor, col: 0, x: 0.2, bubbleTimer: 0, bubble: '' };
}

function run(state, seconds, step = 1 / 60, onTick) {
  let t = 0;
  while (t < seconds) { updateDispatch(state, step); if (onTick) onTick(); t += step; }
}

test('a waiting sim boards a car and rides to its destination', () => {
  const s = worldWithShaft(0, 5);
  const arrived = [];
  s._simHooks.onAlight = (sim, floor) => arrived.push({ id: sim.id, floor });
  const sim = waitingSim(5, 1);
  registerWaiting(s, sim, s.elevators[0].id, 0);
  s.elevatorCars[0].pos = 4.5;

  run(s, 1.5);
  assert.equal(sim.state, 'riding', 'sim should have boarded');

  run(s, 8);
  assert.deepEqual(arrived, [{ id: 1, floor: 0 }]);
  assert.equal(s.elevatorCars[0].passengers.length, 0);
});

test('respects car capacity', () => {
  const s = worldWithShaft(0, 1);
  const shaftId = s.elevators[0].id;
  for (let i = 0; i < 12; i++) registerWaiting(s, waitingSim(1, i + 1), shaftId, 0);
  s.elevatorCars[0].pos = 1;

  let maxP = 0;
  run(s, 3, 1 / 60, () => { maxP = Math.max(maxP, s.elevatorCars[0].passengers.length); });
  assert.equal(maxP, 8);
});

test('call buttons are raised by waiting passengers and cleared on arrival', () => {
  const s = worldWithShaft(0, 2);
  const shaftId = s.elevators[0].id;
  registerWaiting(s, waitingSim(2, 1), shaftId, 0);
  assert.ok(pendingCalls(s, shaftId).some(c => c.floor === 2));
  s.elevatorCars[0].pos = 2;
  run(s, 2);
  assert.equal(pendingCalls(s, shaftId).some(c => c.floor === 2), false);
});

test('every passenger is delivered via the alight hook', () => {
  const s = worldWithShaft(0, 3);
  const shaftId = s.elevators[0].id;
  const delivered = [];
  s._simHooks.onAlight = (sim, floor) => delivered.push(floor);
  registerWaiting(s, waitingSim(3, 1), shaftId, 0);
  registerWaiting(s, waitingSim(3, 2), shaftId, 0);
  s.elevatorCars[0].pos = 3;

  run(s, 10);
  assert.equal(delivered.length, 2);
  assert.deepEqual(delivered, [0, 0]);
});

test('express shafts only stop at express floors', () => {
  const s = worldWithShaft(0, 30, { express: true });
  const e = s.elevators[0];
  assert.equal(isExpressStopFloor(e, 0), true);
  assert.equal(isExpressStopFloor(e, 15), true);
  assert.equal(isExpressStopFloor(e, 7), false);
  assert.equal(isExpressStopFloor(e, 30), true);
  assert.equal(carriageCapacity(e), 12);
});

test('cars travel in one direction and reverse at the shaft end', () => {
  const s = worldWithShaft(0, 3);
  const shaftId = s.elevators[0].id;
  registerWaiting(s, waitingSim(0, 1), shaftId, 3); // wants to go up from the ground
  s.elevatorCars[0].pos = 0;

  run(s, 2);
  assert.equal(s.elevatorCars[0].passengers.length, 1, 'should pick up at the ground');

  const positions = [];
  run(s, 8, 1 / 60, () => positions.push(s.elevatorCars[0].pos));
  assert.ok(Math.max(...positions) >= 3, 'car should reach the top of the shaft');
});
