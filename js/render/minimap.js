// ═══════════════════════════════════════════
//  MINIMAP — Wippa Sky v2
// ═══════════════════════════════════════════

import { CELL_H, GROUND_Y_OFFSET, COLORS } from '../constants.js';

const MARGIN = 3;
const MINIMAP_BG = '#0f172a';
const GROUND_LINE_COLOR = '#64748b';
const VIEWPORT_COLOR = '#ffffff';
const UNDERGROUND_TINT = 'rgba(30, 20, 10, 0.35)';
const BASEMENT_LABEL_COLOR = '#94a3b8';

let lastRedrawTime = 0;
let minimapDirty = true;

export function markMinimapDirty() {
  minimapDirty = true;
}

function rowToMinimapY(row, topFloor, totalRange, minimapH) {
  return (topFloor - row) / totalRange * minimapH;
}

export function drawMinimap(ctx, state, minimapCanvas) {
  const W = minimapCanvas.width;
  const H = minimapCanvas.height;

  ctx.fillStyle = MINIMAP_BG;
  ctx.fillRect(0, 0, W, H);

  const topFloor = state.highestFloor + MARGIN;
  const bottomFloor = state.basementDepth - MARGIN;
  const totalRange = Math.max(1, topFloor - bottomFloor);

  function rowToY(row) {
    return rowToMinimapY(row, topFloor, totalRange, H);
  }

  const cellW = W / state.cols;
  const cellH = H / totalRange;

  if (state.basementDepth < 0) {
    const ugTop = rowToY(0);
    const ugBot = rowToY(state.basementDepth);
    ctx.fillStyle = UNDERGROUND_TINT;
    ctx.fillRect(0, ugTop, W, ugBot - ugTop);
  }

  const groundY = rowToY(0);
  ctx.strokeStyle = GROUND_LINE_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(W, groundY);
  ctx.stroke();

  for (const [row, cols] of state.grid) {
    for (let col = 0; col < state.cols; col++) {
      const cell = cols[col];
      if (!cell) continue;
      const color = COLORS.building[cell.type] || '#555555';
      ctx.fillStyle = color;
      ctx.fillRect(col * cellW, rowToY(row), cellW, cellH);
    }
  }

  const baseY = (state.canvasH || 600) - GROUND_Y_OFFSET;
  const zoom = state.zoom || 1;

  const rTop = (baseY + state.cameraY) / (CELL_H * zoom) - 1;
  const rBottom = (state.cameraY - GROUND_Y_OFFSET) / (CELL_H * zoom) - 1;

  const vpTop = rowToY(rTop);
  const vpBot = rowToY(rBottom);
  const clampTop = Math.max(0, vpTop);
  const clampBot = Math.min(H, vpBot);

  if (clampBot > clampTop) {
    ctx.strokeStyle = VIEWPORT_COLOR;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0.5, clampTop, W - 1, clampBot - clampTop);
  }

  if (state.basementDepth < 0) {
    ctx.fillStyle = BASEMENT_LABEL_COLOR;
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelY = (rowToY(0) + rowToY(state.basementDepth)) / 2;
    ctx.fillText('B', W / 2, labelY);
  }
}

export function updateMinimapThrottled(state, minimapCanvas) {
  const now = performance.now();
  if (minimapDirty || now - lastRedrawTime >= 250) {
    const ctx = minimapCanvas.getContext('2d');
    drawMinimap(ctx, state, minimapCanvas);
    lastRedrawTime = now;
    minimapDirty = false;
  }
}
