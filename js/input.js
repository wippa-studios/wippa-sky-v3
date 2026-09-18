// ═══════════════════════════════════════════
//  INPUT — Wippa Sky v2
// ═══════════════════════════════════════════

import { getCell } from './state.js';
import { canBuild, buildFloor, demolishFloor, addElevatorCar, installCellTower, getCellTowerStatus, getCellTowerRoof, screenToCellPerspective } from './grid.js';
import { scrollBy, setZoom, goToFloor, getCameraClamp, autoFollowBuild } from './camera.js';
import { showInfoPanel, closeInfoPanel, addLog, showToast, closeWeeklyReport } from './hud.js';
import { FLOOR_TYPES, CAR_UPGRADE_COST, CELL_TOWER_COST, CELL_TOWER_MIN_FLOOR } from './constants.js';
import { spawnSimsForCell } from './sims.js';

let isDragging = false;
let dragStartY = 0;
let dragStartX = 0;
let dragStartCamY = 0;
let pressValid = true;
let isPanning = false;
let isRightDragging = false;
let rightDragStartY = 0;
let rightDragStartCamY = 0;
let spaceHeld = false;

export function initInput(state, canvas, minimapCanvas) {
  const handlers = {
    mousedown: e => handleMouseDown(e, state, canvas),
    mousemove: e => handleMouseMove(e, state, canvas),
    mouseup: e => handleMouseUp(e, state, canvas),
    mouseleave: e => handleMouseLeave(e, state),
    wheel: e => handleWheel(e, state, canvas),
    contextmenu: e => e.preventDefault(),
  };
  for (const [type, fn] of Object.entries(handlers)) {
    canvas.addEventListener(type, fn, type === 'wheel' ? { passive: false } : undefined);
  }
  state._inputHandlers = handlers;

  minimapCanvas.addEventListener('mousedown', e => handleMinimapMouseDown(e, state, minimapCanvas));
  minimapCanvas.addEventListener('mousemove', e => handleMinimapMouseMove(e, state, minimapCanvas));
  minimapCanvas.addEventListener('mouseup', e => handleMinimapMouseUp(e, state, minimapCanvas));

  const keydown = e => handleKeyDown(e, state);
  const keyup = e => handleKeyUp(e, state);
  document.addEventListener('keydown', keydown);
  document.addEventListener('keyup', keyup);
  const onResize = () => {
    state.canvasW = window.innerWidth;
    state.canvasH = window.innerHeight;
  };
  window.addEventListener('resize', onResize);
  state._inputTeardown = () => {
    for (const [type, fn] of Object.entries(handlers)) {
      canvas.removeEventListener(type, fn);
    }
    document.removeEventListener('keydown', keydown);
    document.removeEventListener('keyup', keyup);
    window.removeEventListener('resize', onResize);
    state._inputHandlers = null;
    state._inputTeardown = null;
  };
}

function handleMouseDown(e, state, canvas) {
  if (e.button === 0) {
    // Every left press starts as a click candidate. Building happens on
    // release only if the press never turned into a pan/drag.
    isDragging = true;
    pressValid = !spaceHeld;
    isPanning = spaceHeld;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartCamY = state.cameraY;
  } else if (e.button === 2 || e.button === 1) {
    isRightDragging = true;
    rightDragStartY = e.clientY;
    rightDragStartCamY = state.cameraY;
    e.preventDefault();
  }
}

function handleMouseMove(e, state, canvas) {
  if (isRightDragging) {
    const dy = rightDragStartY - e.clientY;
    state.cameraY = rightDragStartCamY + dy;
    clampCamera(state);
    return;
  }
  if (isDragging) {
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (Math.hypot(dx, dy) > 5) {
      pressValid = false;
      if (spaceHeld || state.selectedTool === 'select') isPanning = true;
    }
    if (isPanning) {
      state.cameraY = dragStartCamY + (dragStartY - e.clientY);
      clampCamera(state);
      return;
    }
    if (!pressValid) return;
  }
  state.hoveredCell = screenToCellPerspective(state, e.clientX, e.clientY);

  const edgeThreshold = 40;
  if (state.selectedTool !== 'select' && state.selectedTool !== 'demolish') {
    if (e.clientY < edgeThreshold) {
      state._edgePan = -2;
    } else if (e.clientY > state.canvasH - edgeThreshold) {
      state._edgePan = 2;
    } else {
      state._edgePan = 0;
    }
  } else {
    state._edgePan = 0;
  }
}

