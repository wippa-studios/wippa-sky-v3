import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, setCell } from '../js/state.js';
import {
  calculateIncome, calculateExpenses, calculateRating, calculatePopulation,
  calculateSatisfaction, checkBankruptcy,
} from '../js/economy.js';

function fresh() {
  const s = createState();
  s.canvasW = 800; s.canvasH = 600; s.zoom = 1;
  return s;
}

const cell = (type, over = {}) => ({
  type, built: 1, occupancy: 0, happiness: 70, incomeMult: 1, staff: 0, ...over,
});

test('income scales with occupancy and mood multiplier', () => {
  const s = fresh();
  setCell(s, 1, 0, cell('residence', { occupancy: 2, incomeMult: 1 }));  // cap 4 -> 0.5x
  setCell(s, 1, 1, cell('office', { occupancy: 5, incomeMult: 1.15 })); // cap 5 -> 1x
  // residence: 50*1*0.5 = 25 ; office: 200*1.15*1 = 230
  assert.equal(calculateIncome(s), 255);
});

test('vacant cells earn nothing', () => {
  const s = fresh();
  setCell(s, 1, 0, cell('hotel', { occupancy: 2, vacant: true }));
  assert.equal(calculateIncome(s), 0);
});

test('expenses scale with build cost and service floors discount them', () => {
  const s = fresh();
  setCell(s, 1, 0, cell('office')); // upkeep = 0.5% of 10k = 50
  assert.equal(calculateExpenses(s), 50);

  setCell(s, 1, 1, cell('service'));
  setCell(s, 1, 2, cell('service'));
  // base stays 50 (service is free to run), minus 2 * 8% = 16% -> 42
  assert.equal(calculateExpenses(s), 42);
});

test('infrastructure is cheap to run', () => {
  const s = fresh();
  setCell(s, 0, 0, cell('lobby'));     // free
  setCell(s, 0, 1, cell('elevator'));  // 20
  setCell(s, 0, 2, cell('basementLobby')); // free
  assert.equal(calculateExpenses(s), 20);
});

test('rating follows satisfaction thresholds', () => {
  assert.equal(calculateRating(95), 5);
  assert.equal(calculateRating(80), 4);
  assert.equal(calculateRating(65), 3);
  assert.equal(calculateRating(45), 2);
  assert.equal(calculateRating(20), 1);
});

test('population is the live tenant count', () => {
  const s = fresh();
  s.tenants = [{ mood: 80 }, { mood: 60 }, { mood: 40 }];
  assert.equal(calculatePopulation(s), 3);
});

test('satisfaction reacts to tenant mood', () => {
  const s = fresh();
  s.tenants = [{ mood: 95 }, { mood: 95 }];
  const happy = calculateSatisfaction(s);
  s.tenants = [{ mood: 20 }, { mood: 20 }];
  const sad = calculateSatisfaction(s);
  assert.ok(happy > sad);
});

test('three consecutive negative days trigger bankruptcy', () => {
  const s = fresh();
  s.money = -1;
  assert.equal(checkBankruptcy(s), 'warning');
  assert.equal(checkBankruptcy(s), 'warning');
  assert.equal(checkBankruptcy(s), 'bankrupt');
  s.money = 500;
  assert.equal(checkBankruptcy(s), 'ok');
  assert.equal(s.bankruptcyDays, 0);
});
