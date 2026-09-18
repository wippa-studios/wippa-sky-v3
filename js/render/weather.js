// ═══════════════════════════════════════════════════════════════
//  WEATHER RENDER — rain, snow, fog, lightning, overcast tone
// ═══════════════════════════════════════════════════════════════

import { TYPES } from '../weather.js';

export function drawWeatherSky(ctx, state, canvasW, canvasH) {
  const w = state.weather;
  if (!w || w.cloud < 0.05) return;
  const a = Math.min(1, w.cloud);
  const g = ctx.createLinearGradient(0, 0, 0, canvasH);
  const grey = w.snow > 0.5 ? '215,222,232' : '120,132,150';
  g.addColorStop(0, `rgba(${grey},${0.30 * a})`);
  g.addColorStop(0.6, `rgba(${grey},${0.16 * a})`);
  g.addColorStop(1, `rgba(${grey},${0.08 * a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvasW, canvasH);
}

export function drawWeatherFront(ctx, state, canvasW, canvasH) {
  const w = state.weather;
  if (!w) return;

  // fog banks
  if (w.fog > 0.05) {
    for (let i = 0; i < 3; i++) {
      const y = canvasH * (0.45 + i * 0.16);
      const g = ctx.createLinearGradient(0, y - 60, 0, y + 60);
      g.addColorStop(0, 'rgba(196,206,220,0)');
      g.addColorStop(0.5, `rgba(196,206,220,${0.10 * w.fog})`);
      g.addColorStop(1, 'rgba(196,206,220,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, y - 60, canvasW, 120);
    }
  }

  // rain
  if (w.rain > 0.05) {
    const n = Math.floor(w.drops.length * Math.min(1, w.rain / 1.7));
    ctx.strokeStyle = `rgba(178,205,235,${0.32 * Math.min(1, w.rain)})`;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const d = w.drops[i];
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - 3, d.y + d.l);
    }
    ctx.stroke();
  }

  // snow
  if (w.flakes > 0.05) {
    const n = Math.floor(w.flakesArr.length * w.flakes);
    ctx.fillStyle = `rgba(240,246,255,${0.75 * w.flakes})`;
    for (let i = 0; i < n; i++) {
      const f = w.flakesArr[i];
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // lightning
  if (w.flash > 0.01) {
    ctx.fillStyle = `rgba(226,236,255,${0.42 * w.flash})`;
    ctx.fillRect(0, 0, canvasW, canvasH);
  }
}

export function weatherChip(state) {
  const w = state.weather || { type: 'clear' };
  const t = TYPES[w.type] || TYPES.clear;
  return { icon: t.icon, label: t.label };
}
