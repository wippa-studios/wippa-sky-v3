import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, setCell } from '../js/state.js';
import { buildFloor, cellToScreenLocal, getCellTowerStatus, getCellTowerRoof } from '../js/grid.js';
import { initInput } from '../js/input.js';

function setup() {
  const s = createState();
  s.canvasW = 1000; s.canvasH = 800; s.selectedTool = 'elevator';
  buildFloor(s, 0, 0, 'elevator');
  const handlers = {}, keys = {};
  globalThis.document = { addEventListener: (k, f) => keys[k] = f, getElementById: () => null };
  globalThis.window = { addEventListener() {} };
  initInput(s, { addEventListener: (k, f) => handlers[k] = f }, { addEventListener() {} });
  const p = cellToScreenLocal(s, 0, 0);
  const e = { button: 0, clientX: p.x + p.w / 2, clientY: p.y + p.h / 2, preventDefault() {} };
  return { s, handlers, keys, e };
}

test('Elevator tool mouse click buys one car and charges once', () => {
  const { s, handlers: h, e } = setup();
  const money = s.money;
  h.mousedown(e); h.mouseup(e);
  assert.equal(s.elevatorCars.length, 2);
  assert.equal(s.money, money - 15000);
});

test('horizontal drag, cancelled press, and Space-pan do not buy cars', () => {
  const { s, handlers: h, keys, e } = setup();
  h.mousedown(e); h.mousemove({ ...e, clientX: e.clientX + 30 }); h.mouseup(e);
  h.mousedown(e); h.mouseleave(e); h.mouseup(e);
  keys.keydown({ key: ' ', target: { tagName: 'BODY' }, preventDefault() {} });
  h.mousedown(e); h.mousemove({ ...e, clientY: e.clientY - 30 }); h.mouseup({ ...e, clientY: e.clientY - 30 });
  keys.keyup({ key: ' ' });
  assert.equal(s.elevatorCars.length, 1);
  assert.ok(Number.isFinite(s.cameraY));
});

test('CELL TWR rejects locked, unsupported, unaffordable and duplicate installs', () => {
  const s = createState();
  setCell(s, 40, 2, { type: 'office' }); s.highestFloor = 40;
  assert.equal(buildFloor(s, 41, 2, 'cellTower'), false);
  setCell(s, 41, 2, { type: 'office' }); s.highestFloor = 41;
  assert.equal(buildFloor(s, 42, 3, 'cellTower'), false);
  assert.equal(buildFloor(s, 39, 2, 'cellTower'), false);
  s.money = 24999;
  assert.equal(getCellTowerStatus(s), 'funds');
  assert.equal(buildFloor(s, 42, 2, 'cellTower'), false);
  s.money = 25000;
  assert.equal(buildFloor(s, 42, 2, 'cellTower'), true);
  assert.equal(s.money, 0);
  assert.equal(s.highestFloor, 41);
  assert.equal(s.grid.has(42), false);
  s.money = 50000;
  assert.equal(buildFloor(s, 42, 2, 'cellTower'), false);
  assert.equal(s.money, 50000);
  setCell(s, 43, 3, { type: 'office' }); s.highestFloor = 43;
  assert.deepEqual(getCellTowerRoof(s), { row: 43, col: 3 });
});
