// ═══════════════════════════════════════════
//  CAMERA — Wippa Sky v2
// ═══════════════════════════════════════════

import { CELL_W, CELL_H, GROUND_Y_OFFSET, MAX_FLOORS_ABOVE, MAX_BASEMENTS } from './constants.js';

export function initCamera(state) {
  state.canvasW = window.innerWidth;
  state.canvasH = window.innerHeight;
  state.zoom = Math.min(1, Math.max(0.62, state.canvasW / 760));
}

export function getCameraClamp(state) {
  const zoom = state.zoom || 1;
  const canvasH = state.canvasH || 600;
  const baseY = canvasH - GROUND_Y_OFFSET;
  // Keep the roof clear of the top HUD and the deepest basement clear of the
  // bottom toolbar.
  const topMargin = 120;
  const bottomMargin = 110;

  const highest = state.highestFloor || 0;
  const depth = Math.min(0, state.basementDepth || 0);

  // Content extent in screen space when cameraY === 0.
  const contentTop = baseY - (highest + 1) * CELL_H * zoom;
  const contentBottom = baseY + Math.abs(depth) * CELL_H * zoom + CELL_H * zoom;

  // cameraY only ever moves content DOWN from the natural ground-at-baseline
  // framing (to reveal a tall tower's top) or UP (to reveal deep basements).
  const maxCamY = Math.max(0, topMargin - contentTop);
  const minCamY = Math.min(0, (canvasH - bottomMargin) - contentBottom);
  return { minCamY, maxCamY };
}

export function clampCamera(state) {
  const { minCamY, maxCamY } = getCameraClamp(state);
  state.cameraY = Math.max(minCamY, Math.min(maxCamY, state.cameraY));
}

export function smoothCamera(state, dt) {
  if (state._targetCameraY !== undefined) {
    const diff = state._targetCameraY - state.cameraY;
    state.cameraY += diff * Math.min(1, dt * 4);
    if (Math.abs(diff) < 0.5) {
      state.cameraY = state._targetCameraY;
      delete state._targetCameraY;
    }
  }
  clampCamera(state);
}

export function autoFollowBuild(state, row) {
  const towerTop = state.canvasH - GROUND_Y_OFFSET - (row + 2) * CELL_H * state.zoom + state.cameraY;
  const towerBot = state.canvasH - GROUND_Y_OFFSET - (row - 1) * CELL_H * state.zoom + state.cameraY;
  if (towerTop < 0 || towerBot > state.canvasH) {
    state._targetCameraY = Math.max(
      getCameraClamp(state).minCamY,
      Math.min(
        getCameraClamp(state).maxCamY,
        (row - 5) * CELL_H * state.zoom
      )
    );
  }
}

export function handleResize(state) {
  const canvasH = state.canvasH || 600;
  const zoom = state.zoom || 1;
  const baseY = canvasH - GROUND_Y_OFFSET;
  const centerY = canvasH / 2;
  // which (fractional) row sits at the vertical centre right now
  const rowAtCenter = (centerY - baseY + (state.cameraY || 0)) / (CELL_H * zoom) - 1;

  state.canvasW = window.innerWidth;
  state.canvasH = window.innerHeight;
  state.zoom = Math.min(1, Math.max(0.62, state.canvasW / 760));

  const newBaseY = state.canvasH - GROUND_Y_OFFSET;
  state.cameraY = state.canvasH / 2 - newBaseY + (rowAtCenter + 1) * CELL_H * state.zoom;
  clampCamera(state);
}

export function goToFloor(state, floor) {
  state._targetCameraY = Math.max(
    getCameraClamp(state).minCamY,
    Math.min(
      getCameraClamp(state).maxCamY,
      floor * CELL_H * state.zoom
    )
  );
}

export function scrollBy(state, delta) {
  state.cameraY += delta;
  clampCamera(state);
}

export function setZoom(state, newZoom) {
  state.zoom = Math.max(0.5, Math.min(1.6, newZoom));
  clampCamera(state);
}
