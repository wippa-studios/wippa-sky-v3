import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../js/state.js';
import {
  getMoodBand, getMoodColor, getIncomeMult, calculateMood, updateNeeds, shouldMoveOut,
} from '../js/needs.js';

function fresh() {
  const s = createState();
  s.canvasW = 800; s.canvasH = 600; s.zoom = 1;
  return s;
}

function sim(over = {}) {
  return {
    id: 1, kind: 'resident', floor: 1, col: 0, x: 0.5,
    state: 'idle', activity: 'idle', mood: 70,
    energy: 100, food: 100, leisure: 100, workNeed: 0,
    patience: 100, waitSince: 0, bubbleTimer: 0, grudge: 0,
    ...over,
  };
}

test('mood bands map to the documented thresholds', () => {
  assert.equal(getMoodBand(80), 'content');
  assert.equal(getMoodBand(50), 'annoyed');
  assert.equal(getMoodBand(30), 'angry');
  assert.equal(getMoodBand(10), 'furious');
});

test('income multiplier rewards happy tenants and punishes furious ones', () => {
  assert.ok(getIncomeMult(90) > 1);
  assert.ok(getIncomeMult(50) < 1);
  assert.ok(getIncomeMult(30) < getIncomeMult(50));
  assert.ok(getIncomeMult(10) < getIncomeMult(30));
});

test('mood falls as needs are depleted', () => {
  const s = fresh();
  const happy = sim({ energy: 100, food: 100, leisure: 100 });
  const sad = sim({ energy: 0, food: 0, leisure: 0 });
  const mHappy = calculateMood(happy, s);
  const mSad = calculateMood(sad, s);
  assert.ok(mHappy > mSad);
  assert.ok(mHappy >= 70);
  assert.ok(mSad < 40);
});

test('resting recovers energy, commuting drains it', () => {
  const s = fresh();
  const resting = sim({ activity: 'resting', energy: 40 });
  updateNeeds(resting, s, 1);
  assert.ok(resting.energy > 40);

  const commuting = sim({ activity: 'commuting', energy: 40 });
  updateNeeds(commuting, s, 1);
  assert.ok(commuting.energy < 40);
});

test('long elevator waits drain mood', () => {
  const s = fresh();
  s.tick = 100; s.speed = 1;
  const waiting = sim({ state: 'waitingElevator', waitSince: 0, energy: 100, food: 100, leisure: 100 });
  const m = calculateMood(waiting, s);
  assert.ok(m < 70, 'a 100s wait should visibly hurt mood');
});

test('shouldMoveOut requires days of sustained fury', () => {
  const s = fresh();
  const furious = sim({ mood: 5 });
  s.day = 1;
  assert.equal(shouldMoveOut(furious, s), false);
  s.day = 3;
  assert.equal(shouldMoveOut(furious, s), true);
  furious.mood = 80;
  assert.equal(shouldMoveOut(furious, s), false);
});

test('mood colour is a valid hex for every band', () => {
  for (const m of [90, 50, 30, 10]) assert.match(getMoodColor(m), /^#[0-9a-f]{6}$/i);
});
