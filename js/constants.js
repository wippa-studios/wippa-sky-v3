// ═══════════════════════════════════════════
//  CONSTANTS — Wippa Sky v2
// ═══════════════════════════════════════════

export const MAX_FLOORS_ABOVE = 512;
export const MAX_BASEMENTS = 8;
export const DEFAULT_COLS = 9;
export const CELL_W = 80;
export const CELL_H = 40;
// 2.5D extrusion of the tower mass (screen px at zoom 1): the visible side face
// and roof plane. The front elevation is nudged left by half of SIDE_DX so the
// whole mass stays optically centred.
export const SIDE_DX = 34;
export const SIDE_DY = 20;
export function towerShift(zoom) { return -(SIDE_DX * zoom) / 2; }
export const GROUND_Y_OFFSET = 140;
export const ELEVATOR_SPEED = 4.0;
export const ELEVATOR_CAPACITY = 8;
export const EXPRESS_CAPACITY = 12;
export const EXPRESS_SPEED_MULT = 2;
export const STANDARD_SHAFT_MAX_SPAN = 30;
export const EXPRESS_SHAFT_MAX_SPAN = 120;
export const SKY_LOBBY_COST = 45000;
export const CAR_UPGRADE_COST = 15000;
export const MAX_CARS_PER_SHAFT = 999;
export const DAY_LENGTH_SECONDS = 90;
export const DAY_PHASES = { DAWN: 0.15, DAY: 0.5, DUSK: 0.7, NIGHT: 1.0 };
export const MOOD_CONTENT = 70;
export const MOOD_ANNYED = 40;
export const MOOD_ANGRY = 25;
export const MOOD_FURIOUS = 15;
export const ELEVATOR_WAIT_STRESS_START = 10;
export const ELEVATOR_WAIT_STRESS_RATE = 0.5;
export const FURIOUS_DAYS_BEFORE_MOVEOUT = 2;
export const RELET_MIN_RATING = 3;
export const RELET_DAYS = 3;
export const BANKRUPTCY_GRACE_DAYS = 3;
export const BANKRUPTCY_LOAN = 200000;
export const BANKRUPTCY_RATING_PENALTY = 1;
export const SUBWAY_UNLOCK_POP = 500;
export const SUBWAY_VISITOR_MULT = 1.5;
export const SUBWAY_INCOME = 500;
export const PARKING_DEMAND_BONUS = 0.04;
export const SERVICE_EXPENSE_REDUCTION = 0.08;
export const MAX_SERVICES = 3;
export const DEEP_RETAIL_MOOD_PENALTY = 2;
export const DIG_COST_BASE = 2500;
export const DIG_COST_PER_DEPTH = 600;
export const LAND_PURCHASE = [
  { addCols: 3, cost: 400000, minRating: 2 },
  { addCols: 3, cost: 1500000, minRating: 3 },
  { addCols: 3, cost: 6000000, minRating: 4 },
  { addCols: 3, cost: 20000000, minRating: 5 },
];

export const COLORS = {
  // Desaturated "architectural" accents per floor type (used by the minimap and
  // any fallback rendering). The facade renderer has its own richer palette.
  building: {
    office: '#5b7fa6', residence: '#a5805c', hotel: '#b89b5e',
    shop: '#a86a80', restaurant: '#a56a56', cinema: '#6f66a8',
    spa: '#4f9b96', park: '#5d9b6a', elevator: '#394557', lobby: '#7a8894',
    parking: '#6b7480', service: '#6e7278', basementLobby: '#6b7480', subway: '#4a7fa8',
    skyLobby: '#b89b5e',
  },
  buildingLight: {
    office: '#7d9dc0', residence: '#c19a74', hotel: '#d0b578',
    shop: '#c08499', restaurant: '#bd8471', cinema: '#8b82c2',
    spa: '#6fb8b3', park: '#7cb889', elevator: '#556377', lobby: '#96a2ad',
    parking: '#87909b', service: '#8b8f95', basementLobby: '#87909b', subway: '#6ba0c6',
    skyLobby: '#d0b578',
  },
  buildingDark: {
    office: '#3d5875', residence: '#7d5f42', hotel: '#8a7444',
    shop: '#7d4d60', restaurant: '#7c4d3e', cinema: '#4f4880',
    spa: '#397170', park: '#427350', elevator: '#28313f', lobby: '#5a6672',
    parking: '#4e555e', service: '#51555a', basementLobby: '#4e555e', subway: '#356080',
    skyLobby: '#8a7444',
  },
  mood: {
    content: '#4ade80',
    annoyed: '#fbbf24',
    angry: '#f87171',
    furious: '#ef4444',
  },
  soil: ['#3d2914', '#4a3520', '#5a4530', '#2d1f0f'],
};

