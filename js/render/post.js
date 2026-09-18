// ════════════════════════════════════════════════════════════════
//  POST — Perspective-correct lighting and atmosphere
//
//  • directional daylight that tracks the sun across the facade
//  • vertical ambient occlusion toward the street
//  • a soft night bloom (downsample → additive upsample)
//  • a wet-street reflection of the skyline and tower
//  All effects respect the one-point perspective.
// ════════════════════════════════════════════════════════════════

import { CELL_H, CELL_W } from '../constants.js';
import { rowInfo } from './volume.js';

let _bloom = null;
let _refl = null;
let _grain = null;

// ─── Perspective-correct rim / edge light ────────────────────────

export function drawRimLight(ctx, state, geo, nightAmt) {
  if (geo.highest <= 0) return;
  const p = state.dayTime || 0;
  const peak = (c, w) => Math.max(0, 1 - Math.abs(p - c) / w);
  const golden = Math.max(peak(0.10, 0.12), peak(0.66, 0.12)) * (1 - nightAmt * 0.6);
  const moonRim = nightAmt > 0.5 ? 0.14 * nightAmt : 0;
  const amt = Math.max(golden, moonRim);
  if (amt < 0.04) return;

  const col = nightAmt > 0.5 ? '188,214,255' : '255,206,142';
  // No cells at the top row means there is no silhouette to light — bail
  // rather than falling back to a full-width ghost outline.
  const info = rowInfo(state, geo.highest);
  if (!info) return;

  // Project the roof corners and street-level corners. The facade side edges
  // run from roof corner down to base corner (converging to the vanish point
  // above the roof).
  const tl = geo.project(info.left, geo.highest + 1);
  const tr = geo.project(info.right + 1, geo.highest + 1);
  const baseY = geo.baseY + geo.cameraY;
  const bl = { x: geo.towerLeft, y: baseY };
  const br = { x: geo.towerLeft + geo.towerW, y: baseY };

  ctx.save();
  ctx.strokeStyle = `rgba(${col},${amt})`;
  ctx.lineWidth = Math.max(1, 1.7 * geo.zoom);

  // Front top edge
  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y);
  ctx.lineTo(tr.x + tr.w, tr.y);

  // Facade flank edges (converge to the vanish point above the roof)
  ctx.moveTo(tl.x, tl.y);
  ctx.lineTo(bl.x, bl.y);
  ctx.moveTo(tr.x + tr.w, tr.y);
  ctx.lineTo(br.x, br.y);
  ctx.stroke();

  // Sun-facing side edge — the same flank line, re-drawn brighter
  const sunLeft = (0.1 + 0.8 * p) < 0.5;
  const side = sunLeft ? bl : br;
  const sideTop = sunLeft ? tl : tr;
  const sideX = side.x;
  const sideBottomY = baseY;

  ctx.beginPath();
  ctx.moveTo(sideTop.x, sideTop.y);
  ctx.lineTo(sideX, sideBottomY);
  ctx.stroke();
  ctx.restore();
}

// ─── Perspective-correct directional light + AO ──────────────────

