// ═══════════════════════════════════════════
//  STATE — Wippa Sky v2
// ═══════════════════════════════════════════

import { DEFAULT_COLS, LAND_PURCHASE_DEFAULT, towerShift } from './constants.js';

export function createState() {
  return {
    money: 500000, population: 0, satisfaction: 75, rating: 1,
    day: 1, tick: 0, dayTime: 0, speed: 1,
    week: 1, net: 0, residents: 0,
    cameraY: 0, cameraX: 0, zoom: 1,
    hoveredCell: null, selectedTool: 'select',
    grid: new Map(),
    cols: DEFAULT_COLS,
    landPurchases: LAND_PURCHASE_DEFAULT,
    elevators: [],
    elevatorCars: [],
    tenants: [],
    particles: [],
    clouds: [],
    stars: [],
    bgBuildings: [],
    cars: [],
    weather: [],
    notifications: [],
    dayPhase: 'morning',
    income: 0, expenses: 0, totalBuilt: 0,
    achievementsUnlocked: new Set(),
    soundEnabled: false,
    cellTower: null,
    highestFloor: 0,
    basementDepth: 0,
    moodOverlay: false,
    complainLog: [],
    settings: {
      dayLength: 90,
      reducedMotion: false,
      showMoodOverlay: false,
    },
    stats: {
      p95Wait: 0,
      moveOuts: 0,
      moveIns: 0,
      complaintsThisWeek: 0,
      happinessHistory: [],
    },
    weeklyReport: null,
    weekAccumulator: 0,
    bankruptcyDays: 0,
    pathCache: new Map(),
    spriteCache: new Map(),
    dirtyCells: new Set(),
    lastSaveTime: 0,
    uiDirty: true,
    // "Living tower" systems
    contracts: null,
    weather: null,
    events: null,
    director: null,
    news: [],
    mods: { mood: 0, expenseMult: 1, visitorMult: 1, parkDemand: 1, indoorDemand: 1 },
    overlay: 'none',
  };
}

export function getRow(state, row) {
  if (!state.grid.has(row)) state.grid.set(row, new Array(state.cols).fill(null));
  return state.grid.get(row);
}

export function getCell(state, row, col) {
  const r = state.grid.get(row);
  if (!r || col < 0 || col >= state.cols) return null;
  return r[col] || null;
}

export function setCell(state, row, col, cell) {
  const r = getRow(state, row);
  r[col] = cell;
}

export function removeCell(state, row, col) {
  const r = state.grid.get(row);
  if (r && col >= 0 && col < state.cols) {
    r[col] = null;
    const hasAny = r.some(c => c !== null);
    if (!hasAny) state.grid.delete(row);
  }
}

export function updateHighestFloor(state) {
  let highest = 0;
  for (const [row, cells] of state.grid) {
    if (row > highest && cells.some(Boolean)) highest = row;
  }
  state.highestFloor = highest;
}

export function updateBasementDepth(state) {
  let depth = 0;
  for (const [row] of state.grid) {
    if (row < depth) depth = row;
  }
  state.basementDepth = depth;
}

export function cellToScreen(state, row, col, canvasH, groundYOffset) {
  const towerLeft = (state.canvasW - state.cols * 80 * state.zoom) / 2;
  const baseY = canvasH - groundYOffset;
  return {
    x: towerLeft + col * 80 * state.zoom,
    y: baseY - (row + 1) * 40 * state.zoom + state.cameraY,
    w: 80 * state.zoom,
    h: 40 * state.zoom,
  };
}

export function screenToCell(state, sx, sy, canvasH, groundYOffset) {
  const zoom = state.zoom || 1;
  const towerLeft = (state.canvasW - state.cols * 80 * zoom) / 2 + towerShift(zoom);
  const baseY = canvasH - groundYOffset;
  const col = Math.floor((sx - towerLeft) / (80 * zoom));
  const row = Math.floor((baseY - sy + state.cameraY) / (40 * zoom));
  if (col >= 0 && col < state.cols) return { row, col };
  return null;
}
