// tower.js — renders tower cells, facade effects, cell-tower types
// Pure ES module. Canvas 2D context passed as parameter.
// TRUE ONE-POINT PERSPECTIVE: all elements converge to vanishing point.

import { FLOOR_TYPES, mulberry32, CELL_W, CELL_H, GROUND_Y_OFFSET, nightAmount, towerShift } from '../constants.js';
import { canBuild as canBuildCell, getBuildCost } from '../grid.js';
import { blitCell } from './facade.js';
import { geometry, drawCastShadow, drawSideAndRoof, rowInfo } from './volume.js';
import { drawTowerLighting, drawRimLight } from './post.js';
import { createPerspective, isProjectedCellVisible } from './perspective.js';

function getMoodTint(tenants, row, col) {
  if (!tenants || tenants.length === 0) return null;
  const cellTenants = tenants.filter(t => t.floor === row && t.col === col);
  if (cellTenants.length === 0) return null;
  const mean = cellTenants.reduce((s, t) => s + (t.mood || 0.5), 0) / cellTenants.length;
  const r = Math.round(255 * (1 - mean));
  const g = Math.round(255 * mean);
  return `rgba(${r},${g},40,0.35)`;
}

export function drawTower(ctx, state) {
  const { grid, cols, zoom, cameraY, canvasW, canvasH, dayPhase, tick } = state;
  const groundY = canvasH - GROUND_Y_OFFSET;
  const towerW = cols * CELL_W * zoom;
  const towerLeft = (canvasW - towerW) / 2 + towerShift(zoom);
  const baseY = groundY;
  const nightAmt = nightAmount(state.dayTime || 0);
  const isNight = nightAmt > 0.5;

  // Create perspective transform once per frame
  const P = createPerspective(state);
  const geo = P; // alias for compatibility with volume.js/post.js

  ctx.save();

  const highestRow = state.highestFloor || 0;
  const lowestRow = Math.min(0, state.basementDepth || 0);

  // highestFloor is derived state — never trust it alone as proof a real
  // silhouette exists. If it ever desyncs from the grid (e.g. a bad save
  // load), every silhouette-following effect below must refuse to draw rather
  // than paint a ghost tower (dark shell, crown spike, labels with no cells).
  const roofExists = highestRow > 0 && !!rowInfo(state, highestRow);
  const towerExists = state.grid.size > 0;

  // --- exterior glow (soft radial; no hard edges against the sky) ---
  if (roofExists) {
    const gx = towerLeft + towerW / 2;
    const gh = (highestRow + 1) * CELL_H * zoom;
    const gy = baseY - gh / 2 + cameraY;
    const rad = Math.max(towerW * 1.4, gh * 1.1);
    const glowGrad = ctx.createRadialGradient(gx, gy, 0, gx, gy, rad);
    glowGrad.addColorStop(0, 'rgba(140,200,255,0.06)');
    glowGrad.addColorStop(1, 'rgba(140,200,255,0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(gx - rad, gy - rad, rad * 2, rad * 2);
  }

  // --- cast shadow + side face & roof (perspective-correct) ---
  drawCastShadow(ctx, state, geo, nightAmt);
  drawSideAndRoof(ctx, state, geo, nightAmt);

  // --- glass silhouette shell (perspective-correct) ---
  if (roofExists) {
    drawGlassShell(ctx, P, nightAmt, isNight);
  }

  // --- cells with perspective ---
  for (let row = lowestRow; row <= highestRow; row++) {
    const gridRow = state.grid.get(row);

    for (let col = 0; col < state.cols; col++) {
      const proj = P.project(col, row);

      // Cull off-screen cells
      if (!isProjectedCellVisible(proj, canvasW, canvasH)) continue;

      const cellX = proj.x;
      const cellY = proj.y;
      const cellW = proj.w;
      const cellH = proj.h;
      const cell = gridRow ? gridRow[col] : null;

      // --- hover ghost preview ---
      const hovered = state.hoveredCell;
      const tool = state.selectedTool;
      const buildTool = tool && tool !== 'select' && tool !== 'demolish';
      if (hovered && hovered.row === row && hovered.col === col && !cell && buildTool) {
        const allowed = canBuildCell(state, row, col, tool);
        ctx.globalAlpha = allowed ? 0.5 : 0.38;
        ctx.fillStyle = allowed ? 'rgba(60,220,120,0.45)' : 'rgba(220,60,60,0.45)';
        ctx.fillRect(cellX + 2, cellY + 2, cellW - 4, cellH - 4);
        ctx.strokeStyle = allowed ? 'rgba(60,220,120,0.85)' : 'rgba(220,60,60,0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(cellX + 2, cellY + 2, cellW - 4, cellH - 4);
        ctx.globalAlpha = 1;
        const cost = FLOOR_TYPES[tool] ? getBuildCost(state, row, tool) : null;
        if (cost !== null) drawCostTooltip(ctx, cellX + cellW / 2, cellY - 12, cost, allowed);
      }

      if (!cell) continue;
      if (cell.type === 'elevator') continue; // shafts drawn by elevators.js

      // --- modern curtain-wall facade (pre-baked sprite with perspective scaling) ---
      blitCell(ctx, cell.type, row, col, cellX, cellY, cellW, cellH, nightAmt);

      // --- occasional flickering window at night ---
      if (nightAmt > 0.35 && ((row * 7 + col * 13) % 17 === 0)) {
        const f = 0.5 + 0.5 * Math.sin(state.tick * 1.7 + (row * 31 + col * 17) % 100);
        ctx.fillStyle = `rgba(255,214,150,${(0.08 + 0.24 * f) * nightAmt})`;
        const fx = cellX + cellW * (0.22 + ((row * 5 + col * 3) % 5) * 0.11);
        ctx.fillRect(fx, cellY + cellH * 0.42, cellW * 0.13, cellH * 0.2);
      }

      // --- mood overlay ---
      if (state.moodOverlay) {
        const tint = getMoodTint(state.tenants, row, col);
        if (tint) {
          ctx.fillStyle = tint;
          ctx.fillRect(cellX, cellY, cellW, cellH);
        }
      }

      // --- hover highlight on existing cell ---
      if (hovered && hovered.row === row && hovered.col === col && cell) {
        ctx.strokeStyle = 'rgba(100,200,255,0.7)';
        ctx.lineWidth = 2;
        ctx.strokeRect(cellX + 1, cellY + 1, cellW - 2, cellH - 2);
      }
    }

    // --- floor labels every 5 floors on col 0 (perspective) ---
    // Only when the row actually has cells — a ghost row must not get labels.
    if (gridRow && row % 5 === 0) {
      const labelProj = P.project(-0.5, row); // slightly left of tower
      if (isProjectedCellVisible(labelProj, canvasW, canvasH, 100)) {
        ctx.fillStyle = isNight ? 'rgba(180,200,220,0.5)' : 'rgba(80,100,120,0.5)';
        ctx.font = `${Math.max(8, 10 * labelProj.scale)}px monospace`;
        ctx.textAlign = 'right';
        ctx.fillText(String(row), labelProj.x, labelProj.y + labelProj.h / 2 + 3);
      }
    }
  }

  // --- directional daylight + ambient occlusion (perspective-correct) ---
  drawTowerLighting(ctx, state, geo, nightAmt);

  // --- rim light on the silhouette (perspective-correct) ---
  drawRimLight(ctx, state, geo, nightAmt);

  ctx.globalAlpha = 1;

  // --- basement foundation walls (perspective) ---
  drawBasementFoundation(ctx, P, state, cameraY);

  // --- podium + entrance at street level (follows the street, which itself
  // follows the camera — ground.js adds cameraY to its baseline) ---
  if (towerExists) {
    drawTowerPlinth(ctx, towerLeft, baseY + cameraY, towerW, zoom, isNight, tick);
  }

  // --- vertical edge lights (perspective) ---
  if (roofExists) drawEdgeLights(ctx, P, nightAmt, tick, canvasH, cameraY);

  // --- moving sheen highlight (perspective) ---
  if (roofExists) drawSheen(ctx, P, tick, canvasH, cameraY);

  // --- luminous crown at top (perspective) ---
  if (roofExists) drawCrown(ctx, P, nightAmt, tick, highestRow, cameraY);

  // --- rooftop cell tower (perspective) ---
  drawCellTower(ctx, P, nightAmt, tick, highestRow, cameraY, state);

  // --- particles (build dust) - world units ---
  if (state.particles && state.particles.length) {
    drawParticles(ctx, state.particles, P, cameraY);
  }

  // --- drifting motes (perspective) ---
  drawMotes(ctx, P, tick, canvasH, cameraY, isNight);

  ctx.restore();
}

// ===========================================================================
// Glass silhouette shell — perspective-correct
// ===========================================================================
function drawGlassShell(ctx, P, nightAmt, isNight) {
  const highestRow = P.highest || 0;
  const vanishX = P.vanishX;
  const baseY = P.baseY + P.cameraY; // street level (moves with camera, like ground.js)

  // Top edge: projected roof corners (the tower outline tapers toward vanish).
  const tl = P.project(0, highestRow + 1);
  const tr = P.project(P.cols - 1, highestRow + 1);
  // Bottom edge: full tower width at street level.
  const bl = { x: P.towerLeft, y: baseY };
  const br = { x: P.towerLeft + P.towerW, y: baseY };

  const grad = ctx.createLinearGradient(vanishX, tl.y, vanishX, baseY);
  if (isNight) {
    grad.addColorStop(0, 'rgba(24,38,72,0.55)');
    grad.addColorStop(0.5, 'rgba(34,58,96,0.34)');
    grad.addColorStop(1, 'rgba(16,28,58,0.5)');
  } else {
    grad.addColorStop(0, 'rgba(126,186,226,0.26)');
    grad.addColorStop(0.5, 'rgba(168,208,244,0.12)');
    grad.addColorStop(1, 'rgba(104,166,206,0.24)');
  }
  ctx.fillStyle = grad;

  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y);
  ctx.lineTo(tr.x + tr.w, tr.y);
  ctx.lineTo(br.x, br.y);
  ctx.lineTo(bl.x, bl.y);
  ctx.closePath();
  ctx.fill();

  // Shadow at base (orthographic, at street level)
  const shadowGrad = ctx.createLinearGradient(0, baseY - 30, 0, baseY + 20);
  shadowGrad.addColorStop(0, 'rgba(0,0,0,0.16)');
  shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadowGrad;
  ctx.fillRect(P.towerLeft - 40, baseY - 30, P.towerW + 80, 50);
}

