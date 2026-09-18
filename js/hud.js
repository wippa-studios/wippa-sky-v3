// ═══════════════════════════════════════════
//  HUD — Wippa Sky v2
// ═══════════════════════════════════════════

import { FLOOR_TYPES } from './constants.js';
import { getFloorCount, getCellTowerStatus } from './grid.js';
import { getCell } from './state.js';
import { getSimCount } from './sims.js';
import { getMoodColor, getMoodBand, getMoodLabel, getCellHappiness, getCellWaitingStats } from './needs.js';

export function updateHUD(state) {
  const moneyEl = document.getElementById('hud-money');
  const netEl = document.getElementById('hud-net');
  const popEl = document.getElementById('hud-pop');
  const floorsEl = document.getElementById('hud-floors');
  const ratingEl = document.getElementById('hud-rating');
  const dayEl = document.getElementById('date-day');
  const periodEl = document.getElementById('date-period');
  const happinessEl = document.getElementById('hud-happiness');

  if (moneyEl) moneyEl.textContent = '$' + Math.round(state.money).toLocaleString();
  if (netEl) {
    const net = state.net || 0;
    netEl.textContent = (net >= 0 ? '+' : '−') + '$' + Math.abs(Math.round(net)).toLocaleString();
    netEl.style.color = net >= 0 ? '#4ade80' : '#f87171';
  }
  if (popEl) popEl.textContent = state.population.toLocaleString();
  if (floorsEl) floorsEl.textContent = getFloorCount(state);
  if (ratingEl) ratingEl.textContent = '★'.repeat(state.rating);
  if (dayEl) dayEl.textContent = `Day ${state.day}`;
  if (periodEl) periodEl.textContent = state.dayPhase.charAt(0).toUpperCase() + state.dayPhase.slice(1);

  const label = document.getElementById('mood-overlay-label');
  if (label) label.classList.toggle('visible', !!state.moodOverlay);

  // CELL TWR button feedback: locked > ready > installed.
  const twrBtn = document.getElementById('cell-tower-btn');
  if (twrBtn) {
    const st = getCellTowerStatus(state);
    twrBtn.classList.toggle('locked', st === 'locked');
    twrBtn.classList.toggle('ready', st === 'ready');
    twrBtn.classList.toggle('owned', st === 'installed');
    const cost = twrBtn.querySelector('.cost');
    if (cost) cost.textContent = st === 'installed' ? 'Installed' : st === 'locked' ? '>40 floors' : '$25k';
    twrBtn.title = st === 'installed' ? 'CELL TWR installed — follows your roof' : st === 'locked' ? 'CELL TWR unlocks above 40 floors' : st === 'funds' ? 'Need $25,000 to install CELL TWR' : 'Click a top-floor cell or directly above it to install CELL TWR ($25k)';
  }

  if (happinessEl) {
    const mood = state.tenants.length > 0
      ? state.tenants.reduce((s, t) => s + t.mood, 0) / state.tenants.length
      : 70;
    happinessEl.textContent = Math.round(mood) + '%';
    happinessEl.style.color = getMoodColor(mood);
  }
}

export function addLog(state, text, type = '') {
  const log = document.getElementById('event-log');
  if (!log) return;
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `<span class="time">${state.dayPhase.slice(0, 3).toUpperCase()}</span>${text}`;
  log.appendChild(entry);
  if (log.children.length > 40) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}

