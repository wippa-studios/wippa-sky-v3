// ═══════════════════════════════════════════
//  ECONOMY — Wippa Sky v2
// ═══════════════════════════════════════════

import {
  FLOOR_TYPES, DAY_LENGTH_SECONDS, BANKRUPTCY_GRACE_DAYS,
  BANKRUPTCY_LOAN, BANKRUPTCY_RATING_PENALTY,
  SERVICE_EXPENSE_REDUCTION, MAX_SERVICES,
  PARKING_DEMAND_BONUS, SUBWAY_UNLOCK_POP, SUBWAY_INCOME,
} from './constants.js';
import { getCell, getRow } from './state.js';

export function calculateIncome(state) {
  let income = 0;
  let parkingCount = 0;
  let serviceCount = 0;
  for (const [row, cells] of state.grid) {
    for (let c = 0; c < state.cols; c++) {
      const cell = cells[c];
      if (!cell) continue;
      const ft = FLOOR_TYPES[cell.type];
      if (!ft || ft.income === 0) continue;
      if (cell.vacant) continue;
      const mult = cell.incomeMult || 1;
      const occupancyRatio = ft.capacity > 0 ? Math.min(1, cell.occupancy / ft.capacity) : 1;
      income += ft.income * mult * Math.max(0.3, occupancyRatio);
      if (cell.type === 'parking') parkingCount++;
      if (cell.type === 'service') serviceCount++;
    }
  }
  const subwayCells = getAllCellsOfTypeGrid(state, 'subway');
  if (subwayCells.length > 0 && state.population >= SUBWAY_UNLOCK_POP) {
    income += SUBWAY_INCOME * subwayCells.length;
  }
  return Math.round(income);
}

// Daily upkeep per cell. Infrastructure (lobbies, service) is free or cheap;
// revenue floors pay upkeep proportional to what they cost to build, so a tall
// tower costs more to run than a shack.
const UPKEEP = {
  lobby: 0, basementLobby: 0, service: 0, skyLobby: 30,
  elevator: 20, parking: 25, subway: 80,
  // The roof mast is infrastructure: one-off $25k install, no daily upkeep.
  cellTower: 0,
};

export function calculateExpenses(state) {
  let base = 0;
  for (const [, cells] of state.grid) {
    for (let c = 0; c < state.cols; c++) {
      const cell = cells[c];
      if (!cell) continue;
      const ft = FLOOR_TYPES[cell.type];
      if (!ft) continue;
      const upkeep = UPKEEP[cell.type] !== undefined
        ? UPKEEP[cell.type]
        : Math.max(20, Math.round(ft.cost * 0.005));
      base += upkeep;
    }
  }
  let serviceDiscount = 0;
  for (const [, cells] of state.grid) {
    for (let c = 0; c < state.cols; c++) {
      const cell = cells[c];
      if (cell && cell.type === 'service') serviceDiscount += SERVICE_EXPENSE_REDUCTION;
    }
  }
  serviceDiscount = Math.min(serviceDiscount, SERVICE_EXPENSE_REDUCTION * MAX_SERVICES);
  const weatherMult = (state.mods && state.mods.expenseMult) || 1;
  return Math.round(base * (1 - serviceDiscount) * weatherMult);
}

export function calculatePopulation(state) {
  // Population is the number of live tenants (residents, workers, guests, visitors).
  // state.tenants is always an array (createState inits []), so live count wins;
  // a grid-capacity fallback was dead code here and has been removed.
  return state.tenants.length;
}

export function calculateSatisfaction(state) {
  if (state.tenants.length === 0) return 50;
  let moodSum = 0;
  let furious = 0;
  for (const t of state.tenants) {
    moodSum += t.mood;
    if (t.mood < 25) furious++;
  }
  const avgMood = moodSum / state.tenants.length;
  let amenityScore = 0;
  for (const [row, cells] of state.grid) {
    if (row <= 0) continue;
    for (let c = 0; c < state.cols; c++) {
      const cell = cells[c];
      if (!cell || !FLOOR_TYPES[cell.type]) continue;
      if (FLOOR_TYPES[cell.type].satisfaction <= 0) continue;
      amenityScore += FLOOR_TYPES[cell.type].satisfaction;
    }
  }
  const amenityBonus = Math.min(amenityScore * 0.3, 18);
  const vacancyPenalty = Math.min(countVacancies(state) * 4, 20);
  const furiousPenalty = Math.min((furious / Math.max(1, state.tenants.length)) * 60, 18);
  return Math.min(100, Math.max(0, Math.round(avgMood * 0.62 + amenityBonus + 26 - vacancyPenalty - furiousPenalty)));
}

function countVacancies(state) {
  let n = 0;
  for (const [, cells] of state.grid) {
    for (let c = 0; c < state.cols; c++) {
      if (cells[c] && cells[c].vacant) n++;
    }
  }
  return n;
}

export function calculateRating(satisfaction) {
  if (satisfaction > 90) return 5;
  if (satisfaction > 75) return 4;
  if (satisfaction > 60) return 3;
  if (satisfaction > 40) return 2;
  return 1;
}

export function calculateDemand(state) {
  let demand = 1.0;
  demand += (state.rating - 3) * 0.15;
  const parkingCells = getAllCellsOfTypeGrid(state, 'parking');
  demand += parkingCells.length * PARKING_DEMAND_BONUS;
  if (state.population >= SUBWAY_UNLOCK_POP) {
    const subwayCells = getAllCellsOfTypeGrid(state, 'subway');
    if (subwayCells.length > 0) demand += 0.2;
  }
  return Math.max(0.5, Math.min(2, demand));
}

export function getOfficeStaffingRatio(state, row, col) {
  const cell = getCell(state, row, col);
  if (!cell || cell.type !== 'office') return 1;
  const ft = FLOOR_TYPES.office;
  if (ft.capacity === 0) return 1;
  const simCount = state.tenants.filter(t => t.floor === row && t.col === col && t.kind === 'worker').length;
  return Math.min(1, simCount / ft.staffCapacity);
}

export function checkBankruptcy(state) {
  if (state.money < 0) {
    state.bankruptcyDays++;
    if (state.bankruptcyDays >= BANKRUPTCY_GRACE_DAYS) {
      return 'bankrupt';
    }
    return 'warning';
  }
  state.bankruptcyDays = 0;
  return 'ok';
}

export function applyEmergencyLoan(state) {
  state.money += BANKRUPTCY_LOAN;
  state.rating = Math.max(1, state.rating - BANKRUPTCY_RATING_PENALTY);
  state.bankruptcyDays = 0;
}

export function tickEconomy(state) {
  state.income = calculateIncome(state);
  state.expenses = calculateExpenses(state);
  state.population = calculatePopulation(state);
  state.satisfaction = calculateSatisfaction(state);
  state.rating = calculateRating(state.satisfaction);
  state.money += state.income;
  state.money -= state.expenses;
  state.net = state.income - state.expenses;
}

function getAllCellsOfTypeGrid(state, type) {
  const cells = [];
  for (const [row, rowCells] of state.grid) {
    for (let c = 0; c < state.cols; c++) {
      if (rowCells[c] && rowCells[c].type === type) {
        cells.push({ row, col: c });
      }
    }
  }
  return cells;
}
