// ═══════════════════════════════════════════════════════════════
//  MAIN — Wippa Sky
// ═══════════════════════════════════════════════════════════════

import { DAY_LENGTH_SECONDS, FLOOR_TYPES, nightAmount, DEFAULT_COLS, LAND_PURCHASE_DEFAULT } from './constants.js';
import { createState } from './state.js';
import { buildFloor, addElevatorCar } from './grid.js';
import { initCamera, handleResize, smoothCamera, getCameraClamp } from './camera.js';
import { initInput } from './input.js';
import { updateHUD, addLog, showToast, showAchievementPopup, showWeeklyReport, closeWeeklyReport } from './hud.js';
import { checkAchievements } from './achievements.js';
import { initDispatch, updateDispatch } from './dispatch.js';
import { updateElevatorVisuals, drawElevatorShafts } from './elevators.js';
import { spawnSimsForCell, updateSims, drawSims, rebuildVenues, syncOccupancy, simAlightedOnFloor } from './sims.js';
import { updateNeeds, calculateMood, updateCellMoodAndIncome, applyConsequences } from './needs.js';
import { tickEconomy, checkBankruptcy, applyEmergencyLoan } from './economy.js';
import { initSky, updateSky, drawSky } from './render/sky.js';
import { initGround, updateGround, drawGround } from './render/ground.js';
import { drawTower } from './render/tower.js';
import { geometry } from './render/volume.js';
import { applyAtmosphere } from './render/post.js';
import { drawWeatherSky, drawWeatherFront } from './render/weather.js';
import { initContracts, updateContracts, contractsOnDay, rankOf } from './contracts.js';
import { initEvents, pushNews, directorTick, eventsOnDay, recomputeMods } from './events.js';
import { initWeather, updateWeather, weatherOnDay } from './weather.js';
import { drawMinimap, updateMinimapThrottled } from './render/minimap.js';
import { saveGame, loadGame } from './save.js';

let canvas, ctx, minimapCanvas, minimapCtx;
let state;
let lastTime = 0;
let autoSaveTimer = 0;
let systemTimer = 0;

export function init() {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
  minimapCanvas = document.getElementById('minimap-canvas');
  minimapCtx = minimapCanvas.getContext('2d');

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  state = createState();
  state.canvasW = canvas.width;
  state.canvasH = canvas.height;
  window.__wippa = state; // debug/testing hook
  window.__wippa_debug = {
    state: () => state,
    build: (row, col, type) => buildFloor(state, row, col, type),
    spawn: (row, col, type) => spawnSimsForCell(state, row, col, type),
    addCar: (row, col) => addElevatorCar(state, row, col),
    rebuild: () => { rebuildVenues(state); syncOccupancy(state); updateCellMoodAndIncome(state); tickEconomy(state); },
  };

  initCamera(state);
  initInput(state, canvas, minimapCanvas);

  // Bridge modules without coupling them: sims own the trip state machine,
  // dispatch owns the cars. These hooks let a car hand a sim back on arrival.
  state._simHooks = {
    onAlight: (sim, floor, car) => simAlightedOnFloor(state, sim, floor, car),
  };
  state._uiHooks = {
    complaint: (sim, reason, floor) => {
      addLog(state, `⚠️ ${reason} (${floorLabel(floor)})`, 'warning');
    },
    event: (text, type) => addLog(state, text, type || 'info'),
    news: () => { state.uiNewsDirty = true; },
  };

  const loaded = loadGame(state);
  if (!loaded) initNewGame();

  initSky(state, state.canvasW, state.canvasH);
  initGround(state, state.canvasW);
  initDispatch(state);
  initContracts(state);
  initEvents(state);
  initWeather(state);
  rebuildVenues(state);
  syncOccupancy(state);

  setupToolbar();
  setupSpeedControls();
  setupSoundToggle();
  setupSettingsMenu();

  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    state.canvasW = canvas.width;
    state.canvasH = canvas.height;
    handleResize(state);
    initSky(state, state.canvasW, state.canvasH);
    initGround(state, state.canvasW);
  });

  addLog(state, '🏗️ Welcome to Wippa Sky', 'info');
  addLog(state, '💡 Pick a tool, then click the tower to build.', 'info');
  addLog(state, '🔼 Extend elevator shafts to every floor you want to serve — sims cannot teleport.', 'info');
  addLog(state, '➕ Click a built shaft cell with the Elevator tool to add another car ($15k).', 'info');
  addLog(state, '🔑 1-8 tools • E elevator • H mood overlay • Space pause', 'info');
  if (loaded) addLog(state, `💾 Loaded save from Day ${state.day}`, 'info');

  requestAnimationFrame(gameLoop);
}