export function drawTowerLighting(ctx, state, geo, nightAmt) {
  if (geo.highest <= 0) return;
  // No cells at the top row means there is no silhouette to light — bail
  // rather than falling back to a full-width ghost shape.
  const info = rowInfo(state, geo.highest);
  if (!info) return;
  const vanishX = geo.vanishX;
  const vanishY = geo.vanishY;

  // Project the tower silhouette: roof corners + street-level corners.
  const tl = geo.project(info.left, geo.highest + 1);
  const tr = geo.project(info.right + 1, geo.highest + 1);
  const baseY = geo.baseY + geo.cameraY;
  const bl = { x: geo.towerLeft, y: baseY };
  const br = { x: geo.towerLeft + geo.towerW, y: baseY };

  const top = tl.y;
  const bottom = baseY;
  const hh = bottom - top;
  if (hh <= 0 || !isFinite(top) || !isFinite(bottom)) return;

  ctx.save();
  ctx.beginPath();
  // Clip to the perspective tower shape (trapezoid)
  ctx.moveTo(tl.x, tl.y);
  ctx.lineTo(tr.x + tr.w, tr.y);
  ctx.lineTo(br.x, br.y);
  ctx.lineTo(bl.x, bl.y);
  ctx.closePath();
  ctx.clip();

  // Sun position drives which flank catches the light
  const p = state.dayTime || 0;
  const sunX = 0.1 + 0.8 * p;
  const sunLeft = sunX < 0.5;
  const warmA = 0.20 * (1 - nightAmt);
  const warm = `rgba(255,240,212,${warmA})`;
  const shade = `rgba(8,12,22,${0.20 + 0.14 * (1 - nightAmt)})`;

  // Gradient flows horizontally across the perspective face
  const g = ctx.createLinearGradient(geo.towerLeft, 0, geo.towerLeft + geo.towerW, 0);
  if (sunLeft) {
    g.addColorStop(0, warm);
    g.addColorStop(0.42, 'rgba(0,0,0,0)');
    g.addColorStop(1, shade);
  } else {
    g.addColorStop(0, shade);
    g.addColorStop(0.58, 'rgba(0,0,0,0)');
    g.addColorStop(1, warm);
  }
  ctx.fillStyle = g;
  // Fill the full clipped area
  ctx.fillRect(geo.towerLeft, top, geo.towerW, hh);

  // Vertical ambient occlusion toward the base - perspective gradient
  const ao = ctx.createLinearGradient(vanishX, top, vanishX, geo.baseY);
  ao.addColorStop(0, 'rgba(0,0,0,0)');
  ao.addColorStop(0.62, 'rgba(0,0,0,0.05)');
  ao.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = ao;
  ctx.fillRect(geo.towerLeft, top, geo.towerW, hh);

  // Corner occlusion where front elevation meets shaded side face
  // This is a vertical strip at the right edge converging to vanish
  const edge = Math.max(6, 14 * geo.zoom);
  const rightEdgeX = geo.towerLeft + geo.towerW - edge;
  const ce = ctx.createLinearGradient(rightEdgeX, top, vanishX, vanishY);
  ce.addColorStop(0, 'rgba(0,0,0,0)');
  ce.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = ce;
  ctx.fillRect(rightEdgeX, top, edge, hh);

  // Glazing reflects the sky: bright at the top, fading with the horizon
  const day = 1 - nightAmt;
  const sky = ctx.createLinearGradient(vanishX, top, vanishX, geo.baseY);
  sky.addColorStop(0, `rgba(158,206,244,${0.20 * day})`);
  sky.addColorStop(0.32, `rgba(178,214,240,${0.10 * day})`);
  sky.addColorStop(0.52, 'rgba(190,220,240,0)');
  sky.addColorStop(0.9, `rgba(10,16,28,${0.06 + 0.10 * day})`);
  sky.addColorStop(1, `rgba(8,12,22,${0.14 + 0.14 * day})`);
  ctx.fillStyle = sky;
  ctx.fillRect(geo.towerLeft, top, geo.towerW, hh);

  // Faint moon/sky sheen on the glass at night
  if (nightAmt > 0.4) {
    const moon = ctx.createLinearGradient(vanishX, top, vanishX, top + hh * 0.6);
    moon.addColorStop(0, `rgba(190,214,246,${0.07 * nightAmt})`);
    moon.addColorStop(1, 'rgba(190,214,246,0)');
    ctx.fillStyle = moon;
    ctx.fillRect(geo.towerLeft, top, geo.towerW, hh * 0.6);
  }

  ctx.restore();
}

// ─── Night bloom (screen-space, no perspective needed) ──────────

