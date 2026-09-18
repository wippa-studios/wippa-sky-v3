import { test } from 'node:test';
import assert from 'node:assert/strict';

// minimal localStorage stub, installed before save.js is imported
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};

const { createState, setCell } = await import('../js/state.js');
const { buildFloor } = await import('../js/grid.js');
const { saveGame, loadGame } = await import('../js/save.js');

test('save round-trips the grid, elevators and tenants', () => {
  const s = createState();
  s.canvasW = 800; s.canvasH = 600; s.zoom = 1;
  buildFloor(s, 0, 0, 'elevator');
  buildFloor(s, 1, 0, 'elevator');
  buildFloor(s, 1, 1, 'residence');
  buildFloor(s, 2, 1, 'office');
  setCell(s, 3, 1, { type: 'shop', built: 1, occupancy: 1, happiness: 80, incomeMult: 1, staff: 1 });
  s.tenants = [
    { id: 1, kind: 'worker', home: null, work: { floor: 2, col: 1 }, floor: 2, col: 1, x: 0.5, state: 'working', mood: 80, energy: 90, food: 80, leisure: 70, workNeed: 20 },
    { id: 2, kind: 'resident', home: { floor: 1, col: 1 }, work: null, floor: 1, col: 1, x: 0.2, state: 'riding', mood: 60, energy: 50, food: 50, leisure: 50, workNeed: 0 },
  ];

  assert.equal(saveGame(s), true);

  const t = createState();
  t.canvasW = 800; t.canvasH = 600; t.zoom = 1;
  assert.equal(loadGame(t), true);

  assert.equal(t.elevators.length, s.elevators.length);
  assert.equal(t.elevatorCars.length, s.elevatorCars.length);
  assert.equal(t.tenants.length, 2);
  assert.equal(t.tenants[1].kind, 'resident');
});

test('CELL TWR round-trips as one attachment, never a grid floor', () => {
  const s = createState();
  s.money = 1000000;
  for (let row = 0; row <= 41; row++) buildFloor(s, row, 2, 'office');
  assert.equal(buildFloor(s, 42, 2, 'cellTower'), true);
  assert.equal(saveGame(s), true);
  const restored = createState();
  assert.equal(loadGame(restored), true);
  assert.deepEqual(restored.cellTower, { col: 2, built: 1 });
  assert.equal(restored.highestFloor, 41);
  assert.equal(restored.grid.has(42), false);
  assert.equal(restored.money, s.money);
  assert.equal(buildFloor(restored, 41, 2, 'cellTower'), false);
});

test('sims that were mid-trip are reset instead of stranded', () => {
  const s = createState();
  s.canvasW = 800; s.canvasH = 600; s.zoom = 1;
  s.tenants = [
    { id: 9, kind: 'worker', home: null, work: null, floor: 3, col: 0, x: 0.5, state: 'riding', mood: 70, energy: 70, food: 70, leisure: 70, workNeed: 10 },
    { id: 10, kind: 'visitor', home: null, work: null, floor: 2, col: 0, x: 0.5, state: 'waitingElevator', mood: 70, energy: 70, food: 70, leisure: 70, workNeed: 0 },
  ];
  saveGame(s);

  const t = createState();
  t.canvasW = 800; t.canvasH = 600; t.zoom = 1;
  loadGame(t);

  assert.equal(t.tenants[0].state, 'idle');
  assert.equal(t.tenants[1].state, 'idle');
  assert.equal(t.elevatorCars.length, 0);
});

// ── load atomicity (regression: partial load = ghost tower silhouette) ──────

test('a wrong-version save never mutates the live state', () => {
  const s = createState();
  s.canvasW = 800; s.canvasH = 600;
  buildFloor(s, 0, 0, 'elevator');
  buildFloor(s, 3, 3, 'office');
  assert.equal(saveGame(s), true);

  const data = JSON.parse(store.get('wippa-sky-save-v2'));
  data.version = 999;          // rejected
  data.highestFloor = 21;      // stale value that must never reach state
  store.set('wippa-sky-save-v2', JSON.stringify(data));

  const t = createState();
  t.canvasW = 800; t.canvasH = 600;
  buildFloor(t, 0, 0, 'elevator');   // live content built before loading
  const moneyBefore = t.money;       // 500k − shaft cost
  assert.equal(loadGame(t), false);
  assert.equal(t.highestFloor, 0);   // untouched
  assert.equal(t.grid.size, 1);      // untouched (row 0)
  assert.equal(t.money, moneyBefore); // untouched
});