export function showToast(text, type = 'info') {
  const container = document.getElementById('game-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = text;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

export function showInfoPanel(state, row, col) {
  const cell = getCell(state, row, col);
  if (!cell) { closeInfoPanel(); return; }
  const ft = FLOOR_TYPES[cell.type];
  if (!ft) return;
  const panel = document.getElementById('info-panel');
  const title = document.getElementById('info-title');
  const content = document.getElementById('info-content');
  if (!panel || !title || !content) return;

  const floorName = row < 0 ? 'B' + Math.abs(row) : 'F' + (row + 1);
  title.textContent = `${ft.icon} ${ft.name} — ${floorName}`;

  const happiness = getCellHappiness(state, row, col);
  const waiting = getCellWaitingStats(state, row, col);
  const moodColor = getMoodColor(happiness);
  const cap = ft.capacity || 0;
  const occ = cell.occupancy || 0;
  const occRatio = cap > 0 ? Math.min(1, occ / cap) : 1;
  const mult = cell.incomeMult || 1;
  const estIncome = ft.income > 0 ? Math.floor(ft.income * mult * Math.max(0.3, occRatio)) : 0;

  const rowHtml = (label, value, color) =>
    `<div class="info-row"><span class="label">${label}</span><span class="value"${color ? ` style="color:${color}"` : ''}>${value}</span></div>`;

  let html = '';
  html += rowHtml('Assigned', `${occ} / ${cap || '—'}`);
  html += rowHtml('Present now', `${cell.present || 0}`);
  if (ft.staffCapacity > 0) html += rowHtml('Staff', `${cell.staff || 0} / ${ft.staffCapacity}`);
  html += rowHtml('Income', ft.income > 0 ? `$${estIncome}/day` : '—', ft.income > 0 ? '#4ade80' : '');
  html += rowHtml('Mood', `${Math.round(happiness)}% · ${getMoodLabel(happiness)}`, moodColor);
  html += rowHtml('Income mult', `${Math.round(mult * 100)}%`);
  if (waiting.count > 0) {
    html += rowHtml('Waiting for lift', `${waiting.count} · avg ${Math.round(waiting.avgWait)}s`, '#f87171');
  }
  html += rowHtml('Built', `Day ${cell.built}`);
  if (cell.vacant) html += rowHtml('Status', `VACANT since Day ${cell.vacantSince}`, '#f87171');

  content.innerHTML = html;
  panel.classList.add('visible');
}

export function closeInfoPanel() {
  const panel = document.getElementById('info-panel');
  if (panel) panel.classList.remove('visible');
}

export function showAchievementPopup(ach) {
  const popup = document.getElementById('achievement-popup');
  const icon = document.getElementById('ach-icon');
  const name = document.getElementById('ach-name');
  if (!popup || !icon || !name) return;
  icon.textContent = ach.icon;
  name.textContent = ach.name;
  popup.classList.add('show');
  setTimeout(() => popup.classList.remove('show'), 2500);
}

export function showWeeklyReport(state) {
  const modal = document.getElementById('weekly-report');
  if (!modal) return;
  const content = document.getElementById('weekly-content');
  if (!content) return;

  const avgMood = state.tenants.length > 0
    ? state.tenants.reduce((s, t) => s + t.mood, 0) / state.tenants.length
    : 70;

  const topComplaints = state.complainLog
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  content.innerHTML = `
    <div class="report-stat"><span>Income</span><span style="color:#4ade80">$${state.income.toLocaleString()}</span></div>
    <div class="report-stat"><span>Expenses</span><span style="color:#f87171">$${state.expenses.toLocaleString()}</span></div>
    <div class="report-stat"><span>Net</span><span style="color:${state.income >= state.expenses ? '#4ade80' : '#f87171'}">$${(state.income - state.expenses).toLocaleString()}</span></div>
    <div class="report-stat"><span>Avg Mood</span><span style="color:${getMoodColor(avgMood)}">${Math.round(avgMood)}%</span></div>
    <div class="report-stat"><span>Rating</span><span>${'★'.repeat(state.rating)}</span></div>
    <div class="report-stat"><span>Move-outs</span><span>${state.stats.moveOuts}</span></div>
    <div class="report-stat"><span>Complaints</span><span>${state.stats.complaintsThisWeek}</span></div>
    ${topComplaints.length > 0 ? `
      <div class="report-section"><span>Top Complaints</span></div>
      ${topComplaints.map(c => `<div class="report-stat report-complaint"><span>${c.reason}</span><span>${c.count}x</span></div>`).join('')}
    ` : ''}
  `;
  modal.classList.add('visible');
}

export function closeWeeklyReport() {
  const modal = document.getElementById('weekly-report');
  if (modal) modal.classList.remove('visible');
}
