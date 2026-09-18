// ═══════════════════════════════════════════
//  ACHIEVEMENTS — Wippa Sky v2
// ═══════════════════════════════════════════

import { getFloorCount, getCellCount } from './grid.js';
import { getSimCount, getSimCountByKind } from './sims.js';
import { getAllCellsOfType } from './grid.js';

const ACHIEVEMENTS = {
  first_build:     { icon: '🏗️', name: 'First Floor' },
  ten_floors:      { icon: '🏢', name: 'Rising Tower' },
  twenty_floors:   { icon: '🌆', name: 'Skyline Builder' },
  fifty_floors:    { icon: '🏙️', name: 'Tower Titan' },
  hundred_floors:  { icon: '👑', name: 'Sky Master' },
  first_resident:  { icon: '🏠', name: 'Home Sweet Home' },
  pop_10:          { icon: '👥', name: 'Small Community' },
  pop_50:          { icon: '🏘️', name: 'Growing Town' },
  pop_100:         { icon: '🌆', name: 'Bustling City' },
  first_cinema:    { icon: '🎬', name: 'Entertainment Hub' },
  first_spa:       { icon: '💆', name: 'Luxury Living' },
  first_park:      { icon: '🌳', name: 'Green Space' },
  five_star:       { icon: '⭐', name: 'Five Star Rating' },
  rich:            { icon: '💎', name: 'Millionaire' },
  altitude_sick:   { icon: '🌤️', name: 'Altitude Sickness' },
  orbital_views:   { icon: '🛰', name: 'Orbital Views' },
  space_elevator:  { icon: '🌌', name: 'Space Elevator' },
  dig_it:          { icon: '⛏️', name: 'Dig It' },
  mole_city:       { icon: '🦫', name: 'Mole City' },
  transit_oriented: { icon: '🚇', name: 'Transit Oriented' },
  express_rider:   { icon: '🚄', name: 'Express Rider' },
  sky_lobby:       { icon: '☁️', name: 'Sky Lobby' },
  zero_complaints: { icon: '😊', name: 'Zero Complaints Week' },
  happy_week:      { icon: '🎉', name: 'Happy Week' },
  land_baron:      { icon: '🗺️', name: 'Land Baron' },
};

export function checkAchievements(state) {
  const unlocks = [];
  const fc = getFloorCount(state);
  const cc = getCellCount(state);
  const pop = state.population;

  if (cc >= 1) unlocks.push('first_build');
  if (fc >= 10) unlocks.push('ten_floors');
  if (fc >= 20) unlocks.push('twenty_floors');
  if (fc >= 50) unlocks.push('fifty_floors');
  if (fc >= 100) unlocks.push('hundred_floors');
  if (fc >= 150) unlocks.push('altitude_sick');
  if (fc >= 250) unlocks.push('orbital_views');
  if (fc >= 512) unlocks.push('space_elevator');
  if (pop > 0) unlocks.push('first_resident');
  if (pop >= 10) unlocks.push('pop_10');
  if (pop >= 50) unlocks.push('pop_50');
  if (pop >= 100) unlocks.push('pop_100');
  if (state.rating >= 5) unlocks.push('five_star');
  if (state.money >= 1000000) unlocks.push('rich');
  if (state.stats.complaintsThisWeek === 0 && state.weekAccumulator >= 7) {
    unlocks.push('zero_complaints');
  }
  if (state.tenants.length > 0 && state.tenants.every(t => t.mood >= 60) && state.weekAccumulator >= 7) {
    unlocks.push('happy_week');
  }
  const cinemaCount = getAllCellsOfType(state, 'cinema').length;
  if (cinemaCount >= 1) unlocks.push('first_cinema');
  const spaCount = getAllCellsOfType(state, 'spa').length;
  if (spaCount >= 1) unlocks.push('first_spa');
  const parkCount = getAllCellsOfType(state, 'park').length;
  if (parkCount >= 1) unlocks.push('first_park');
  const expressCount = state.elevators.filter(e => e.kind === 'express').length;
  if (expressCount >= 1) unlocks.push('express_rider');
  const skyLobbyCount = getAllCellsOfType(state, 'skyLobby').length;
  if (skyLobbyCount >= 1) unlocks.push('sky_lobby');
  const subwayCount = getAllCellsOfType(state, 'subway').length;
  if (subwayCount >= 1) unlocks.push('transit_oriented');
  const parkingCount = getAllCellsOfType(state, 'parking').length;
  if (parkingCount >= 5) unlocks.push('land_baron');

  const newUnlocks = [];
  for (const id of unlocks) {
    if (!state.achievementsUnlocked.has(id) && ACHIEVEMENTS[id]) {
      state.achievementsUnlocked.add(id);
      newUnlocks.push(ACHIEVEMENTS[id]);
    }
  }
  return newUnlocks;
}

export function getAchievementById(id) {
  return ACHIEVEMENTS[id] || null;
}