// ===========================================================================
// Podium + entrance — anchors the tower to the street (orthographic)
// ===========================================================================
function drawTowerPlinth(ctx, towerLeft, baseY, towerW, zoom, isNight, tick) {
  const pad = 12 * zoom;
  const h = 13 * zoom;
  const x = towerLeft - pad;
  const w = towerW + pad * 2;
  const y = baseY - h + 3 * zoom;

  const g = ctx.createLinearGradient(x, y, x, y + h);
  if (isNight) {
    g.addColorStop(0, '#2b3444');
    g.addColorStop(1, '#141a25');
  } else {
    g.addColorStop(0, '#6b7688');
    g.addColorStop(1, '#3d4655');
  }
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);

  // top highlight
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(x, y, w, 1.5 * zoom);

  // entrance canopy in the middle
  const cw = Math.min(w * 0.42, 220 * zoom);
  const cx = towerLeft + towerW / 2 - cw / 2;
  const cy = y - 7 * zoom;
  ctx.fillStyle = isNight ? 'rgba(20,28,42,0.95)' : 'rgba(60,70,86,0.95)';
  ctx.beginPath();
  ctx.roundRect(cx, cy, cw, 8 * zoom, [4 * zoom, 4 * zoom, 0, 0]);
  ctx.fill();

  // warm glow spilling from the doors
  const glow = ctx.createRadialGradient(towerLeft + towerW / 2, y + 2 * zoom, 0, towerLeft + towerW / 2, y + 2 * zoom, 40 * zoom);
  const warm = isNight ? 0.42 : 0.16;
  glow.addColorStop(0, `rgba(255,214,140,${warm})`);
  glow.addColorStop(1, 'rgba(255,214,140,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(towerLeft + towerW / 2 - 40 * zoom, y - 20 * zoom, 80 * zoom, 44 * zoom);

  // door pair
  const dw = Math.min(cw * 0.5, 60 * zoom);
  ctx.fillStyle = isNight ? 'rgba(255,226,160,0.85)' : 'rgba(190,214,236,0.75)';
  ctx.fillRect(towerLeft + towerW / 2 - dw / 2, y, dw, h - 3 * zoom);
  ctx.fillStyle = isNight ? 'rgba(20,26,38,0.9)' : 'rgba(40,50,64,0.7)';
  ctx.fillRect(towerLeft + towerW / 2 - 0.8 * zoom, y, 1.6 * zoom, h - 3 * zoom);

  // doorman figure at night
  if (isNight) {
    ctx.fillStyle = 'rgba(20,24,34,0.9)';
    ctx.beginPath();
    ctx.arc(towerLeft + towerW / 2 + dw * 0.75, y - 3 * zoom, 2 * zoom, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ===========================================================================
// Basement foundation — perspective-correct
// ===========================================================================
function drawBasementFoundation(ctx, P, state, camY) {
  const depth = state.basementDepth || 0;
  if (depth >= 0) return;
  const baseY = P.baseY + P.cameraY;

  const g = ctx.createLinearGradient(baseY - 40 * P.zoom, baseY, baseY, baseY + 40 * P.zoom);
  g.addColorStop(0, 'rgba(70,54,40,0.95)');
  g.addColorStop(1, 'rgba(28,20,14,0.98)');

  // The basement pit extends below street level; its exposed side walls are
  // trapezoids between the excavation edge (one column out) and the tower,
  // drawn ONLY below the ground line. Never converges to the vanish point —
  // that would paint a wedge across the whole tower.
  const deepL = P.project(-1, depth);
  const deepTowerL = P.project(0, depth);
  const groundL = P.project(-1, 0);
  const groundTowerL = P.project(0, 0);

  ctx.fillStyle = g;

  // LEFT pit wall: tower edge → excavation edge, deepest row → ground
  ctx.beginPath();
  ctx.moveTo(deepTowerL.x, deepTowerL.y);
  ctx.lineTo(deepL.x, deepL.y);
  ctx.lineTo(groundL.x, groundL.y + groundL.h);
  ctx.lineTo(groundTowerL.x, groundTowerL.y + groundTowerL.h);
  ctx.closePath();
  ctx.fill();

  // RIGHT pit wall (mirror)
  const deepR = P.project(P.cols, depth);
  const deepTowerR = P.project(P.cols - 1, depth);
  const groundR = P.project(P.cols, 0);
  const groundTowerR = P.project(P.cols - 1, 0);
  ctx.beginPath();
  ctx.moveTo(deepTowerR.x + deepTowerR.w, deepTowerR.y);
  ctx.lineTo(deepR.x + deepR.w, deepR.y);
  ctx.lineTo(groundR.x + groundR.w, groundR.y + groundR.h);
  ctx.lineTo(groundTowerR.x + groundTowerR.w, groundTowerR.y + groundTowerR.h);
  ctx.closePath();
  ctx.fill();

  // Floor slabs - horizontal excavation lines below ground
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let r = 0; r >= depth; r--) {
    const left = P.project(-1, r);
    const right = P.project(P.cols, r);
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(right.x + right.w, right.y);
    ctx.stroke();
  }
}

// ===========================================================================
// Edge lights — perspective-correct
// ===========================================================================
function drawEdgeLights(ctx, P, isNight, tick, canvasH, camY) {
  if (!isNight) return;
  const pulse = 0.3 + Math.sin(tick * 0.02) * 0.15;
  ctx.strokeStyle = `rgba(100,200,255,${pulse})`;
  ctx.lineWidth = 2 * P.zoom;
  const baseY = P.baseY + P.cameraY;

  // The facade edges are straight lines from the roof corners down to the
  // street-level corners (they converge to the vanish point above the roof).
  const leftTop = P.project(0, P.highest + 1);
  const leftBase = { x: P.towerLeft, y: baseY };
  const rightTop = P.project(P.cols - 1, P.highest + 1);
  const rightBase = { x: P.towerLeft + P.towerW, y: baseY };

  // Left edge light
  ctx.beginPath();
  ctx.moveTo(leftTop.x, leftTop.y);
  ctx.lineTo(leftBase.x, leftBase.y);
  ctx.stroke();

  // Right edge light
  ctx.beginPath();
  ctx.moveTo(rightTop.x + rightTop.w, rightTop.y);
  ctx.lineTo(rightBase.x, rightBase.y);
  ctx.stroke();

  // Corner dots at top
  const dotR = 3 * P.zoom;
  ctx.fillStyle = `rgba(150,220,255,${pulse + 0.2})`;
  ctx.beginPath();
  ctx.arc(leftTop.x, leftTop.y, dotR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(rightTop.x + rightTop.w, rightTop.y, dotR, 0, Math.PI * 2);
  ctx.fill();
}

// ===========================================================================
// Moving sheen highlight — perspective-correct
// ===========================================================================
function drawSheen(ctx, P, tick, canvasH, camY) {
  const vanishX = P.vanishX;

  // Sheen sweeps up the tower: a horizontal band ~1.5 cells tall whose width
  // follows the perspective taper at each row.
  const progress = ((tick * 1.2) % 400) / 400; // 0..1
  const topRow = P.lowest + progress * (P.highest + 1 - P.lowest);
  const bandRowsLow = topRow - 0.6;
  const bandRowsHigh = topRow + 0.9;

  const lh = P.project(0, bandRowsHigh);
  const rh = P.project(P.cols - 1, bandRowsHigh);
  const ll = P.project(0, bandRowsLow);
  const rl = P.project(P.cols - 1, bandRowsLow);

  // Off-screen cull
  if (ll.y > canvasH + 100 || lh.y < -100) return;

  const grad = ctx.createLinearGradient(vanishX, lh.y, vanishX, ll.y + ll.h);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.06)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.06)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;

  ctx.beginPath();
  ctx.moveTo(lh.x, lh.y);
  ctx.lineTo(rh.x + rh.w, rh.y);
  ctx.lineTo(rl.x + rl.w, rl.y + rl.h);
  ctx.lineTo(ll.x, ll.y + ll.h);
  ctx.closePath();
  ctx.fill();
}

// ===========================================================================
// Luminous crown at top — perspective-correct
// ===========================================================================
function drawCrown(ctx, P, isNight, tick, highestRow, camY) {
  if (!highestRow || highestRow < 1) return;
  const vanishX = P.vanishX;
  const pulse = isNight ? 0.55 + Math.sin(tick * 0.05) * 0.25 : 0.35;

  // Project roof level
  const roofProj = P.project(0, highestRow + 1);
  const roofY = roofProj.y;

  // Parapet band — trapezoid between row (highest+1) and row highest, tapering
  // with the facade (its sides lie on the converging edge lines).
  const bandTopL = P.project(0, highestRow + 1);
  const bandTopR = P.project(P.cols - 1, highestRow + 1);
  const bandBotL = P.project(0, highestRow);
  const bandBotR = P.project(P.cols - 1, highestRow);
  const bandTopY = bandTopL.y;
  const bandBottomY = bandBotL.y + bandBotL.h;

  const bg = ctx.createLinearGradient(vanishX, bandTopY, vanishX, bandBottomY);
  bg.addColorStop(0, isNight ? '#3a4557' : '#8b97a8');
  bg.addColorStop(1, isNight ? '#1b2230' : '#4a5462');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(bandTopL.x, bandTopY);
  ctx.lineTo(bandTopR.x + bandTopR.w, bandTopY);
  ctx.lineTo(bandBotR.x + bandBotR.w, bandBottomY);
  ctx.lineTo(bandBotL.x, bandBottomY);
  ctx.closePath();
  ctx.fill();

  // Top highlight
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(bandTopL.x, bandTopY, bandTopR.x + bandTopR.w - bandTopL.x, 1.5 * P.zoom);

  // Mechanical penthouse - perspective
  const mw = Math.min(P.towerW * 0.3, 160 * P.zoom);
  const mh = 16 * P.zoom;
  const mx = vanishX - mw / 2;
  const my = bandTopY - mh;
  const mg = ctx.createLinearGradient(mx, my, mx + mw, my + mh);
  mg.addColorStop(0, isNight ? '#2a3242' : '#77828f');
  mg.addColorStop(1, isNight ? '#161d29' : '#49525f');
  ctx.fillStyle = mg;
  ctx.fillRect(mx, my, mw, mh);

  const wins = Math.max(3, Math.floor(mw / (18 * P.zoom)));
  for (let i = 0; i < wins; i++) {
    const wx = mx + mw * ((i + 0.5) / wins);
    ctx.fillStyle = isNight
      ? `rgba(255,214,140,${0.5 + 0.4 * Math.sin(tick * 0.6 + i)})`
      : 'rgba(180,205,230,0.6)';
    ctx.fillRect(wx - 2 * P.zoom, my + mh * 0.35, 4 * P.zoom, 5 * P.zoom);
  }

  // Antenna + beacon - vertical line to vanish
  const ax = vanishX;
  const ay = my;
  const antennaH = 26 * P.zoom;
  const sway = Math.sin(tick * 0.9) * 1.6 * P.zoom;
  ctx.strokeStyle = isNight ? 'rgba(150,170,200,0.75)' : 'rgba(90,100,115,0.8)';
  ctx.lineWidth = 1.4 * P.zoom;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax + sway, ay - antennaH);
  ctx.stroke();

  const glow = ctx.createRadialGradient(ax + sway, ay - antennaH, 0, ax + sway, ay - antennaH, 18 * P.zoom);
  glow.addColorStop(0, `rgba(255,70,70,${pulse * 0.7})`);
  glow.addColorStop(1, 'rgba(255,70,70,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(ax + sway, ay - antennaH, 18 * P.zoom, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = `rgba(255,80,80,${pulse})`;
  ctx.beginPath();
  ctx.arc(ax + sway, ay - antennaH, 2.6 * P.zoom, 0, Math.PI * 2);
  ctx.fill();

  if (isNight) {
    const cg = ctx.createRadialGradient(ax, roofY, 0, ax, roofY, P.towerW * 0.7);
    cg.addColorStop(0, `rgba(140,200,255,${pulse * 0.12})`);
    cg.addColorStop(1, 'rgba(140,200,255,0)');
    ctx.fillStyle = cg;
    ctx.fillRect(P.towerLeft - P.towerW * 0.3, roofY - 90 * P.zoom, P.towerW * 1.6, 110 * P.zoom);
  }
}

// ===========================================================================
// Rooftop cellular tower — perspective-correct
// ===========================================================================
function drawCellTower(ctx, P, nightAmt, tick, highestRow, camY, state) {
  if (!state.cellTower || highestRow < 1) return;
  const isNight = nightAmt > 0.5;
  const row = state.grid.get(highestRow);
  if (!row) return;
  let col = state.cellTower.col;
  if (!row[col]) {
    col = row.findIndex(Boolean);
    if (col < 0) return;
  }

  // Project the cell tower position
  const proj = P.project(col + 0.5, highestRow + 1);
  const x = proj.x + proj.w / 2;
  const y = proj.y - 9 * P.zoom;
  const z = P.zoom;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(z, z);
  // concrete footing, equipment cabinet and cable ladder
  ctx.fillStyle = isNight ? '#303b49' : '#a9b5bf';
  ctx.fillRect(-23, -4, 46, 4);
  ctx.fillStyle = isNight ? '#47566a' : '#d1dce4';
  ctx.fillRect(10, -20, 12, 16);
  ctx.strokeStyle = isNight ? '#92a5b8' : '#536574';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(12, -17 + i * 3); ctx.lineTo(20, -17 + i * 3); ctx.stroke();
  }
  // triangular lattice mast and cross braces
  ctx.strokeStyle = isNight ? '#8598ac' : '#576b7b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-9, -4); ctx.lineTo(0, -74); ctx.lineTo(9, -4);
  for (let i = 0; i < 5; i++) {
    const yy = -8 - i * 12;
    const half = 8 - i * 1.4;
    ctx.moveTo(-half, yy); ctx.lineTo(half - 1.4, yy - 12);
    ctx.moveTo(half, yy); ctx.lineTo(-half + 1.4, yy - 12);
  }
  ctx.stroke();
  // mounting arms and three sector panels
  ctx.beginPath(); ctx.moveTo(-19, -52); ctx.lineTo(19, -52); ctx.stroke();
  for (const px of [-21, -3, 15]) {
    ctx.fillStyle = isNight ? '#b2c4d2' : '#f0f5f6';
    ctx.fillRect(px, -66, 6, 25);
    ctx.fillStyle = isNight ? '#60768a' : '#a5b9c7';
    ctx.fillRect(px + 4, -66, 2, 25);
    ctx.strokeStyle = '#4c6172'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px + 3, -41); ctx.lineTo(2, -27); ctx.lineTo(14, -20); ctx.stroke();
  }
  // aviation beacon
  const alpha = state.settings?.reducedMotion ? 0.8 : 0.55 + Math.sin(tick * 3) * 0.35;
  ctx.fillStyle = `rgba(255,80,72,${alpha})`;
  ctx.beginPath(); ctx.arc(0, -76, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#63e6bc'; ctx.fillRect(18, -7, 2, 2);
  ctx.restore();
}