// ── starter tower ─────────────────────────────────────────────

function initNewGame() {
  // "New game" must mean a genuinely empty lot. state.grid is the one big
  // collection that used to survive this reset: a load that failed AFTER
  // deserializeGrid had written cells left orphan floors behind — invisible to
  // the renderer (it bounds by highestFloor) but still counted by
  // getFloorCount()/getCellCount() and still blocking build support checks.
  state.grid.clear();
  state.cellTower = null;
  state.totalBuilt = 0;
  state.highestFloor = 0;
  state.basementDepth = 0;
  state.money = 500000;
  state.cameraY = 0;
  state.zoom = 1;
  state.cols = DEFAULT_COLS;
  state.landPurchases = LAND_PURCHASE_DEFAULT;
  state.elevators = [];
  state.elevatorCars = [];
  state.tenants = [];
  state.particles = [];
  state.clouds = [];
  state.stars = [];
  state.bgBuildings = [];
  state.cars = [];
  state.weather = [];
  state.notifications = [];
  state.achievementsUnlocked = new Set();
  state.settings = {
    dayLength: 90,
    reducedMotion: false,
    showMoodOverlay: false,
  };
  state.stats = {
    p95Wait: 0,
    moveOuts: 0,
    moveIns: 0,
    complaintsThisWeek: 0,
    happinessHistory: [],
  };
  state.achievementsUnlocked = new Set();
  state.uiDirty = true;
  state.contracts = null;
  state.weather = null;
  state.events = null;
  state.director = null;
  state.news = [];
  state.mods = { mood: 0, expenseMult: 1, visitorMult: 1, parkDemand: 1, indoorDemand: 1 };
  state.overlay = 'none';

  // Full starter: 4 floors of offices, shops, residences and leisure, pre-
  // populated with sims, so a new game opens on a living, buildable tower.
  const rows = {
    0: ['elevator', 'lobby', 'lobby', 'lobby', 'elevator', 'lobby', 'lobby', 'lobby', 'elevator'],
    1: ['elevator', 'office', 'shop', 'restaurant', 'elevator', 'office', 'shop', 'residence', 'elevator'],
    2: ['elevator', 'office', 'residence', 'residence', 'elevator', 'residence', 'office', 'office', 'elevator'],
    3: ['elevator', 'residence', 'office', 'office', 'elevator', 'park', 'cinema', 'spa', 'elevator'],
  };
  for (const key of Object.keys(rows)) {
    const row = Number(key);
    const types = rows[key];
    for (let c = 0; c < types.length; c++) buildFloor(state, row, c, types[c]);
  }
  for (const key of Object.keys(rows)) {
    const row = Number(key);
    const types = rows[key];
    for (let c = 0; c < types.length; c++) {
      const type = types[c];
      if (type === 'elevator' || type === 'lobby') continue;
      spawnSimsForCell(state, row, c, type);
    }
  }

  rebuildVenues(state);
  syncOccupancy(state);
  updateCellMoodAndIncome(state);
  tickEconomy(state);
}

// ── UI wiring ─────────────────────────────────────────────────

function setupToolbar() {
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedTool = btn.dataset.tool;
      closeInfoPanel();
    });
  });
}

function setupSpeedControls() {
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.speed = parseInt(btn.dataset.speed);
    });
  });
}

function setupSoundToggle() {
  const btn = document.getElementById('sound-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    btn.textContent = state.soundEnabled ? '🔊' : '🔇';
  });
}

