// ════════════════════════════════════════════════════════════════
//  VOLUME — Perspective-correct 2.5D massing for the tower
//
//  The tower is drawn as a real volume with TRUE one-point perspective:
//  - Front elevation (baked facade sprites) with perspective scaling
//  - Receding SIDE FACE converging to vanishing point
//  - ROOF PLANE converging to vanishing point
//  - Cast shadow with perspective
//  - Contact occlusion at ground
//  All derived from the per-row silhouette, so massing follows
//  whatever shape the player has actually built.
// ════════════════════════════════════════════════════════════════

import { CELL_H } from '../constants.js';
import { createPerspective } from './perspective.js';

// ─── Geometry helper ────────────────────────────────────────────

export function geometry(state) {
  return createPerspective(state);
}

export function rowInfo(state, row) {
  const r = state.grid.get(row);
  if (!r) return null;
  let left = -1, right = -1;
  for (let c = 0; c < state.cols; c++) {
    if (r[c]) { if (left < 0) left = c; right = c; }
  }
  return left < 0 ? null : { left, right };
}

// ─── Perspective-correct cast shadow ────────────────────────────

export function drawCastShadow(ctx, state, geo, nightAmt) {
  if (geo.highest <= 0 || !rowInfo(state, geo.highest)) return;
  if (nightAmt > 0.85) return;

  const sunX = 0.1 + 0.8 * (state.dayTime || 0);
  const dir = sunX < 0.5 ? 1 : -1;
  const strength = 0.30 * (1 - nightAmt);
  const baseY = geo.baseY + geo.cameraY;

  // A street-level ground shadow that falls away from the sun. It reads as a
  // soft quadrilateral cast on the sidewalk next to the tower.
  const x0 = dir > 0 ? geo.towerLeft : geo.towerLeft + geo.towerW;
  const x1 = dir > 0 ? geo.towerLeft + geo.towerW : geo.towerLeft;
  const len = geo.towerW * 0.5;
  const lift = Math.min(26 * geo.zoom, (geo.highest + 1) * CELL_H * geo.zoom * 0.12);
  const ex0 = x0 + dir * len;
  const ex1 = x1 + dir * len * 0.72;

  const g = ctx.createLinearGradient(x0, baseY, ex0, baseY - lift);
  g.addColorStop(0, `rgba(4,8,16,${strength})`);
  g.addColorStop(0.55, `rgba(4,8,16,${strength * 0.45})`);
  g.addColorStop(1, 'rgba(4,8,16,0)');
  ctx.fillStyle = g;

  ctx.beginPath();
  ctx.moveTo(x0, baseY + 2 * geo.zoom);
  ctx.lineTo(x1, baseY + 2 * geo.zoom);
  ctx.lineTo(ex1, baseY + 6 * geo.zoom - lift);
  ctx.lineTo(ex0, baseY + 4 * geo.zoom - lift);
  ctx.closePath();
  ctx.fill();

  // Contact occlusion at base (always orthographic, at street level)
  const cg = ctx.createLinearGradient(0, baseY, 0, baseY + 26 * geo.zoom);
  cg.addColorStop(0, `rgba(2,5,12,${0.5 * (1 - nightAmt) + 0.25})`);
  cg.addColorStop(1, 'rgba(2,5,12,0)');
  ctx.fillStyle = cg;
  ctx.fillRect(geo.towerLeft - 18 * geo.zoom, baseY, geo.towerW + 36 * geo.zoom, 26 * geo.zoom);
}

// ─── Perspective-correct side face + roof ────────────────────────