test('a malformed grid fails atomically and leaves no ghost floors', () => {
  const s = createState();
  s.canvasW = 800; s.canvasH = 600;
  buildFloor(s, 0, 0, 'elevator');
  buildFloor(s, 2, 2, 'hotel');
  saveGame(s);

  const data = JSON.parse(store.get('wippa-sky-save-v2'));
  data.grid = { not: 'an array' };   // would throw mid-deserialization
  data.highestFloor = 21;
  data.basementDepth = -8;
  store.set('wippa-sky-save-v2', JSON.stringify(data));

  const t = createState();
  t.canvasW = 800; t.canvasH = 600;
  buildFloor(t, 0, 0, 'elevator');   // ground floor survives untouched
  assert.equal(loadGame(t), false);
  assert.equal(t.highestFloor, 0);   // no stale 21 -> no ghost silhouette
  assert.equal(t.basementDepth, 0);
  assert.equal(t.grid.size, 1);
});

test('a mid-deserialize throw leaves the live state byte-for-byte untouched', () => {
  const s = createState();
  s.canvasW = 800; s.canvasH = 600;
  buildFloor(s, 0, 0, 'elevator');
  buildFloor(s, 1, 1, 'office');
  buildFloor(s, 2, 1, 'hotel');
  buildFloor(s, 2, 0, 'elevator');
  assert.equal(saveGame(s), true);

  const data = JSON.parse(store.get('wippa-sky-save-v2'));
  data.elevatorCars = [null];                    // passes shape validation (an
                                                 // array) but throws inside
                                                 // deserializeElevatorCars —
                                                 // i.e. AFTER the grid was
                                                 // already written in the old
                                                 // non-atomic implementation
  data.highestFloor = 50;                        // must never leak either
  data.grid.push({ r: 5, c: 0, t: 'cellTower', b: 1 }); // vestigial grid entry
  store.set('wippa-sky-save-v2', JSON.stringify(data));

  const t = createState();
  t.canvasW = 800; t.canvasH = 600;
  buildFloor(t, 0, 0, 'elevator');               // live ground floor

  const before = {
    gridSize: t.grid.size, highest: t.highestFloor, depth: t.basementDepth,
    money: t.money, day: t.day, dayTime: t.dayTime,
    elevators: t.elevators.length, cars: t.elevatorCars.length,
    tenants: t.tenants.length, cellTower: t.cellTower, totalBuilt: t.totalBuilt,
  };

  assert.equal(loadGame(t), false);

  assert.equal(t.grid.size, before.gridSize);     // no orphan rows written
  assert.equal(t.highestFloor, before.highest);   // no ghost 50
  assert.equal(t.basementDepth, before.depth);
  assert.equal(t.money, before.money);
  assert.equal(t.day, before.day);
  assert.equal(t.dayTime, before.dayTime);
  assert.equal(t.elevators.length, before.elevators);
  assert.equal(t.elevatorCars.length, before.cars);
  assert.equal(t.tenants.length, before.tenants);
  assert.equal(t.cellTower, null);                // no cellTower debris
  assert.equal(t.totalBuilt, before.totalBuilt);  // no totalBuilt decrement
});

test('highestFloor/basementDepth are recomputed from the grid, not read from the save', () => {
  const s = createState();
  s.canvasW = 800; s.canvasH = 600;
  buildFloor(s, 0, 0, 'elevator');
  buildFloor(s, 1, 1, 'office');
  buildFloor(s, 2, 2, 'shop');
  buildFloor(s, -1, 0, 'parking');   // supported by the elevator above
  const expectedHighest = s.highestFloor;   // 2
  saveGame(s);

  const data = JSON.parse(store.get('wippa-sky-save-v2'));
  data.highestFloor = 21;            // tampered full-height claim
  data.basementDepth = -8;           // tampered depth
  store.set('wippa-sky-save-v2', JSON.stringify(data));

  const t = createState();
  t.canvasW = 800; t.canvasH = 600;
  assert.equal(loadGame(t), true);
  assert.equal(t.highestFloor, expectedHighest);  // derived from the grid
  assert.equal(t.basementDepth, -1);              // real dug depth, not -8
  assert.equal(t.money, s.money);                 // scalars still applied
});