function setupSettingsMenu() {
  const settingsBtn = document.getElementById('settings-btn');
  const settingsPanel = document.getElementById('settings-panel');
  const settingsClose = document.getElementById('settings-close');
  const saveBtn = document.getElementById('save-btn');
  const loadBtn = document.getElementById('load-btn');
  const newBtn = document.getElementById('new-btn');

  settingsBtn?.addEventListener('click', () => settingsPanel?.classList.toggle('visible'));
  settingsClose?.addEventListener('click', () => settingsPanel?.classList.remove('visible'));

  saveBtn?.addEventListener('click', () => {
    const ok = saveGame(state);
    showToast(ok ? 'Game saved!' : 'Save failed!', ok ? 'success' : 'error');
  });
  loadBtn?.addEventListener('click', () => {
    if (loadGame(state)) {
      showToast('Game loaded!', 'success');
      initSky(state, state.canvasW, state.canvasH);
      initGround(state, state.canvasW);
      initDispatch(state);
      rebuildVenues(state);
      syncOccupancy(state);
    } else {
      showToast('No save found!', 'error');
    }
  });
  newBtn?.addEventListener('click', () => {
    if (confirm('Start a new tower? Current progress will be lost.')) {
      state = createState();
      state.canvasW = canvas.width;
      state.canvasH = canvas.height;
      window.__wippa = state;
      state._simHooks = { onAlight: (sim, floor, car) => simAlightedOnFloor(state, sim, floor, car) };
      state._uiHooks = { complaint: (sim, r, f) => addLog(state, `⚠️ ${r} (${floorLabel(f)})`, 'warning'), event: (t, ty) => addLog(state, t, ty || 'info') };
      initCamera(state);
      initNewGame();
      initSky(state, state.canvasW, state.canvasH);
      initGround(state, state.canvasW);
      initDispatch(state);
      showToast('New tower started!', 'info');
    }
  });

  const reducedMotionToggle = document.getElementById('reduced-motion');
  reducedMotionToggle?.addEventListener('change', () => { state.settings.reducedMotion = reducedMotionToggle.checked; });

  const moodOverlayToggle = document.getElementById('mood-overlay-toggle');
  moodOverlayToggle?.addEventListener('change', () => {
    state.moodOverlay = moodOverlayToggle.checked;
    state.settings.showMoodOverlay = state.moodOverlay;
  });
}

function closeInfoPanel() {
  document.getElementById('info-panel')?.classList.remove('visible');
}

function floorLabel(row) {
  return row < 0 ? 'B' + Math.abs(row) : 'F' + (row + 1);
}

// ── game loop ─────────────────────────────────────────────────

function gameLoop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;
  state.tick += dt * state.speed;

  if (state.speed > 0) {
    const sdt = dt * state.speed;
    // Speed-adjusted dayTime progression:
    // Speed 1: 1 hour game time per real second
    // Speed 2: 6 hours game time per real second  
    // Speed 3: 1 game day per real minute
    if (state.speed === 1) {
      // Normal: 1 hour game time per real second
      // dayTime 0-1 represents 24 game hours, so 1/24 per real second
      state.dayTime += dt / 24;
    } else if (state.speed === 2) {
      // Fast: 6 hours game time per real second
      state.dayTime += dt * 6 / 24;
    } else if (state.speed === 3) {
      // Extreme: 1 game day per real minute
      state.dayTime += dt / 60;
    }
    updateDayCycle(dt);
    stepWorld(state, sdt);
    updateSky(state, dt, state.canvasW, state.canvasH);
    updateGround(state, dt, state.canvasW);
    updateWeather(state, dt);
    recomputeMods(state);
    smoothCamera(state, dt);
    updateParticles(state, dt);

    // needs + mood for every sim (game-time scaled)
    for (let i = 0; i < state.tenants.length; i++) {
      const sim = state.tenants[i];
      updateNeeds(sim, state, sdt);
      calculateMood(sim, state);
    }

    // once-a-second systems (game time)
    systemTimer += sdt;
    if (systemTimer >= 1) {
      systemTimer = 0;
      rebuildVenues(state);
      syncOccupancy(state);
      updateCellMoodAndIncome(state);
      applyConsequences(state);
      updateWaitStats(state);
      const res = updateContracts(state);
      for (const def of res.completed) {
        showToast(`Contract complete: ${def.title}`, 'success');
        addLog(state, `📜 ${def.icon} ${def.title} complete! +$${(def.reward.money || 0).toLocaleString()}`, 'income');
        pushNews(state, `📜 ${def.title} delivered — the board paid out $${(def.reward.money || 0).toLocaleString()}.`, 'good');
      }
      directorTick(state);
    }

    if (state._edgePan) {
      state.cameraY += state._edgePan * 120 * dt;
      const clamp = getCameraClamp(state);
      state.cameraY = Math.max(clamp.minCamY, Math.min(clamp.maxCamY, state.cameraY));
    }

    autoSaveTimer += sdt;
    if (autoSaveTimer > DAY_LENGTH_SECONDS) {
      autoSaveTimer = 0;
      saveGame(state);
    }
  }

  // Single clock: dayPhase is DERIVED from dayTime every frame — even while
  // paused — so the HUD label, event-log stamps and the sky renderer (which
  // reads dayTime directly) can never disagree.
  const p = state.dayTime;
  state.dayPhase = p < 0.15 ? 'dawn' : p < 0.5 ? 'day' : p < 0.7 ? 'dusk' : 'night';

  ctx.clearRect(0, 0, state.canvasW, state.canvasH);
  drawSky(ctx, state, state.canvasW, state.canvasH);
  drawGround(ctx, state, state.canvasW, state.canvasH);
  drawTower(ctx, state);
  drawElevatorShafts(ctx, state);
  drawSims(ctx, state);
  applyAtmosphere(ctx, canvas, state, geometry(state), nightAmount(state.dayTime || 0));
  updateMinimapThrottled(state, minimapCanvas);
  drawMinimap(minimapCtx, state, minimapCanvas);
  updateHUD(state);

  requestAnimationFrame(gameLoop);
}