export function drawSideAndRoof(ctx, state, geo, nightAmt) {
  const night = nightAmt > 0.5;
  const vanishX = geo.vanishX;
  const vanishY = geo.vanishY;

  // Depth of the visible side bands: how far the "back" edge sits along the
  // line to the vanishing point (0 = flush with facade, 1 = at vanish point).
  const SIDE_DEPTH = 0.35;
  const ROOF_DEPTH = 0.5;

  // Homogeneous perspective step toward the vanish point.
  // A point P receded by factor d: Q = vanish + (P - vanish) * (1 - d).
  const recede = (px, py, d) => ({
    x: vanishX + (px - vanishX) * (1 - d),
    y: vanishY + (py - vanishY) * (1 - d),
  });

  const info = rowInfo(state, geo.highest);
  if (!info || geo.highest <= 0) return;

  // Tower silhouette: street-level corners and roof corners. The facade
  // tapers toward the vanish point, so the roof corners sit inside the
  // street-level corners — the region between them is the visible side band.
  const tl = geo.project(info.left, geo.highest + 1);
  const tr = geo.project(info.right + 1, geo.highest + 1);
  const baseY = geo.baseY + geo.cameraY;
  const baseL = { x: geo.towerLeft, y: baseY };
  const baseR = { x: geo.towerLeft + geo.towerW, y: baseY };
  const topL = { x: tl.x, y: tl.y };
  const topR = { x: tr.x + tr.w, y: tr.y };

  // Receded back edges of the side bands.
  const bTopL = recede(topL.x, topL.y, SIDE_DEPTH);
  const bBaseL = recede(baseL.x, baseL.y, SIDE_DEPTH);
  const bTopR = recede(topR.x, topR.y, SIDE_DEPTH);
  const bBaseR = recede(baseR.x, baseR.y, SIDE_DEPTH);

  const dayTone = night ? [0x18, 0x1e, 0x28] : [0x2a, 0x33, 0x40];
  const depthTone = dayTone.map(v => Math.max(0, v - 22));

  // LEFT side band (visible left of the tapering facade)
  const gL = ctx.createLinearGradient(baseL.x, baseY, bBaseL.x, baseY);
  gL.addColorStop(0, rgb(dayTone.map(v => Math.round(v * 0.82))));
  gL.addColorStop(1, rgb(depthTone));
  ctx.fillStyle = gL;
  ctx.beginPath();
  ctx.moveTo(baseL.x, baseL.y);
  ctx.lineTo(topL.x, topL.y);
  ctx.lineTo(bTopL.x, bTopL.y);
  ctx.lineTo(bBaseL.x, bBaseL.y);
  ctx.closePath();
  ctx.fill();

  // RIGHT side band
  const gR = ctx.createLinearGradient(baseR.x, baseY, bBaseR.x, baseY);
  gR.addColorStop(0, rgb(dayTone));
  gR.addColorStop(1, rgb(depthTone));
  ctx.fillStyle = gR;
  ctx.beginPath();
  ctx.moveTo(baseR.x, baseR.y);
  ctx.lineTo(topR.x, topR.y);
  ctx.lineTo(bTopR.x, bTopR.y);
  ctx.lineTo(bBaseR.x, bBaseR.y);
  ctx.closePath();
  ctx.fill();

  // Slab strip along the top of each side band (roof edge)
  const slabH = Math.max(1.5, 3 * geo.zoom);
  ctx.fillStyle = night ? 'rgba(58,70,90,0.85)' : 'rgba(150,162,178,0.6)';
  ctx.beginPath();
  ctx.moveTo(topL.x, topL.y);
  ctx.lineTo(bTopL.x, bTopL.y);
  ctx.lineTo(bTopL.x, bTopL.y + slabH);
  ctx.lineTo(topL.x, topL.y + slabH);
  ctx.closePath();
  ctx.fill();

  // Side window slots — a few dark glazing bands receding on the right face
  const slots = 4;
  for (let i = 0; i < slots; i++) {
    const fr = (i + 1) / (slots + 1);          // 0 (bottom) .. 1 (top)
    const rimX = topR.x + (baseR.x - topR.x) * fr;       // facade rim at height fr
    const rimY = topR.y + (baseR.y - topR.y) * fr;
    const backX = bTopR.x + (bBaseR.x - bTopR.x) * fr;   // back edge at height fr
    const backY = bTopR.y + (bBaseR.y - bTopR.y) * fr;
    const w = Math.max(1, (4.5 * geo.zoom) * (1 - fr * 0.4));
    const h = Math.max(1.5, rimY - backY - 2 * geo.zoom);
    if (h <= 1) continue;
    ctx.fillStyle = night
      ? (i === 1 ? 'rgba(255,206,140,0.40)' : 'rgba(8,11,18,0.60)')
      : 'rgba(26,36,50,0.32)';
    const cx = rimX + (backX - rimX) * 0.5;
    ctx.fillRect(cx - w / 2, backY + 1.5 * geo.zoom, w, h);
  }

  // ---- roof plane (finite depth, recedes toward vanish) ----
  const bLr = recede(topL.x, topL.y, ROOF_DEPTH);
  const bRr = recede(topR.x, topR.y, ROOF_DEPTH);

  const rg = ctx.createLinearGradient(topL.x, topL.y, vanishX, vanishY);
  if (night) { rg.addColorStop(0, '#2b3444'); rg.addColorStop(1, '#171d27'); }
  else { rg.addColorStop(0, '#e6edf5'); rg.addColorStop(1, '#9dabbb'); }
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(topL.x, topL.y);
  ctx.lineTo(topR.x, topR.y);
  ctx.lineTo(bRr.x, bRr.y);
  ctx.lineTo(bLr.x, bLr.y);
  ctx.closePath();
  ctx.fill();

  // Roof deck joints — lines from front edge toward the back edge
  ctx.strokeStyle = night ? 'rgba(150,165,190,0.14)' : 'rgba(96,108,124,0.22)';
  ctx.lineWidth = Math.max(0.5, 0.8 * geo.zoom);
  ctx.beginPath();
  for (let i = 1; i < 5; i++) {
    const ax = topL.x + (topR.x - topL.x) * (i / 5);
    const bx = bLr.x + (bRr.x - bLr.x) * (i / 5);
    const by = bLr.y + (bRr.y - bLr.y) * (i / 5);
    ctx.moveTo(ax, topL.y);
    ctx.lineTo(bx, by);
  }
  ctx.stroke();
}

function mixInt(a, b, t) {
  return Math.round(a + (b - a) * t);
}
function rgb([r, g, b]) {
  return `rgb(${r},${g},${b})`;
}