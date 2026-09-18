import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../js/state.js';
import { planItinerary } from '../js/pathfind.js';

function stateWithShafts(shafts) {
  const s = createState();
  s.canvasW = 800; s.canvasH = 600; s.zoom = 1;
  s.elevators = shafts.map((sh, i) => ({
    id: i, col: sh.col, kind: 'standard',
    floors: sh.floors,
    floorMin: Math.min(...sh.floors),
    floorMax: Math.max(...sh.floors),
  }));
  return s;
}

test('same floor needs no elevator', () => {
  const s = stateWithShafts([{ col: 0, floors: [0, 1, 2] }]);
  assert.deepEqual(planItinerary(s, 2, 2), []);
});

test('a single shaft serving both floors yields one leg', () => {
  const s = stateWithShafts([{ col: 0, floors: [0, 1, 2, 3, 4, 5] }]);
  const legs = planItinerary(s, 5, 0);
  assert.equal(legs.length, 1);
  assert.deepEqual({ b: legs[0].boardFloor, e: legs[0].exitFloor }, { b: 5, e: 0 });
});

test('transfers happen where two shafts meet', () => {
  const s = stateWithShafts([
    { col: 0, floors: [0, 1, 2, 3, 4, 5] },
    { col: 1, floors: [5, 6, 7, 8, 9, 10] },
  ]);
  const legs = planItinerary(s, 1, 10);
  assert.equal(legs.length, 2);
  assert.equal(legs[0].exitFloor, 5);
  assert.equal(legs[1].boardFloor, 5);
  assert.equal(legs[1].destFloor, 10);
  assert.equal(legs[1].isLast, true);
});

test('no route when no shaft reaches the origin or destination', () => {
  const s = stateWithShafts([{ col: 0, floors: [0, 1, 2, 3] }]);
  assert.equal(planItinerary(s, 3, 10), null);
  assert.equal(planItinerary(s, 9, 0), null);
});

test('a disconnected pair of shafts has no route', () => {
  const s = stateWithShafts([
    { col: 0, floors: [0, 1, 2] },
    { col: 1, floors: [10, 11, 12] },
  ]);
  assert.equal(planItinerary(s, 0, 12), null);
});

test('a direct shaft beats a transfer even when both exist', () => {
  const s = stateWithShafts([
    { col: 0, floors: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }, // direct
    { col: 1, floors: [0, 10] },
  ]);
  const legs = planItinerary(s, 0, 10);
  assert.equal(legs.length, 1);
  assert.equal(legs[0].boardFloor, 0);
  assert.equal(legs[0].exitFloor, 10);
});
