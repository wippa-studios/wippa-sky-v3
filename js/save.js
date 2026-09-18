// ═══════════════════════════════════════════
//  SAVE — Wippa Sky v2
// ═══════════════════════════════════════════

import { updateHighestFloor, updateBasementDepth } from './state.js';

const SAVE_KEY = 'wippa-sky-save-v2';
const SAVE_VERSION = 1;

export function saveGame(state) {
  try {
    const data = {
      version: SAVE_VERSION,
      money: state.money,
      population: state.population,
      satisfaction: state.satisfaction,
      rating: state.rating,
      day: state.day,
      dayTime: state.dayTime,
      speed: state.speed,
      cameraY: state.cameraY,
      zoom: state.zoom,
      cols: state.cols,
      landPurchases: state.landPurchases,
      highestFloor: state.highestFloor,
      basementDepth: state.basementDepth,
      totalBuilt: state.totalBuilt,
      cellTower: state.cellTower ? { ...state.cellTower } : null,
      settings: { ...state.settings },
      stats: {
        p95Wait: state.stats.p95Wait,
        moveOuts: state.stats.moveOuts,
        moveIns: state.stats.moveIns,
        complaintsThisWeek: state.stats.complaintsThisWeek,
      },
      achievements: [...state.achievementsUnlocked],
      grid: serializeGrid(state),
      elevators: serializeElevators(state),
      elevatorCars: serializeElevatorCars(state),
      tenants: serializeTenants(state),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    state.lastSaveTime = Date.now();
    return true;
  } catch (e) {
    console.error('Save failed:', e);
    return false;
  }
}

export function loadGame(state) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data.version !== SAVE_VERSION) {
      localStorage.removeItem(SAVE_KEY);
      return false;
    }

    // Shape validation BEFORE any mutation — a failed load must be a NO-OP.
    // (Old order assigned scalars first, so a throw inside deserializeGrid
    // left highestFloor/basementDepth stale with an empty grid and the renderer
    // painted a ghost tower silhouette: dark shell + crown + labels, no cells.)
    const cols = data.cols;
    const finite = v => v === undefined || Number.isFinite(v);
    if (!Array.isArray(data.grid) || !Array.isArray(data.elevators) ||
        !Array.isArray(data.elevatorCars) || !Array.isArray(data.tenants) ||
        !Number.isInteger(cols) || cols < 3 || cols > 40 ||
        !Number.isFinite(data.money) || !Number.isFinite(data.day) ||
        !Number.isFinite(data.dayTime) || !Number.isFinite(data.speed) ||
        !finite(data.zoom) || !finite(data.cameraY) || !finite(data.population) ||
        !finite(data.satisfaction) || !finite(data.rating)) {
      console.error('Load failed: malformed save data');
      localStorage.removeItem(SAVE_KEY);
      return false;
    }

    // Deserialize EVERYTHING into locals first. Nothing touches live state
    // until every risky step has succeeded. If any of these throws (malformed
    // elevator, a car referencing a dead shaft, ...), loadGame returns false
    // and the fallback initNewGame(true) starts from a genuinely clean slate
    // instead of half-written debris: orphan grid cells sitting below a
    // highestFloor of 0 are invisible to the renderer but still counted by
    // getFloorCount() and still block buildFloor support checks.
    const newGrid = deserializeGrid(data.grid, cols);
    const newElevators = deserializeElevators(data.elevators);
    const newCars = deserializeElevatorCars(data.elevatorCars);
    const newTenants = deserializeTenants(data.tenants);

    // ── Commit — plain assignments from here on; these cannot throw ──
    state.cols = cols;
    state.grid = newGrid;
    state.elevators = newElevators;
    state.elevatorCars = newCars;
    state.tenants = newTenants;
    // Recomputed from the committed grid — never trust the save's copy
    // (a stale highestFloor/basementDepth on an empty grid = ghost building).
    updateHighestFloor(state);
    updateBasementDepth(state);
    state.money = data.money;
    state.population = data.population ?? 0;
    state.satisfaction = data.satisfaction ?? 75;
    state.rating = data.rating ?? 1;
    state.day = data.day;
    state.dayTime = data.dayTime;
    state.speed = data.speed;
    state.cameraY = data.cameraY ?? 0;
    state.zoom = data.zoom ?? 1;
    state.landPurchases = data.landPurchases;
    state.totalBuilt = data.totalBuilt;
    state.settings = { ...state.settings, ...data.settings };
    state.stats = { ...data.stats, happinessHistory: [] };
    state.achievementsUnlocked = new Set(data.achievements || []);
    state.cellTower = data.cellTower && Number.isInteger(data.cellTower.col) &&
      data.cellTower.col >= 0 && data.cellTower.col < state.cols
      ? { col: data.cellTower.col, built: data.cellTower.built || data.day } : null;
    state.uiDirty = true;
    return true;
  } catch (e) {
    console.error('Load failed:', e);
    localStorage.removeItem(SAVE_KEY);
    return false;
  }
}

