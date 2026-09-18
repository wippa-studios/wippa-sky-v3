// ════════════════════════════════════════════════════════════════
//  PERSPECTIVE — One-point perspective utilities
//  All vertical lines converge to a single vanishing point at the
//  center-top of the tower. Horizontal lines (floor edges) remain
//  horizontal. This is TRUE one-point perspective.
// ════════════════════════════════════════════════════════════════

import { CELL_W, CELL_H, GROUND_Y_OFFSET, towerShift } from '../constants.js';

// ─── Core perspective transform ────────────────────────────────

/**
 * Computes the perspective transform parameters for a given state.
 * Call once per frame, then use the returned functions.
 */
export function createPerspective(state) {
  const zoom = state.zoom || 1;
  const canvasW = state.canvasW || 1280;
  const canvasH = state.canvasH || 720;
  const cameraY = state.cameraY || 0;
  const cols = state.cols || 9;

  const towerW = cols * CELL_W * zoom;
  const towerLeft = (canvasW - towerW) / 2 + towerShift(zoom);
  const towerRight = towerLeft + towerW;
  const baseY = canvasH - GROUND_Y_OFFSET;

  // Building extents (used by volume/post/tower for silhouettes)
  const highest = state.highestFloor || 0;
  const lowest = Math.min(0, state.basementDepth || 0);

  // Vanishing point: center of tower, always several floors ABOVE the roof.
  // It follows the camera the SAME way orthoY does (+ cameraY), so scrolling
  // moves building and vanish together and the roof is always below the point.
  const vanishX = towerLeft + towerW / 2;
  const vanishY = baseY - (Math.max(highest, 8) + 6) * CELL_H * zoom + cameraY;

  // Perspective factor controls exaggeration
  // 0.005 = subtle, 0.01 = pronounced
  const perspectiveFactor = 0.005;

  /**
   * Transform a world point (col, row) to screen coordinates with perspective.
   * row: floor index (0 = ground, positive = up, negative = basement)
   * col: column index (0 to cols-1)
   * Returns { x, y, w, h, scale } where scale is the perspective scale factor.
   * Floors above ground recede toward the vanish point (scale < 1); basements
   * approach the viewer (scale > 1) — they sit below the ground line.
   */
  function project(col, row) {
    // Orthographic position (before perspective)
    const orthoX = towerLeft + col * CELL_W * zoom;
    const orthoY = baseY - (row + 1) * CELL_H * zoom + cameraY;
    const orthoW = CELL_W * zoom;
    const orthoH = CELL_H * zoom;

    // Perspective scale. row>0: shrink toward vanish. row<0: grow toward the
    // viewer (bottom of screen). Clamped so basements (max B8) stay sane.
    const perspectiveScale = Math.max(0.05, Math.min(3, 1 / (1 + row * perspectiveFactor)));

    // Project toward/away from vanishing point
    const x = vanishX + (orthoX - vanishX) * perspectiveScale;
    const y = vanishY + (orthoY - vanishY) * perspectiveScale;
    const w = orthoW * perspectiveScale;
    const h = orthoH * perspectiveScale;

    return { x, y, w, h, scale: perspectiveScale, orthoX, orthoY, row, col };
  }

  /**
   * Project a rectangle defined by (col, row) with given width/height in cells.
   * Returns the four corners in screen space: { tl, tr, br, bl }
   */
  function projectRect(col, row, widthCells = 1, heightCells = 1) {
    const tl = project(col, row);
    const tr = project(col + widthCells, row);
    const br = project(col + widthCells, row + heightCells);
    const bl = project(col, row + heightCells);
    return { tl, tr, br, bl };
  }

  /**
   * Get the screen Y for a given floor row (top of the cell)
   */
  function getFloorY(row) {
    return project(0, row).y;
  }

  /**
   * Get the screen Y for the roof of a given floor (bottom of the cell above)
   */
  function getRoofY(row) {
    return project(0, row + 1).y;
  }

/**
   * Get the vanish point
   */
  function getVanishPoint() {
    return { x: vanishX, y: vanishY };
  }

  /**
   * Inverse perspective: given a screen Y, find the floor row whose projected
   * cell contains it. y(r) is monotonic decreasing in r, but adjacent cells do
   * NOT tile contiguously (each floor's cell shrinks independently toward the
   * vanish point, leaving small gaps). Resolution: find the row whose cell
   * bottom is still below the cursor and whose cell top is above it; for a
   * cursor sitting in a gap, snap to the nearer cell.
   * Returns the row (clamped to the tower extent).
   */
  function rowAtScreenY(sy) {
    const bottomBelow = project(0, lowest).y + project(0, lowest).h;
    const topAbove = project(0, highest).y;
    if (sy >= bottomBelow) return lowest;   // at/below the lowest basement cell
    if (sy <= topAbove) return highest;     // at/above the highest cell

    // bottom(r) = y(r) + h(r) is strictly decreasing in r; find the LARGEST r
    // whose cell bottom still lies below the cursor (predicate is true for
    // small r, false for large r).
    let lo = lowest;
    let hi = highest;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      const pr = project(0, mid);
      if (pr.y + pr.h > sy) lo = mid;
      else hi = mid - 1;
    }
    const rB = lo;
    const prB = project(0, rB);
    if (sy >= prB.y) return rB; // cursor inside cell rB

    // Cursor sits in the gap between cell rB+1 (bottom edge) and cell rB
    // (top edge): snap to whichever cell is nearer.
    if (rB >= highest) return rB;
    const prN = project(0, rB + 1);
    const nextBottom = prN.y + prN.h; // <= sy by construction
    const distUp = prB.y - sy;        // distance into cell rB
    const distDown = sy - nextBottom; // distance into cell rB+1
    return distDown < distUp ? rB + 1 : rB;
  }

  /**
   * Inverse perspective: given a screen X and a known row, find the column.
   */
  function colAtScreenX(sx, row) {
    const s = project(0, row).scale || 1;
    const orthoX = (sx - vanishX) / s + vanishX;
    const col = Math.floor((orthoX - towerLeft) / (CELL_W * zoom));
    return col;
  }

  /**
   * Inverse perspective: screen point → { row, col } or null if outside columns.
   */
  function screenToCell(sx, sy) {
    const row = rowAtScreenY(sy);
    const col = colAtScreenX(sx, row);
    if (col < 0 || col >= cols) return null;
    return { row, col };
  }

  /**
   * Get tower bounds in orthographic space
   */
  function getTowerBounds() {
    return {
      left: towerLeft,
      right: towerLeft + towerW,
      baseY,
      towerW,
      vanishX,
      vanishY,
    };
  }

  return {
    project,
    projectRect,
    getFloorY,
    getRoofY,
    getVanishPoint,
    getTowerBounds,
    rowAtScreenY,
    colAtScreenX,
    screenToCell,
    zoom,
    cameraY,
    baseY,
    towerLeft,
    towerRight,
    towerW,
    vanishX,
    vanishY,
    perspectiveFactor,
    highest,
    lowest,
    cols,
  };
}

