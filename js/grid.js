// ═══════════════════════════════════════════
//  GRID — Wippa Sky v2
// ═══════════════════════════════════════════

import {
  MAX_FLOORS_ABOVE, MAX_BASEMENTS, CELL_W, CELL_H, GROUND_Y_OFFSET, towerShift,
  FLOOR_TYPES, DIG_COST_BASE, DIG_COST_PER_DEPTH,
  STANDARD_SHAFT_MAX_SPAN, EXPRESS_SHAFT_MAX_SPAN,
  CAR_UPGRADE_COST, MAX_CARS_PER_SHAFT, EXPRESS_CAPACITY,
  CELL_TOWER_MIN_FLOOR, CELL_TOWER_COST,
} from './constants.js';
import {
  getRow, getCell, setCell, removeCell,
  updateHighestFloor, updateBasementDepth,
} from './state.js';
import { createPerspective } from './render/perspective.js';

export function getCellTowerRoof(state, preferredCol = state.cellTower?.col) {
  let roofRow = -1;
  let roofCols = [];
  for (const [row, cells] of state.grid) {
    if (row < 0 || row < roofRow) continue;
    const cols = [];
    for (let col = 0; col < state.cols; col++) {
      if (cells[col]) cols.push(col);
    }
    if (cols.length) { roofRow = row; roofCols = cols; }
  }
  if (!roofCols.length) return null;
  const preferred = Number.isInteger(preferredCol) ? preferredCol : (state.cols - 1) / 2;
  const col = roofCols.reduce((best, c) => Math.abs(c - preferred) < Math.abs(best - preferred) ? c : best);
  return { row: roofRow, col };
}

export function getCellTowerStatus(state, row, col) {
  if (state.cellTower) return 'installed';
  const roof = getCellTowerRoof(state);
  if (state.highestFloor <= CELL_TOWER_MIN_FLOOR || !roof || roof.row <= CELL_TOWER_MIN_FLOOR) return 'locked';
  if (row !== undefined && (!Number.isInteger(col) || col < 0 || col >= state.cols ||
      (row !== roof.row && row !== roof.row + 1) || !getCell(state, roof.row, col))) return 'location';
  if (!Number.isFinite(state.money) || state.money < CELL_TOWER_COST) return 'funds';
  return 'ready';
}

export function installCellTower(state, row, col) {
  const status = getCellTowerStatus(state, row, col);
  if (row === undefined || status !== 'ready') return false;
  state.money -= CELL_TOWER_COST;
  state.cellTower = { col, built: state.day };
  state.uiDirty = true;
  return true;
}

export function canBuild(state, row, col, type) {
  if (type === 'cellTower') return row !== undefined && getCellTowerStatus(state, row, col) === 'ready';
  if (col < 0 || col >= state.cols) return false;
  if (row > MAX_FLOORS_ABOVE || row < -MAX_BASEMENTS) return false;
  if (getCell(state, row, col) !== null) return false;
  const cost = getBuildCost(state, row, type);
  if (!isFinite(cost) || state.money < cost) return false;

  if (row > 0) {
    // needs support below
    if (!getCell(state, row - 1, col)) return false;
  } else if (row < 0) {
    // basements dig downward: require the cell above (ground/B1...)
    if (!getCell(state, row + 1, col)) return false;
  }
  // row === 0 is ground: no support required
  return true;
}

export function getBuildCost(state, row, type) {
  if (type === 'cellTower') return CELL_TOWER_COST;
  const ft = FLOOR_TYPES[type];
  if (!ft) return Infinity;
  let cost = ft.cost;
  if (row < 0) {
    cost += DIG_COST_BASE + DIG_COST_PER_DEPTH * Math.abs(row);
  }
  return cost;
}

export function buildFloor(state, row, col, type) {
  if (type === 'cellTower') return installCellTower(state, row, col);
  if (!canBuild(state, row, col, type)) return false;
  const cost = getBuildCost(state, row, type);
  state.money -= cost;
  const cell = {
    type, built: state.day, occupancy: 0, happiness: 70,
    incomeMult: 1, staff: 0, dirty: true,
  };
  setCell(state, row, col, cell);
  state.totalBuilt++;

  if (type === 'elevator') {
    cell.elevatorId = -1;
    let elev = state.elevators.find(e => e.col === col);
    if (!elev) {
      const elevId = state.elevators.length;
      elev = { id: elevId, col, kind: 'standard', floors: [], floorMin: row, floorMax: row };
      state.elevators.push(elev);
      state.elevatorCars.push({
        elevatorId: elevId, pos: row, dir: 'idle',
        state: 'idle', doorOpen: 0, doorTimer: 0, doorPhase: null,
        passengers: [], capacity: 8, stops: new Set(),
      });
      cell.elevatorId = elevId;
    } else {
      cell.elevatorId = elev.id;
    }
    rebuildElevatorFloors(state, elev);
  }

  if (type === 'skyLobby') {
    cell.skyLobby = true;
  }

  if (type === 'subway' && row < -5) {
    cell.subwayActive = true;
  }

  if (type === 'service') {
    cell.serviceCount = (cell.serviceCount || 0) + 1;
  }

  updateHighestFloor(state);
  updateBasementDepth(state);

  // build dust in world units (col, row), y-up
  state.particles.push({
    x: col + 0.5, y: row + 0.5,
    vx: (Math.random() - 0.5) * 2.4,
    vy: 1.2 + Math.random() * 2.2,
    life: 0.6 + Math.random() * 0.5, maxLife: 1.1,
    size: 1.2 + Math.random() * 1.8,
    color: (FLOOR_TYPES[type] && FLOOR_TYPES[type].icon) || '🏗️',
  });

  invalidatePathCache(state);
  markDirtyNear(state, row, col);

  return true;
}