function handleMouseUp(e, state, canvas) {
  if (isRightDragging) {
    isRightDragging = false;
    return;
  }
  if (isDragging) {
    isDragging = false;
    const moved = Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY);
    if (pressValid && moved < 5) handleClick(state, e.clientX, e.clientY);
  }
  pressValid = true;
  isPanning = false;
  state._edgePan = 0;
}

function handleMouseLeave(e, state) {
  if (isRightDragging) isRightDragging = false;
  isDragging = false;
  pressValid = true;
  isPanning = false;
  state._edgePan = 0;
  state.hoveredCell = null;
}

function handleClick(state, sx, sy) {
  const cell = screenToCellPerspective(state, sx, sy);
  if (!cell) return;
  const { row, col } = cell;

  if (state.selectedTool === 'select') {
    showInfoPanel(state, row, col);
    return;
  }
  if (state.selectedTool === 'demolish') {
    const result = demolishFloor(state, row, col);
    if (result) {
      addLog(state, `💥 Demolished floor ${row < 0 ? 'B' + Math.abs(row) : 'F' + (row + 1)}. Refunded $${(result.refund / 1000).toFixed(0)}k`, 'expense');
    }
    return;
  }
  if (state.selectedTool === 'cellTower') {
    handleClickCellTower(state, row, col);
    return;
  }
  // Elevator tool doubles as a "buy another car" action on built shafts.
  if (state.selectedTool === 'elevator') {
    const existing = getCell(state, row, col);
    if (existing && existing.type === 'elevator') {
      const res = addElevatorCar(state, row, col);
      if (res && res.error === 'funds') {
        addLog(state, `🔼 Need $${CAR_UPGRADE_COST.toLocaleString()} for another car.`, 'warning');
      } else if (res) {
        addLog(state, `🔼 Added car ${res.cars} to the shaft (−$${res.cost.toLocaleString()}).`, 'info');
        showToast(`Elevator car ${res.cars} added`, 'success');
      }
      return;
    }
  }
  if (canBuild(state, row, col, state.selectedTool)) {
    const success = buildFloor(state, row, col, state.selectedTool);
    if (success) {
      addLog(state, `${FLOOR_TYPES[state.selectedTool].icon} Built ${FLOOR_TYPES[state.selectedTool].name} on ${row < 0 ? 'B' + Math.abs(row) : 'F' + (row + 1)}`, 'info');
      autoFollowBuild(state, row);
      if (state.selectedTool !== 'elevator' && state.selectedTool !== 'lobby') {
        spawnSimsForCell(state, row, col, state.selectedTool);
      }
    }
  }
}

function handleClickCellTower(state, row, col) {
  const status = getCellTowerStatus(state, row, col);
  if (status === 'ready') {
    if (installCellTower(state, row, col)) {
      addLog(state, `📡 Cell tower installed on the roof (−$${CELL_TOWER_COST.toLocaleString()}). Leasing antenna space.`, 'income');
      showToast('CELL TWR installed on the roof', 'success');
    }
    return;
  }
  if (status === 'installed') {
    showToast('A cell tower already stands on the roof.', 'info');
  } else if (status === 'locked') {
    addLog(state, `📡 CELL TWR unlocks once the tower passes floor ${CELL_TOWER_MIN_FLOOR + 1}.`, 'warning');
    showToast(`Locked — reach floor ${CELL_TOWER_MIN_FLOOR + 1}`, 'warning');
  } else if (status === 'location') {
    const roof = getCellTowerRoof(state);
    addLog(state, '📡 Click the current roof (or the space directly above it) to install.', 'warning');
    showToast(roof ? `Install on F${roof.row + 1} or F${roof.row + 2}` : 'No roof to mount on', 'warning');
  } else if (status === 'funds') {
    addLog(state, `📡 Need $${CELL_TOWER_COST.toLocaleString()} to install the cell tower.`, 'warning');
    showToast(`Need $${CELL_TOWER_COST.toLocaleString()}`, 'warning');
  }
}