export function hasSave() {
  return localStorage.getItem(SAVE_KEY) !== null;
}

export function deleteSave() {
  localStorage.removeItem(SAVE_KEY);
}

export function exportSave() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  return btoa(raw);
}

export function importSave(encoded) {
  try {
    const raw = atob(encoded);
    JSON.parse(raw);
    localStorage.setItem(SAVE_KEY, raw);
    return true;
  } catch (e) {
    return false;
  }
}

function serializeGrid(state) {
  const sparse = [];
  for (const [row, cells] of state.grid) {
    for (let c = 0; c < state.cols; c++) {
      const cell = cells[c];
      if (cell) {
        sparse.push({ r: row, c, t: cell.type, b: cell.built, o: cell.occupancy,
          h: cell.happiness, m: cell.incomeMult, s: cell.staff,
          v: cell.vacant ? 1 : 0, vs: cell.vacantSince || 0 });
      }
    }
  }
  return sparse;
}

function deserializeGrid(sparse, cols) {
  const grid = new Map();
  for (const item of sparse) {
    if (item.t === 'cellTower') continue; // cell tower is metadata, not a grid cell
    let row = grid.get(item.r);
    if (!row) {
      row = new Array(cols).fill(null);
      grid.set(item.r, row);
    }
    row[item.c] = {
      type: item.t, built: item.b, occupancy: item.o,
      happiness: item.h, incomeMult: item.m, staff: item.s,
      vacant: item.v === 1, vacantSince: item.vs || 0,
      dirty: true,
    };
  }
  return grid;
}

function serializeElevators(state) {
  return state.elevators.map(e => ({
    id: e.id, col: e.col, kind: e.kind,
    floors: e.floors, floorMin: e.floorMin, floorMax: e.floorMax,
  }));
}

function deserializeElevators(data) {
  return data.map(e => ({ ...e }));
}

function serializeElevatorCars(state) {
  return state.elevatorCars.map(c => ({
    eid: c.elevatorId, pos: c.pos, dir: c.dir,
    cap: c.capacity, state: c.state, door: c.doorOpen,
    p: c.passengers.map(ps => ({ sid: ps.simId, df: ps.destFloor })),
  }));
}

function deserializeElevatorCars(data) {
  return data.map(c => ({
    elevatorId: c.eid, pos: c.pos, dir: c.dir,
    state: 'idle', doorOpen: 0, doorTimer: 0, doorPhase: null,
    // Passengers are not re-inked to sim objects on load; cars start empty and
    // the displaced sims (reset below) re-plan their trip.
    passengers: [],
    capacity: c.cap, stops: new Set(),
  }));
}

function serializeTenants(state) {
  return state.tenants.slice(0, 1500).map(t => ({
    id: t.id, k: t.kind, hf: t.home?.floor, hc: t.home?.col,
    wf: t.work?.floor, wc: t.work?.col, f: t.floor, c: t.col,
    x: t.x, m: t.mood, e: t.energy, fo: t.food, l: t.leisure,
    w: t.workNeed, s: t.state, tr: t.trait, n: t.name,
  }));
}

function deserializeTenants(data) {
  return data.map(t => {
    // A sim that was mid-ride / mid-queue when saved has no car to come back
    // to, so reset it to idle and let it plan a fresh trip.
    const transient = t.s === 'riding' || t.s === 'waitingElevator' || t.s === 'routeStep';
    return {
      id: t.id, kind: t.k,
      home: t.hf != null ? { floor: t.hf, col: t.hc } : null,
      work: t.wf != null ? { floor: t.wf, col: t.wc } : null,
      floor: t.f, col: t.c, x: t.x,
      walkTargetCol: t.c, walkTargetX: t.x,
      speed: 1.4,
      state: transient ? 'idle' : t.s,
      stateTimer: 1, activity: 'idle',
      mood: t.m, energy: t.e, food: t.fo, leisure: t.l, workNeed: t.w,
      patience: 100, waitSince: 0, complaints: 0, grudge: 0,
      itinerary: null, legIndex: 0, routePhase: null,
      _furiousDay: null, _noRouteCooldown: 0,
      _shiftJitter: Math.random() * 0.28,
      ridingCar: null,
      color: `hsl(${Math.random() * 360},58%,62%)`,
      skin: ['#f7c99b', '#d99a73', '#8d5524', '#f0b27a'][Math.floor(Math.random() * 4)],
      hair: ['#24180f', '#573b2a', '#18202b', '#c27a48'][Math.floor(Math.random() * 4)],
      direction: 1, targetFloor: t.f, targetCol: t.c, bubble: '', bubbleTimer: 0,
      trait: t.tr || 'workaholic',
      name: t.n || 'Unknown',
    };
  });
}