// Smooth 0 (full day) .. 1 (full night) curve from the 0..1 day clock.
export function nightAmount(dayTime) {
  const ss = x => {
    x = Math.max(0, Math.min(1, x));
    return x * x * (3 - 2 * x);
  };
  if (dayTime < 0.15) return 1 - ss(dayTime / 0.15);      // dawn
  if (dayTime < 0.52) return 0;                           // day
  if (dayTime < 0.70) return ss((dayTime - 0.52) / 0.18); // dusk
  return 1;                                               // night
}

export const FLOOR_TYPES = {
  office:      { name: 'Office',      cost: 10000,  income: 200,  popAdd: 0,  satisfaction: 2,  residents: false, icon: '🏢', capacity: 5,  staffCapacity: 5 },
  residence:   { name: 'Residence',   cost: 15000,  income: 50,   popAdd: 4,  satisfaction: 5,  residents: true,  icon: '🏠', capacity: 4,  staffCapacity: 0 },
  hotel:       { name: 'Hotel',       cost: 20000,  income: 300,  popAdd: 0,  satisfaction: 3,  residents: true,  icon: '🏬', capacity: 2,  staffCapacity: 0 },
  shop:        { name: 'Shop',        cost: 8000,   income: 150,  popAdd: 0,  satisfaction: 4,  residents: false, icon: '🛒', capacity: 3,  staffCapacity: 2 },
  restaurant:  { name: 'Restaurant',  cost: 12000,  income: 250,  popAdd: 0,  satisfaction: 6,  residents: false, icon: '🍴', capacity: 4,  staffCapacity: 2 },
  cinema:      { name: 'Cinema',      cost: 25000,  income: 400,  popAdd: 0,  satisfaction: 8,  residents: false, icon: '🎬', capacity: 8,  staffCapacity: 2 },
  park:        { name: 'Sky Park',    cost: 18000,  income: 30,   popAdd: 0,  satisfaction: 10, residents: false, icon: '🌳', capacity: 12, staffCapacity: 0 },
  spa:         { name: 'Spa',         cost: 22000,  income: 350,  popAdd: 0,  satisfaction: 7,  residents: false, icon: '💆', capacity: 2,  staffCapacity: 1 },
  elevator:    { name: 'Elevator',    cost: 5000,   income: 0,    popAdd: 0,  satisfaction: 0,  residents: false, icon: '🔼', capacity: 0,  staffCapacity: 0 },
  lobby:       { name: 'Lobby',       cost: 0,      income: 0,    popAdd: 0,  satisfaction: 0,  residents: false, icon: '🚪', capacity: 0,  staffCapacity: 0 },
  skyLobby:    { name: 'Sky Lobby',   cost: 45000,  income: 50,   popAdd: 0,  satisfaction: 2,  residents: false, icon: '☁️', capacity: 20, staffCapacity: 2 },
  parking:     { name: 'Parking',     cost: 9000,   income: 120,  popAdd: 0,  satisfaction: 1,  residents: false, icon: '🅿️', capacity: 8,  staffCapacity: 0 },
  service:     { name: 'Service',     cost: 14000,  income: 0,    popAdd: 0,  satisfaction: 0,  residents: false, icon: '⚙️', capacity: 0,  staffCapacity: 2 },
  basementLobby: { name: 'B. Lobby',  cost: 6000,   income: 0,    popAdd: 0,  satisfaction: 0,  residents: false, icon: '🚪', capacity: 0,  staffCapacity: 0 },
  subway:      { name: 'Subway',      cost: 80000,  income: 500,  popAdd: 0,  satisfaction: 3,  residents: false, icon: '🚇', capacity: 40, staffCapacity: 2 },
};

export const CELL_TOWER_MIN_FLOOR = 40;
export const CELL_TOWER_COST = 25000;

export const LAND_PURCHASE_DEFAULT = 0;

export function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