// ─── Convenience: project a shaft column across multiple floors ───────

/**
 * Project all floors of a shaft column, returning an array of projected cells
 * sorted bottom-to-top (for correct drawing order).
 */
export function projectShaftFloors(state, shaftCol, floorMin, floorMax) {
  const P = createPerspective(state);
  const cells = [];
  for (let row = floorMin; row <= floorMax; row++) {
    cells.push(P.project(shaftCol, row));
  }
  return cells;
}

// ─── Perspective-correct gradient helpers ────────────────────────

/**
 * Create a linear gradient that follows perspective (vertical gradient
 * that converges to vanishing point). Used for side faces, roof planes.
 */
export function createPerspectiveGradient(ctx, x1, y1, x2, y2, vanishX, vanishY, scale1, scale2) {
  // For vertical gradients on receding faces, we need to account for
  // the fact that the face gets narrower toward the top
  return ctx.createLinearGradient(x1, y1, x2, y2);
}

/**
 * Create a gradient for a side face that recedes in perspective.
 * The face is a trapezoid: wider at bottom, narrower at top.
 */
export function createSideFaceGradient(ctx, leftX, rightX, topY, bottomY, vanishX, vanishY, isNight) {
  // Gradient flows from front edge (bottom) to back edge (top)
  // In perspective, the back edge is at the vanishing point
  const g = ctx.createLinearGradient(leftX, bottomY, vanishX, vanishY);
  if (isNight) {
    g.addColorStop(0, '#1a2130');
    g.addColorStop(1, '#0a0f18');
  } else {
    g.addColorStop(0, '#3a4658');
    g.addColorStop(1, '#1e2836');
  }
  return g;
}

/**
 * Create a gradient for a roof plane that recedes in perspective.
 */
export function createRoofGradient(ctx, leftX, rightX, frontY, backY, vanishX, vanishY, isNight) {
  const g = ctx.createLinearGradient(leftX, frontY, vanishX, vanishY);
  if (isNight) {
    g.addColorStop(0, '#2b3444');
    g.addColorStop(1, '#171d27');
  } else {
    g.addColorStop(0, '#e6edf5');
    g.addColorStop(1, '#9dabbb');
  }
  return g;
}

// ─── Perspective-aware culling ────────────────────────────────

/**
 * Check if a projected cell is visible on screen (with margin).
 */
export function isProjectedCellVisible(proj, canvasW, canvasH, margin = 80) {
  return proj.x + proj.w > -margin &&
         proj.x < canvasW + margin &&
         proj.y + proj.h > -margin &&
         proj.y < canvasH + margin;
}

// ─── Perspective text rendering ────────────────────────────────

/**
 * Draw text at a perspective-projected position, scaled by perspective.
 */
export function drawPerspectiveText(ctx, text, proj, align = 'center', baseline = 'middle', maxWidth) {
  const scale = proj.scale;
  ctx.save();
  ctx.font = `${Math.max(6, 10 * scale)}px monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (maxWidth) {
    ctx.fillText(text, proj.x + proj.w / 2, proj.y + proj.h / 2, maxWidth / scale);
  } else {
    ctx.fillText(text, proj.x + proj.w / 2, proj.y + proj.h / 2);
  }
  ctx.restore();
}

export default {
  createPerspective,
  projectShaftFloors,
  createPerspectiveGradient,
  createSideFaceGradient,
  createRoofGradient,
  isProjectedCellVisible,
  drawPerspectiveText,
};