function handleWheel(e, state, canvas) {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(state, state.zoom + zoomDelta);
  } else {
    state.cameraY += e.deltaY * 0.8;
    clampCamera(state);
  }
}

let minimapDragging = false;

function handleMinimapMouseDown(e, state, minimapCanvas) {
  minimapDragging = true;
  navigateMinimap(e, state, minimapCanvas);
}

function handleMinimapMouseMove(e, state, minimapCanvas) {
  if (minimapDragging) navigateMinimap(e, state, minimapCanvas);
}

function handleMinimapMouseUp(e, state, minimapCanvas) {
  minimapDragging = false;
}

function navigateMinimap(e, state, minimapCanvas) {
  const rect = minimapCanvas.getBoundingClientRect();
  const y = e.clientY - rect.top;
  const ratio = y / minimapCanvas.height;
  const highest = state.highestFloor + 2;
  const lowest = Math.min(state.basementDepth - 2, -2);
  const totalFloors = highest - lowest;
  state._targetCameraY = (1 - ratio) * totalFloors * 40 * state.zoom - state.canvasH / 2;
  clampCamera(state);
}

function handleKeyDown(e, state) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === ' ') { e.preventDefault(); spaceHeld = true; }
  if (e.key === 'Escape') { closeInfoPanel(); closeWeeklyReport(); }
  if (e.key === 'h' || e.key === 'H') {
    state.moodOverlay = !state.moodOverlay;
    state.settings.showMoodOverlay = state.moodOverlay;
    const cb = document.getElementById('mood-overlay-toggle');
    if (cb) cb.checked = state.moodOverlay;
    showToast(state.moodOverlay ? 'Mood overlay ON' : 'Mood overlay OFF', 'info');
  }
  if (e.key === '1') document.querySelector('[data-tool="office"]')?.click();
  if (e.key === '2') document.querySelector('[data-tool="residence"]')?.click();
  if (e.key === '3') document.querySelector('[data-tool="hotel"]')?.click();
  if (e.key === '4') document.querySelector('[data-tool="shop"]')?.click();
  if (e.key === '5') document.querySelector('[data-tool="restaurant"]')?.click();
  if (e.key === '6') document.querySelector('[data-tool="cinema"]')?.click();
  if (e.key === '7') document.querySelector('[data-tool="park"]')?.click();
  if (e.key === '8') document.querySelector('[data-tool="spa"]')?.click();
  if (e.key === 'e' || e.key === 'E') document.querySelector('[data-tool="elevator"]')?.click();
  if (e.key === 'd' || e.key === 'Delete') document.querySelector('[data-tool="demolish"]')?.click();
  if (e.key === 's' || e.key === 'S') document.querySelector('[data-tool="select"]')?.click();
  if (e.key === 'ArrowUp') { e.preventDefault(); scrollBy(state, -80); }
  if (e.key === 'ArrowDown') { e.preventDefault(); scrollBy(state, 80); }
  if (e.key === 'PageUp') { e.preventDefault(); scrollBy(state, -80 * 5); }
  if (e.key === 'PageDown') { e.preventDefault(); scrollBy(state, 80 * 5); }
  if (e.key === 'Home') { e.preventDefault(); goToFloor(state, 0); }
  if (e.key === 'End') { e.preventDefault(); goToFloor(state, state.highestFloor + 5); }
}

function handleKeyUp(e, state) {
  if (e.key === ' ') spaceHeld = false;
}

function clampCamera(state) {
  const clamp = getCameraClamp(state);
  state.cameraY = Math.max(clamp.minCamY, Math.min(clamp.maxCamY, state.cameraY));
}
