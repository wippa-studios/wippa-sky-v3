import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../js/state.js';
import { canBuild, buildFloor, getBuildCost, addElevatorCar, cellToScreenLocal } from '../js/grid.js';
import { screenToCell } from '../js/state.js';
import { GROUND_Y_OFFSET } from '../js/constants.js';

function fresh() {
  const s = createState();
  s.canvasW = 800; s.canvasH = 600; s.zoom = 1;
  return s;
}

test('ground floor can be built with no support', () => {
  const s = fresh();
  assert.equal(canBuild(s, 0, 3, 'lobby'), true);
  assert.equal(buildFloor(s, 0, 3, 'lobby'), true);
});

test('upper floors require the cell below', () => {
  const s = fresh();
  assert.equal(canBuild(s, 1, 0, 'office'), false);
  buildFloor(s, 0, 0, 'lobby');
  assert.equal(canBuild(s, 1, 0, 'office'), true);
  assert.equal(buildFloor(s, 2, 0, 'office'), false); // still nothing at row 1
});

test('basements require the cell above (dig downward)', () => {
  const s = fresh();
  assert.equal(canBuild(s, -1, 0, 'parking'), false);
  buildFloor(s, 0, 0, 'lobby');
  assert.equal(canBuild(s, -1, 0, 'parking'), true);
  buildFloor(s, -1, 0, 'parking');
  assert.equal(canBuild(s, -2, 0, 'parking'), true);
});

test('bedrock blocks digging past B8', () => {
  const s = fresh();
  assert.equal(canBuild(s, -9, 0, 'parking'), false);
});

test('dig costs scale with depth', () => {
  const s = fresh();
  assert.equal(getBuildCost(s, -1, 'office'), 10000 + 2500 + 600);
  assert.equal(getBuildCost(s, -2, 'office'), 10000 + 2500 + 1200);
  assert.equal(getBuildCost(s, 1, 'office'), 10000);
});

test('affordability gates building', () => {
  const s = fresh();
  s.money = 100;
  assert.equal(canBuild(s, 0, 0, 'office'), false);
});

test('building an elevator creates a shaft and a car', () => {
  const s = fresh();
  buildFloor(s, 0, 2, 'elevator');
  buildFloor(s, 1, 2, 'elevator');
  assert.equal(s.elevators.length, 1);
  assert.equal(s.elevatorCars.length, 1);
  assert.deepEqual(s.elevators[0].floors, [0, 1]);
});

test('a shaft grows as cells are stacked and spans the extents', () => {
  const s = fresh();
  buildFloor(s, 0, 0, 'elevator');
  buildFloor(s, 1, 0, 'elevator');
  buildFloor(s, 2, 0, 'elevator');
  const e = s.elevators[0];
  assert.equal(e.floorMin, 0);
  assert.equal(e.floorMax, 2);
  assert.equal(e.floors.length, 3);
});

test('extra cars can be bought for a shaft up to the cap', () => {
  const s = fresh();
  buildFloor(s, 0, 0, 'elevator');
  s.money = 1000000;
  assert.equal(s.elevatorCars.length, 1);
  assert.equal(addElevatorCar(s, 0, 0).cars, 2);
  addElevatorCar(s, 0, 0);
  addElevatorCar(s, 0, 0);
  addElevatorCar(s, 0, 0);
  addElevatorCar(s, 0, 0);
  assert.equal(s.elevatorCars.length, 6);
  assert.equal(addElevatorCar(s, 0, 0).cars, 7);
});

test('cars cost money and are refused when broke', () => {
  const s = fresh();
  buildFloor(s, 0, 0, 'elevator');
  s.money = 10;
  assert.deepEqual(addElevatorCar(s, 0, 0), { error: 'funds' });
  // and a non-shaft cell returns null
  assert.equal(addElevatorCar(s, 0, 5), null);
});

test('screen <-> cell mapping round-trips (2.5D offset + zoom)', () => {
  const s = fresh();
  for (const zoom of [0.75, 1, 1.6]) {
    s.zoom = zoom;
    for (const [row, col] of [[0, 0], [1, 4], [5, 8], [-2, 3]]) {
      const p = cellToScreenLocal(s, row, col);
      const hit = screenToCell(s, p.x + p.w / 2, p.y + p.h / 2, s.canvasH, GROUND_Y_OFFSET);
      assert.deepEqual(hit, { row, col }, `zoom ${zoom} row ${row} col ${col}`);
    }
  }
});
