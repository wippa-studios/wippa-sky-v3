// Render smoke tests — the pure-logic suites never exercise the draw path, so
// a missing import (ReferenceError) or a broken draw call could ship silently.
// These run every frame function against a stub canvas context.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── stub canvas environment (installed before the modules are imported) ──
function makeCtx(track = { calls: 0 }) {
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get(_t, prop) {
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => { track.gradients = (track.gradients || 0) + 1; return grad; };
      }
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'canvas') return { width: 1280, height: 720 };
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
      if (prop === 'createImageData') return (w = 1, h = 1) => ({
        data: new Uint8ClampedArray(w * h * 4), width: w, height: h,
      });
      return () => { track.calls++; };
    },
    set() { return true; },
  });
}
const fakeCanvas = () => ({ width: 1280, height: 720, getContext: () => makeCtx() });

globalThis.document = {
  createElement: fakeCanvas,
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
};
globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener: () => {} };
globalThis.performance = globalThis.performance || { now: () => 0 };
globalThis.requestAnimationFrame = () => 0;

const { createState } = await import('../js/state.js');
const { buildFloor } = await import('../js/grid.js');
const { drawSky, initSky } = await import('../js/render/sky.js');
const { drawGround, initGround } = await import('../js/render/ground.js');
const { drawTower } = await import('../js/render/tower.js');
const { drawElevatorShafts } = await import('../js/elevators.js');
const { drawSims } = await import('../js/sims.js');
const { drawMinimap } = await import('../js/render/minimap.js');
const { applyAtmosphere } = await import('../js/render/post.js');
const { geometry } = await import('../js/render/volume.js');
const { nightAmount } = await import('../js/constants.js');

function baseState() {
  const s = createState();
  s.canvasW = 1280; s.canvasH = 720; s.zoom = 1; s.cameraY = 0;
  initSky(s, s.canvasW, s.canvasH);
  initGround(s, s.canvasW);
  return s;
}

function drawEverything(s) {
  const ctx = makeCtx();
  const canvas = fakeCanvas();
  drawSky(ctx, s, s.canvasW, s.canvasH);
  drawGround(ctx, s, s.canvasW, s.canvasH);
  drawTower(ctx, s);
  drawElevatorShafts(ctx, s);
  drawSims(ctx, s);
  applyAtmosphere(ctx, canvas, s, geometry(s), nightAmount(s.dayTime || 0));
  drawMinimap(ctx, s, fakeCanvas());
  return ctx;
}

test('the full render pipeline draws a built tower without throwing', () => {
  const s = baseState();
  s.money = 1e9;
  for (let r = 0; r <= 12; r++) buildFloor(s, r, 4, r === 0 ? 'lobby' : 'office');
  for (let r = 0; r <= 12; r++) buildFloor(s, r, 0, 'elevator');
  s.tenants = [];
  assert.doesNotThrow(() => drawEverything(s));
});

test('a ghost state (stale highestFloor + empty grid) draws no silhouette', () => {
  const s = baseState();
  s.grid = new Map();       // empty — as after a corrupt load
  s.highestFloor = 21;      // stale derived value
  s.basementDepth = 0;
  const track = { calls: 0 };
  const ctx = makeCtx(track);
  assert.doesNotThrow(() => drawTower(ctx, s));
  assert.equal(track.gradients || 0, 0, 'no silhouette gradients for a ghost tower');
});

test('a real tower does paint silhouette effects', () => {
  const s = baseState();
  s.money = 1e9;
  for (let r = 0; r <= 21; r++) buildFloor(s, r, 4, 'office');
  assert.equal(s.highestFloor, 21);
  const track = { calls: 0 };
  const ctx = makeCtx(track);
  drawTower(ctx, s);
  assert.ok((track.gradients || 0) > 0, 'silhouette gradients present for a real tower');
});