function bloom(ctx, canvas, amount) {
  const w = Math.max(1, canvas.width);
  const h = Math.max(1, canvas.height);
  const sw = Math.max(1, Math.round(w / 6));
  const sh = Math.max(1, Math.round(h / 6));
  if (!_bloom) _bloom = document.createElement('canvas');
  if (_bloom.width !== sw || _bloom.height !== sh) { _bloom.width = sw; _bloom.height = sh; }
  const b = _bloom.getContext('2d');
  b.clearRect(0, 0, sw, sh);
  b.drawImage(canvas, 0, 0, sw, sh);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.38 * amount;
  ctx.drawImage(_bloom, 0, 0, w, h);
  ctx.restore();
}

// ─── Wet-street reflection (screen-space) ───────────────────────

function streetReflection(ctx, canvas, geo, nightAmt) {
  const H = 120;
  const srcH = 240;
  // Street line follows the camera (ground.js draws it at baseY + cameraY).
  const streetY = geo.baseY + (geo.cameraY || 0);
  const srcTop = streetY - srcH;
  if (srcTop < 0 || streetY > canvas.height) return;

  if (!_refl) _refl = document.createElement('canvas');
  if (_refl.width !== canvas.width || _refl.height !== H) {
    _refl.width = canvas.width; _refl.height = H;
  }
  const r = _refl.getContext('2d');
  r.setTransform(1, 0, 0, 1, 0, 0);
  r.globalCompositeOperation = 'source-over';
  r.clearRect(0, 0, _refl.width, H);

  r.save();
  r.translate(0, H);
  r.scale(1, -1);
  r.drawImage(canvas, 0, srcTop, canvas.width, srcH, 0, 0, canvas.width, H);
  r.restore();

  r.globalCompositeOperation = 'destination-in';
  const mg = r.createLinearGradient(0, 0, 0, H);
  mg.addColorStop(0, 'rgba(0,0,0,0.6)');
  mg.addColorStop(0.45, 'rgba(0,0,0,0.22)');
  mg.addColorStop(1, 'rgba(0,0,0,0)');
  r.fillStyle = mg;
  r.fillRect(0, 0, _refl.width, H);
  r.globalCompositeOperation = 'source-over';

  ctx.save();
  ctx.globalAlpha = 0.2 + 0.55 * nightAmt;
  ctx.drawImage(_refl, 0, streetY + 1, canvas.width, H * 0.55);
  ctx.restore();
}

// ─── Screen-space grade, vignette and film grain ────────────────

function grade(ctx, state, canvas, nightAmt) {
  const p = state.dayTime || 0;
  const warm = Math.max(0, 1 - Math.abs(p - 0.10) / 0.15) * 0.55
            + Math.max(0, 1 - Math.abs(p - 0.66) / 0.17) * 0.7;
  const cool = nightAmt;
  const w = canvas.width, h = canvas.height;

  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  if (warm > 0.02) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `rgba(255,182,116,${0.55 * warm})`);
    g.addColorStop(1, `rgba(255,126,96,${0.30 * warm})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  if (cool > 0.02) {
    ctx.fillStyle = `rgba(38,68,148,${0.34 * cool})`;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

function vignette(ctx, canvas, amt) {
  const w = canvas.width, h = canvas.height;
  const g = ctx.createRadialGradient(
    w / 2, h * 0.46, Math.min(w, h) * 0.28,
    w / 2, h * 0.5, Math.max(w, h) * 0.72
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(2,5,12,${amt})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function grain(ctx, canvas) {
  if (!_grain) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const img = g.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    _grain = ctx.createPattern(c, 'repeat');
  }
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.04;
  ctx.fillStyle = _grain;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

// ─── Combined pass ──────────────────────────────────────────────

export function applyAtmosphere(ctx, canvas, state, geo, nightAmt) {
  if (nightAmt > 0.22) bloom(ctx, canvas, (nightAmt - 0.22) / 0.78);
  streetReflection(ctx, canvas, geo, nightAmt);
  grade(ctx, state, canvas, nightAmt);
  vignette(ctx, canvas, 0.30);
  grain(ctx, canvas);
}