export function demolishFloor(state, row, col) {
  const cell = getCell(state, row, col);
  if (!cell) return false;
  if (row === 0 && cell.type === 'lobby') return false;

  if (cell.type === 'elevator') {
    const elev = state.elevators.find(e => e.col === col);
    if (elev) {
      rebuildElevatorFloors(state, elev);
      if (elev.floors.length === 0) {
        state.elevators = state.elevators.filter(e => e.id !== elev.id);
        state.elevatorCars = state.elevatorCars.filter(c => c.elevatorId !== elev.id);
      }
    }
  }

  removeTenantsForCell(state, row, col);

  const refund = Math.floor(getBuildCost(state, row, cell.type) * 0.3);
  state.money += refund;
  removeCell(state, row, col);

  updateHighestFloor(state);
  updateBasementDepth(state);
  invalidatePathCache(state);
  markDirtyNear(state, row, col);

  return { refund };
}

// Buy an extra car for an existing shaft (click a built shaft cell with the
// Elevator tool). Returns a result object or null.
export function addElevatorCar(state, row, col) {
  const cell = getCell(state, row, col);
  if (!cell || cell.type !== 'elevator') return null;
  const elev = state.elevators.find(e => e.col === col);
  if (!elev) return null;
  const cars = state.elevatorCars.filter(c => c.elevatorId === elev.id);
  if (state.money < CAR_UPGRADE_COST) return { error: 'funds' };
  state.money -= CAR_UPGRADE_COST;
  state.elevatorCars.push({
    elevatorId: elev.id, pos: elev.floorMin, dir: 'idle',
    state: 'idle', doorOpen: 0, doorTimer: 0, doorPhase: null,
    passengers: [], capacity: elev.kind === 'express' ? EXPRESS_CAPACITY : 8,
    stops: new Set(),
  });
  return { cars: cars.length + 1, cost: CAR_UPGRADE_COST };
}

export function rebuildElevatorFloors(state, elev) {
  elev.floors = [];
  for (const [row] of state.grid) {
    const cell = getCell(state, row, elev.col);
    if (cell && cell.type === 'elevator') {
      elev.floors.push(row);
    }
  }
  elev.floors.sort((a, b) => a - b);
  if (elev.floors.length > 0) {
    elev.floorMin = elev.floors[0];
    elev.floorMax = elev.floors[elev.floors.length - 1];
  }
}

export function removeTenantsForCell(state, floor, col) {
  state.tenants = state.tenants.filter(t => !(t.floor === floor && t.col === col));
}

export function getFloorCount(state) {
  let count = 0;
  for (const [row, cells] of state.grid) {
    if (row === 0) continue;
    for (let c = 0; c < state.cols; c++) {
      const cell = cells[c];
      if (cell && cell.type !== 'elevator' && cell.type !== 'lobby') {
        count++;
        break;
      }
    }
  }
  return count;
}

export function getCellCount(state) {
  let count = 0;
  for (const [, cells] of state.grid) {
    for (let c = 0; c < state.cols; c++) {
      if (cells[c]) count++;
    }
  }
  return count;
}

export function getAllCellsOfType(state, type) {
  const cells = [];
  for (const [row, rowCells] of state.grid) {
    for (let c = 0; c < state.cols; c++) {
      const cell = rowCells[c];
      if (cell && cell.type === type) {
        cells.push({ row, col: c, cell });
      }
    }
  }
  return cells;
}

export function getCellsInRadius(state, row, col, radiusRow, radiusCol) {
  const cells = [];
  for (const [r, rowCells] of state.grid) {
    if (Math.abs(r - row) > radiusRow) continue;
    for (let c = 0; c < state.cols; c++) {
      if (Math.abs(c - col) > radiusCol) continue;
      const cell = rowCells[c];
      if (cell) cells.push({ row: r, col: c, cell });
    }
  }
  return cells;
}

export function markDirtyNear(state, row, col) {
  state.dirtyCells.add(`${row},${col}`);
  for (let dr = -5; dr <= 5; dr++) {
    for (let dc = -5; dc <= 5; dc++) {
      state.dirtyCells.add(`${row + dr},${col + dc}`);
    }
  }
}

export function invalidatePathCache(state) {
  state.pathCache.clear();
}

export function cellToScreenLocal(state, row, col) {
  const zoom = state.zoom || 1;
  const towerLeft = (state.canvasW - state.cols * CELL_W * zoom) / 2 + towerShift(zoom);
  const baseY = (state.canvasH || 600) - GROUND_Y_OFFSET;
  return {
    x: towerLeft + col * CELL_W * zoom,
    y: baseY - (row + 1) * CELL_H * zoom + state.cameraY,
    w: CELL_W * zoom,
    h: CELL_H * zoom,
  };
}

// One-point perspective transform — single source of truth lives in
// perspective.js; everything (tower cells, elevators, sims, input) uses it.
export function cellToScreenPerspective(state, row, col) {
  const P = createPerspective(state);
  // NOTE: project(col, row) — col is the first argument in perspective.js
  return P.project(col, row);
}

// Inverse perspective for pointer input: screen point → { row, col | null }.
export function screenToCellPerspective(state, sx, sy) {
  return createPerspective(state).screenToCell(sx, sy);
}