// Fixed sub-steps keep movement stable and prevent cars from tunnelling
// through floors at 2x/3x game speed or on a slow frame.
function stepWorld(state, sdt) {
  const MAX_STEP = 1 / 60;
  const MAX_SUBSTEPS = 8;
  let remaining = Math.min(sdt, MAX_STEP * MAX_SUBSTEPS);
  let steps = 0;
  while (remaining > 1e-6 && steps < MAX_SUBSTEPS) {
    const step = Math.min(MAX_STEP, remaining);
    updateSims(state, step);
    updateDispatch(state, step);
    updateElevatorVisuals(state, step);
    remaining -= step;
    steps++;
  }
}

function updateDayCycle(dt) {
  const prevDay = state.day;
  // dayTime is already incremented in gameLoop with speed-adjusted progression
  if (state.dayTime >= 1) {
    state.dayTime = 0;
    state.day++;
    state.weekAccumulator = (state.weekAccumulator || 0) + 1;
    tickEconomy(state);

    const bankruptStatus = checkBankruptcy(state);
    if (bankruptStatus === 'bankrupt') {
      applyEmergencyLoan(state);
      showToast('Emergency loan of $200,000! Rating reduced.', 'error');
      addLog(state, '🚨 Emergency loan taken due to bankruptcy!', 'expense');
    } else if (bankruptStatus === 'warning') {
      addLog(state, `⚠️ Money negative for ${state.bankruptcyDays} day(s)!`, 'warning');
    }

    addLog(state, `📅 Day ${state.day} — Income $${state.income.toLocaleString()} / Expenses $${state.expenses.toLocaleString()}`, state.net >= 0 ? 'income' : 'expense');

    if (state.day > 1 && state.day % 7 === 1) {
      state.week++;
      showWeeklyReport(state);
      state.stats.complaintsThisWeek = 0;
      state.stats.moveOuts = 0;
      state.stats.moveIns = 0;
      state.complainLog = [];
    }

    const newAchievements = checkAchievements(state);
    for (const ach of newAchievements) {
      showAchievementPopup(ach);
      addLog(state, `🏆 Achievement: ${ach.name}`, 'warning');
    }
  }
  if (state.day !== prevDay) {
    // (occupancy/mood refresh happens on the once-a-second system tick)
  }
}

function updateWaitStats(state) {  const waits = [];
  for (const w of (state._waitingPassengers || [])) {
    if (w.waiting) waits.push(state.tick - w.timestamp);
  }
  if (waits.length === 0) { state.stats.waiting = 0; return; }
  waits.sort((a, b) => a - b);
  state.stats.p95Wait = waits[Math.floor(waits.length * 0.95)] || waits[waits.length - 1];
  state.stats.waiting = waits.length;
}

function updateParticles(state, dt) {
  const ps = state.particles;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy -= 14 * dt; // gravity (cell units/s²)
    if (p.life <= 0 || p.y < -40) ps.splice(i, 1);
  }
  if (ps.length > 300) ps.splice(0, ps.length - 300);
}

document.addEventListener('DOMContentLoaded', init);
