// ═══════════════════════════════════════════
//  ELEVATORS — Rendering & Visual State
//  Wippa Sky v2
// ═══════════════════════════════════════════

import { CELL_W, CELL_H, COLORS, ELEVATOR_SPEED } from './constants.js';
import { cellToScreenLocal, cellToScreenPerspective } from './grid.js';
import { getCell } from './state.js';

// ── internal state for visual-only animations ──────────────────

const _callPulse = new Map();   // key: "shaftId-floor" → { t, active }
const _indicatorFlash = new Map(); // key: "carIdx" → { t, color }

// ── helpers ────────────────────────────────────────────────────

function callPulseKey(shaftId, floor) {
  return `${shaftId}-${floor}`;
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function lerpColor(c1, c2, t) {
  const h2d = s => parseInt(s.slice(1), 16);
  const v1 = h2d(c1), v2 = h2d(c2);
  const r1 = (v1 >> 16) & 0xff, g1 = (v1 >> 8) & 0xff, b1 = v1 & 0xff;
  const r2 = (v2 >> 16) & 0xff, g2 = (v2 >> 8) & 0xff, b2 = v2 & 0xff;
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// ═══════════════════════════════════════════
//  drawElevatorInterior
//  Draws the static interior of a single elevator cell
// ═══════════════════════════════════════════

export function drawElevatorInterior(ctx, x, y, w, h) {
  // dark shaft background
  ctx.fillStyle = '#1a1f2e';
  ctx.fillRect(x, y, w, h);

  // subtle inner shadow (top edge darkening)
  const innerShadow = ctx.createLinearGradient(x, y, x, y + h * 0.3);
  innerShadow.addColorStop(0, 'rgba(0,0,0,0.4)');
  innerShadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = innerShadow;
  ctx.fillRect(x, y, w, h * 0.3);

  // vertical rails — thin lines on left and right inner edges
  const railInset = w * 0.12;
  ctx.strokeStyle = 'rgba(100,116,139,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + railInset, y + 2);
  ctx.lineTo(x + railInset, y + h - 2);
  ctx.moveTo(x + w - railInset, y + 2);
  ctx.lineTo(x + w - railInset, y + h - 2);
  ctx.stroke();

  // control panel — small rectangle on the left interior wall
  const panelW = w * 0.15;
  const panelH = h * 0.45;
  const panelX = x + railInset + 2;
  const panelY = y + (h - panelH) / 2;
  drawRoundedRect(ctx, panelX, panelY, panelW, panelH, 2);
  ctx.fillStyle = '#334155';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148,163,184,0.3)';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // panel buttons — tiny dots
  const btnCount = 4;
  const btnR = Math.min(panelW, panelH) * 0.1;
  for (let i = 0; i < btnCount; i++) {
    const bx = panelX + panelW * 0.3;
    const by = panelY + panelH * (0.2 + (i / (btnCount - 1)) * 0.6);
    ctx.beginPath();
    ctx.arc(bx, by, btnR, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 === 0 ? '#fbbf24' : '#94a3b8';
    ctx.fill();
  }

  // floor indicator light strip at top center
  const stripW = w * 0.3;
  const stripH = h * 0.12;
  const stripX = x + (w - stripW) / 2;
  const stripY = y + h * 0.08;
  drawRoundedRect(ctx, stripX, stripY, stripW, stripH, 2);
  ctx.fillStyle = 'rgba(100,116,139,0.3)';
  ctx.fill();

  // subtle center glow
  const centerGlow = ctx.createRadialGradient(
    x + w / 2, y + h / 2, 0,
    x + w / 2, y + h / 2, w * 0.4
  );
  centerGlow.addColorStop(0, 'rgba(148,163,184,0.04)');
  centerGlow.addColorStop(1, 'rgba(148,163,184,0)');
  ctx.fillStyle = centerGlow;
  ctx.fillRect(x, y, w, h);
}

// ═══════════════════════════════════════════
//  drawElevatorCar
//  Draws a single elevator car at its current position
// ═══════════════════════════════════════════

export function drawElevatorCar(ctx, car, shaft, state, isNight) {
  const col = shaft.col;
  const floorPos = car.pos; // float position in floor units
  const zoom = state.zoom || 1;

  // compute screen position using perspective transform (matches tower.js)
  const rowBelow = Math.floor(floorPos);
  const frac = floorPos - rowBelow;
  const pos0 = cellToScreenPerspective(state, rowBelow, col);
  const pos1 = cellToScreenPerspective(state, rowBelow + 1, col);
  const cellX = pos0.x + frac * (pos1.x - pos0.x);
  const cellY = pos0.y + frac * (pos1.y - pos0.y);
  const cellW = pos0.w + frac * (pos1.w - pos0.w);
  const cellH = pos0.h + frac * (pos1.h - pos0.h);
  const carX = cellX;
  const carY = cellY;
  const carW = cellW;
  const carH = cellH;

  // ── car body ──
  const bodyMargin = carW * 0.08;
  const bx = carX + bodyMargin;
  const by = carY + 1;
  const bw = carW - bodyMargin * 2;
  const bh = carH - 2;

  // ── shadow the car casts into the shaft ──
  const shGrad = ctx.createLinearGradient(bx, by - 3 * zoom, bx, by + bh + 10 * zoom);
  shGrad.addColorStop(0, 'rgba(0,0,0,0)');
  shGrad.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = shGrad;
  ctx.fillRect(bx - 3 * zoom, by - 3 * zoom, bw + 6 * zoom, bh + 13 * zoom);

  // metallic gradient — brushed steel / graphite
  const grad = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
  grad.addColorStop(0, isNight ? '#232c3a' : '#3d4759');
  grad.addColorStop(0.3, isNight ? '#333f52' : '#5b6a80');
  grad.addColorStop(0.5, isNight ? '#46546b' : '#7d8ea6');
  grad.addColorStop(0.7, isNight ? '#333f52' : '#5b6a80');
  grad.addColorStop(1, isNight ? '#232c3a' : '#3d4759');

  drawRoundedRect(ctx, bx, by, bw, bh, 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // outline
  ctx.strokeStyle = isNight ? 'rgba(148,163,184,0.25)' : 'rgba(100,116,139,0.4)';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // ── glass door window (upper 60% of car) ──
  const glassInset = bw * 0.12;
  const glassW = bw - glassInset * 2;
  const glassTop = by + bh * 0.1;
  const glassH = bh * 0.55;

  ctx.save();
  drawRoundedRect(ctx, bx + glassInset, glassTop, glassW, glassH, 2);
  ctx.clip();

  // glass fill
  const glassGrad = ctx.createLinearGradient(bx + glassInset, glassTop, bx + glassInset + glassW, glassTop);
  if (isNight) {
    glassGrad.addColorStop(0, 'rgba(30,41,59,0.9)');
    glassGrad.addColorStop(0.5, 'rgba(45,55,72,0.95)');
    glassGrad.addColorStop(1, 'rgba(30,41,59,0.9)');
  } else {
    glassGrad.addColorStop(0, 'rgba(51,65,85,0.85)');
    glassGrad.addColorStop(0.5, 'rgba(71,85,105,0.9)');
    glassGrad.addColorStop(1, 'rgba(51,65,85,0.85)');
  }
  ctx.fillStyle = glassGrad;
  ctx.fillRect(bx + glassInset, glassTop, glassW, glassH);

  // glass shine / reflection
  const shineGrad = ctx.createLinearGradient(bx + glassInset, glassTop, bx + glassInset + glassW * 0.4, glassTop + glassH);
  shineGrad.addColorStop(0, 'rgba(255,255,255,0.08)');
  shineGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shineGrad;
  ctx.fillRect(bx + glassInset, glassTop, glassW * 0.5, glassH);

  ctx.restore();

  // ── door split line (center vertical) when opening ──
  if (car.doorOpen > 0.1) {
    const openAmt = Math.min(1, car.doorOpen);
    const doorGap = glassW * 0.4 * openAmt;
    const doorY = glassTop;
    const doorH2 = glassH;

    // left door slides left, right door slides right
    const leftDoorX = bx + glassInset + glassW / 2 - doorGap;
    const rightDoorX = bx + glassInset + glassW / 2 + doorGap;
    const doorW = (glassW / 2) - 2;

    // draw doors (cover the glass area minus the gap)
    ctx.fillStyle = isNight ? '#3b4a5c' : '#475569';
    ctx.fillRect(bx + glassInset, doorY, doorGap < 2 ? doorW : 0, doorH2); // left door cover
    ctx.fillRect(rightDoorX, doorY, doorGap < 2 ? 0 : doorW, doorH2); // right door cover

    // if doors are significantly open, draw the dark gap
    if (doorGap > 3) {
      ctx.fillStyle = 'rgba(10,15,25,0.85)';
      ctx.fillRect(leftDoorX, doorY, doorGap * 2, doorH2);
    }
  }

  // ── door rails (horizontal lines on car body) ──
  ctx.strokeStyle = 'rgba(148,163,184,0.15)';
  ctx.lineWidth = 0.5;
  const railY1 = by + bh * 0.08;
  const railY2 = by + bh * 0.92;
  ctx.beginPath();
  ctx.moveTo(bx + 2, railY1);
  ctx.lineTo(bx + bw - 2, railY1);
  ctx.moveTo(bx + 2, railY2);
  ctx.lineTo(bx + bw - 2, railY2);
  ctx.stroke();

  // ── passengers inside the car ──
  const passengers = car.passengers || [];
  if (passengers.length > 0) {
    const shown = Math.min(passengers.length, 6);
    const rowW = glassW / (shown + 1);
    for (let i = 0; i < shown; i++) {
      const hx = bx + glassInset + rowW * (i + 1);
      const hy = glassTop + glassH * 0.62;
      ctx.fillStyle = (passengers[i].sim && passengers[i].sim.color) || '#cbd5e1';
      ctx.beginPath();
      ctx.arc(hx, hy, Math.max(1.2, 1.9 * zoom), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = (passengers[i].sim && passengers[i].sim.skin) || '#f3c59b';
      ctx.beginPath();
      ctx.arc(hx, hy - 2.2 * zoom, Math.max(0.9, 1.4 * zoom), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── passenger count indicator ──
  const count = passengers.length;
  const cap = car.capacity || 8;
  if (count > 0) {
    const indicX = bx + bw * 0.75;
    const indicY = by + bh * 0.72;
    const indicW = bw * 0.18;
    const indicH = bh * 0.18;

    drawRoundedRect(ctx, indicX, indicY, indicW, indicH, 2);
    const load = count / cap;
    ctx.fillStyle = load > 0.8 ? 'rgba(239,68,68,0.7)' :
                    load > 0.5 ? 'rgba(251,191,36,0.7)' :
                    'rgba(74,222,128,0.7)';
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(6, bh * 0.14)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${count}`, indicX + indicW / 2, indicY + indicH / 2);
  }

  // ── state indicator light ──
  const lightR = Math.max(2, bh * 0.06);
  const lightX = bx + bw * 0.22;
  const lightY = by + bh * 0.76;

  let lightColor;
  if (car.state === 'moving') {
    lightColor = '#4ade80'; // green
  } else if (car.state === 'doors') {
    lightColor = '#f87171'; // red — doors open
  } else {
    lightColor = '#fbbf24'; // amber — idle
  }

  // glow behind light
  const glow = ctx.createRadialGradient(lightX, lightY, 0, lightX, lightY, lightR * 3);
  glow.addColorStop(0, lightColor + '60');
  glow.addColorStop(1, lightColor + '00');
  ctx.fillStyle = glow;
  ctx.fillRect(lightX - lightR * 3, lightY - lightR * 3, lightR * 6, lightR * 6);

  ctx.beginPath();
  ctx.arc(lightX, lightY, lightR, 0, Math.PI * 2);
  ctx.fillStyle = lightColor;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // ── direction arrow on car ──
  if (car.dir === 'up' || car.dir === 'down') {
    const arrowX = bx + bw * 0.5;
    const arrowY = by + bh * 0.76;
    const arrowSize = bh * 0.08;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    if (car.dir === 'up') {
      ctx.moveTo(arrowX, arrowY - arrowSize);
      ctx.lineTo(arrowX - arrowSize * 0.7, arrowY + arrowSize * 0.4);
      ctx.lineTo(arrowX + arrowSize * 0.7, arrowY + arrowSize * 0.4);
    } else {
      ctx.moveTo(arrowX, arrowY + arrowSize);
      ctx.lineTo(arrowX - arrowSize * 0.7, arrowY - arrowSize * 0.4);
      ctx.lineTo(arrowX + arrowSize * 0.7, arrowY - arrowSize * 0.4);
    }
    ctx.closePath();
    ctx.fill();
  }
}

// ═══════════════════════════════════════════
//  drawElevatorShafts
//  Draws all elevator shaft cells, call buttons, indicators, and cars
// ═══════════════════════════════════════════

export function drawElevatorShafts(ctx, state) {
  const zoom = state.zoom || 1;
  const isNight = state.dayPhase === 'night';

  // ── pass 1: draw shaft cell backgrounds and indicators ──
  for (const [row, cells] of state.grid) {
    for (let col = 0; col < state.cols; col++) {
      const cell = cells[col];
      if (!cell || cell.type !== 'elevator') continue;

      const pos = cellToScreenPerspective(state, row, col);
      const { x, y, w, h } = pos;

      // shaft background (deep recess, graphite)
      drawRoundedRect(ctx, x, y, w, h, 2);
      const shaftGrad = ctx.createLinearGradient(x, y, x, y + h);
      shaftGrad.addColorStop(0, '#141c28');
      shaftGrad.addColorStop(0.5, '#1e2836');
      shaftGrad.addColorStop(1, '#141c28');
      ctx.fillStyle = shaftGrad;
      ctx.fill();

      // shaft border — matches the facade mullion colour
      ctx.strokeStyle = 'rgba(93,113,134,0.28)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // interior details
      drawElevatorInterior(ctx, x, y, w, h);

      // ── call button indicators on shaft walls ──
      const shaftId = cell.elevatorId;
      if (shaftId == null || shaftId < 0) continue;

      const shaft = state.elevators.find(e => e.id === shaftId);
      if (!shaft) continue;

      // draw up/down call buttons on the left wall of the shaft
      const btnW = w * 0.14;
      const btnH = h * 0.22;
      const btnX = x + 2;
      const upBtnY = y + h * 0.12;
      const downBtnY = y + h * 0.66;

      // check if there's a pending call for this floor
      const callButtons = state._callButtons;
      let hasUpCall = false;
      let hasDownCall = false;
      if (callButtons) {
        for (const [, call] of callButtons) {
          if (call.shaftId === shaftId && call.floor === row && !call.served) {
            if (call.dir === 'up') hasUpCall = true;
            if (call.dir === 'down') hasDownCall = true;
          }
        }
      }

      // up button
      drawRoundedRect(ctx, btnX, upBtnY, btnW, btnH, 1);
      ctx.fillStyle = hasUpCall ? '#4ade80' : 'rgba(100,116,139,0.2)';
      ctx.fill();
      ctx.strokeStyle = hasUpCall ? 'rgba(74,222,128,0.6)' : 'rgba(100,116,139,0.15)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // up arrow
      ctx.fillStyle = hasUpCall ? '#fff' : 'rgba(200,200,200,0.3)';
      ctx.font = `${Math.max(6, btnH * 0.65)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('▲', btnX + btnW / 2, upBtnY + btnH / 2);

      // down button
      drawRoundedRect(ctx, btnX, downBtnY, btnW, btnH, 1);
      ctx.fillStyle = hasDownCall ? '#4ade80' : 'rgba(100,116,139,0.2)';
      ctx.fill();
      ctx.strokeStyle = hasDownCall ? 'rgba(74,222,128,0.6)' : 'rgba(100,116,139,0.15)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // down arrow
      ctx.fillStyle = hasDownCall ? '#fff' : 'rgba(200,200,200,0.3)';
      ctx.fillText('▼', btnX + btnW / 2, downBtnY + btnH / 2);

      // ── floor number indicator (right wall) ──
      const floorLabelW = w * 0.2;
      const floorLabelH = h * 0.2;
      const floorLabelX = x + w - floorLabelW - 2;
      const floorLabelY = y + 2;
      drawRoundedRect(ctx, floorLabelX, floorLabelY, floorLabelW, floorLabelH, 1);
      ctx.fillStyle = 'rgba(15,21,32,0.7)';
      ctx.fill();

      ctx.fillStyle = 'rgba(148,163,184,0.5)';
      ctx.font = `${Math.max(5, floorLabelH * 0.6)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${row}`, floorLabelX + floorLabelW / 2, floorLabelY + floorLabelH / 2);
    }
  }

  // ── pass 2: draw call lamps on shaft walls at floors with pending calls ──
  if (state._callButtons) {
    for (const [key, call] of state._callButtons) {
      if (call.served) continue;

      const shaft = state.elevators.find(e => e.id === call.shaftId);
      if (!shaft) continue;

      const pulseKey = callPulseKey(shaft.id, call.floor);
      let pulse = _callPulse.get(pulseKey);
      if (!pulse) {
        pulse = { t: 0, active: true };
        _callPulse.set(pulseKey, pulse);
      }
      pulse.t += 0.02;
      const pulseAlpha = 0.5 + 0.5 * Math.sin(pulse.t * 4);

      const pos = cellToScreenPerspective(state, call.floor, shaft.col);
      const lampR = Math.max(2, pos.w * 0.03);
      const lampX = pos.x + pos.w + 2;
      const lampY = call.dir === 'up' ? pos.y + pos.h * 0.25 : pos.y + pos.h * 0.75;

      // glow
      const glowGrad = ctx.createRadialGradient(lampX, lampY, 0, lampX, lampY, lampR * 4);
      glowGrad.addColorStop(0, `rgba(74,222,128,${0.3 * pulseAlpha})`);
      glowGrad.addColorStop(1, 'rgba(74,222,128,0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(lampX, lampY, lampR * 4, 0, Math.PI * 2);
      ctx.fill();

      // lamp
      ctx.beginPath();
      ctx.arc(lampX, lampY, lampR, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(74,222,128,${0.6 + 0.4 * pulseAlpha})`;
      ctx.fill();

      // direction label next to lamp
      ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.3 * pulseAlpha})`;
      ctx.font = `${Math.max(6, lampR * 1.6)}px monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(call.dir === 'up' ? '▲' : '▼', lampX + lampR + 2, lampY);
    }
  }

  // ── pass 3: draw all elevator cars ──
  for (let i = 0; i < state.elevatorCars.length; i++) {
    const car = state.elevatorCars[i];
    const shaft = state.elevators.find(e => e.id === car.elevatorId);
    if (!shaft) continue;

    drawElevatorCar(ctx, car, shaft, state, isNight);
  }

  drawShaftWaitBadges(ctx, state);
}

// ═══════════════════════════════════════════
//  drawShaftWaitBadges — live wait-time pills per crowded floor
// ═══════════════════════════════════════════

function drawShaftWaitBadges(ctx, state) {
  const waiting = state._waitingPassengers;
  if (!waiting || waiting.length === 0) return;

  // Aggregate per shaft: show a single badge at the worst-served floor so the
  // screen stays readable even when the network is overloaded.
  const byShaft = new Map();
  for (const w of waiting) {
    if (!w.waiting) continue;
    const age = state.tick - w.timestamp;
    let a = byShaft.get(w.shaftId);
    if (!a) { a = { floor: w.floor, max: 0, count: 0 }; byShaft.set(w.shaftId, a); }
    a.count++;
    if (age > a.max) { a.max = age; a.floor = w.floor; }
  }

  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const [shaftId, a] of byShaft) {
    if (a.max < 8) continue;
    const shaft = state.elevators.find(e => e.id === shaftId);
    if (!shaft) continue;
    const pos = cellToScreenPerspective(state, a.floor, shaft.col);
    const sec = Math.round(a.max);
    const txt = a.count > 1 ? `${sec}s · ${a.count}` : `${sec}s`;
    const w = ctx.measureText(txt).width + 12;
    const x = pos.x - w - 3;
    const y = pos.y + pos.h / 2;
    const col = sec > 30 ? 'rgba(239,68,68,0.95)'
      : sec > 15 ? 'rgba(251,146,60,0.95)'
      : 'rgba(251,191,36,0.92)';
    drawRoundedRect(ctx, x, y - 8, w, 16, 8);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.fillStyle = '#10131a';
    ctx.fillText(txt, x + w / 2, y + 0.5);
  }

  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

// ═══════════════════════════════════════════
//  updateElevatorVisuals
//  Updates visual-only effects: door animation, call button pulse
// ═══════════════════════════════════════════

export function updateElevatorVisuals(state, dt) {
  // ── animate door open/close based on car.doorOpen ──
  // The doorOpen value is already driven by dispatch.js,
  // but we smooth it here for visual fluidity
  for (let i = 0; i < state.elevatorCars.length; i++) {
    const car = state.elevatorCars[i];

    // smooth the doorOpen value toward the target
    // dispatch sets doorOpen to 0-1; we just ensure smooth visual transitions
    if (car.state === 'doors') {
      // doors state: doorOpen ramps up/down as driven by dispatch
      // no additional smoothing needed — dispatch handles it
    } else if (car.state === 'idle' || car.state === 'moving') {
      // ensure doors are visually closed when not in doors state
      if (car.doorOpen > 0) {
        car.doorOpen = Math.max(0, car.doorOpen - dt * 3);
      }
    }

    // update state indicator flash
    const flashKey = `car-${i}`;
    let flash = _indicatorFlash.get(flashKey);
    if (!flash) {
      flash = { t: 0, color: '#4ade80' };
      _indicatorFlash.set(flashKey, flash);
    }
    // flash t advances for potential pulsing effects
    flash.t += dt;
  }

  // ── update call button pulse timers ──
  for (const [key, call] of (state._callButtons || new Map())) {
    if (call.served) {
      _callPulse.delete(key);
      continue;
    }
    const pulseKey = callPulseKey(call.shaftId, call.floor);
    let pulse = _callPulse.get(pulseKey);
    if (!pulse) {
      pulse = { t: 0, active: true };
      _callPulse.set(pulseKey, pulse);
    }
    pulse.t += dt;
  }

  // clean up stale pulse entries for served calls
  for (const [key] of _callPulse) {
    if (!state._callButtons || !state._callButtons.has(key)) {
      _callPulse.delete(key);
    }
  }
}