// ===========================================================================
// Particles (build dust) — world units with perspective
// ===========================================================================
function drawParticles(ctx, particles, P, camY) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of particles) {
    const proj = P.project(p.x, p.y);
    const px = proj.x + proj.w / 2;
    const py = proj.y + proj.h / 2; // projection already includes cameraY
    const life = Math.max(0, p.life / (p.maxLife || 1));
    ctx.globalAlpha = Math.min(1, life * 1.6);
    const isEmoji = typeof p.color === 'string' && p.color.codePointAt(0) > 255;
    if (isEmoji) {
      ctx.font = `${Math.max(6, 11 * proj.scale)}px sans-serif`;
      ctx.fillText(p.color, px, py);
    } else {
      ctx.fillStyle = p.color || 'rgba(200,220,255,0.7)';
      ctx.beginPath();
      ctx.arc(px, py, (p.size || 1.6) * proj.scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

// ===========================================================================
// Drifting motes — perspective-correct
// ===========================================================================
function drawMotes(ctx, P, tick, canvasH, camY, isNight) {
  const moteCount = 12;
  const vanishX = P.vanishX;

  for (let i = 0; i < moteCount; i++) {
    const rng = mulberry32(i * 31337 + 42);
    const baseX = rng() * P.towerW;
    const baseYOff = rng() * 500;
    const speed = 0.2 + rng() * 0.4;
    const drift = Math.sin(tick * 0.008 * speed + i * 2.1) * 20;

    // Project mote position in perspective
    const col = baseX / CELL_W;
    const row = -baseYOff / CELL_H;
    const proj = P.project(col, row);

    const mx = proj.x + proj.w / 2 + drift;
    const my = proj.y + proj.h / 2 + Math.sin(tick * 0.005 + i) * 10; // projection includes cameraY

    if (my < -20 || my > canvasH + 20) continue;
    const alpha = isNight ? 0.15 + Math.sin(tick * 0.01 + i) * 0.1 : 0.08 + Math.sin(tick * 0.01 + i) * 0.05;
    const size = (1 + rng()) * proj.scale;
    ctx.fillStyle = isNight
      ? `rgba(180,210,255,${alpha})`
      : `rgba(200,220,240,${alpha})`;
    ctx.beginPath();
    ctx.arc(mx, my, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ===========================================================================
// Cost tooltip
// ===========================================================================
function drawCostTooltip(ctx, x, y, cost, allowed) {
  const text = `$${cost}`;
  ctx.font = '11px monospace';
  const tw = ctx.measureText(text).width;
  const pad = 4;
  const tipW = tw + pad * 2;
  const tipH = 16;
  const tipX = x - tipW / 2;
  const tipY = y - tipH;

  ctx.fillStyle = allowed ? 'rgba(20,40,20,0.85)' : 'rgba(50,15,15,0.85)';
  ctx.beginPath();
  ctx.roundRect(tipX, tipY, tipW, tipH, 3);
  ctx.fill();

  ctx.strokeStyle = allowed ? 'rgba(60,180,80,0.7)' : 'rgba(200,60,60,0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(tipX, tipY, tipW, tipH, 3);
  ctx.stroke();

  ctx.fillStyle = allowed ? 'rgba(120,255,140,0.9)' : 'rgba(255,120,120,0.9)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, tipY + tipH / 2);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}