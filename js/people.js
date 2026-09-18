// ═══════════════════════════════════════════════════════════════
//  PEOPLE — names and traits (pure data, no imports)
//
//  Traits bias needs decay and destination choice so the population
//  develops habits instead of behaving as one homogeneous block.
// ═══════════════════════════════════════════════════════════════

const FIRST = [
  'Ava', 'Marco', 'Yuki', 'Nadia', 'Theo', 'Priya', 'Omar', 'Lena', 'Kai', 'Sofia',
  'Idris', 'Mei', 'Jonas', 'Amara', 'Felix', 'Rosa', 'Dmitri', 'Chiara', 'Noah', 'Zara',
  'Hugo', 'Ines', 'Ravi', 'Elsa', 'Tariq', 'Nora', 'Sven', 'Anya', 'Miles', 'Leila',
];
const LAST = [
  'Chen', 'Rossi', 'Tanaka', 'Haddad', 'Novak', 'Kapoor', 'Farouk', 'Berg', 'Silva', 'Moreau',
  'Okafor', 'Lindqvist', 'Osei', 'Marchetti', 'Vance', 'Duarte', 'Nakamura', 'Kowalski',
  'Mensah', 'Ibarra', 'Petrov', 'Bianchi', 'Sato', 'Larsen',
];

// needs multipliers: >1 means the need drains faster
export const TRAITS = {
  workaholic: { icon: '🏢', label: 'workaholic', needs: { work: 0.55, energy: 1.15 }, prefer: ['office'] },
  foodie:     { icon: '🍜', label: 'foodie',     needs: { food: 1.35 },                   prefer: ['restaurant'] },
  fitness:    { icon: '🏃', label: 'fitness fanatic', needs: { leisure: 1.30 },            prefer: ['park', 'spa'] },
  nightowl:   { icon: '🌙', label: 'night owl',  needs: { energy: 0.85, leisure: 1.15 },   prefer: ['cinema'] },
  socialite:  { icon: '🥂', label: 'socialite',  needs: { leisure: 1.15, food: 1.10 },     prefer: ['skyLobby', 'restaurant', 'shop'] },
  homebody:   { icon: '🏠', label: 'homebody',   needs: { energy: 0.80, leisure: 0.85 },   prefer: ['residence', 'hotel'] },
};

const TRAIT_IDS = Object.keys(TRAITS);

export function makePerson(rand) {
  const f = FIRST[Math.floor(rand() * FIRST.length)];
  const l = LAST[Math.floor(rand() * LAST.length)];
  const trait = TRAIT_IDS[Math.floor(rand() * TRAIT_IDS.length)];
  return { name: `${f} ${l}`, trait };
}

export function traitOf(id) { return TRAITS[id] || null; }

export function needMult(traitId, need) {
  const t = TRAITS[traitId];
  if (!t || !t.needs) return 1;
  return t.needs[need] != null ? t.needs[need] : 1;
}

export function prefers(traitId, type) {
  const t = TRAITS[traitId];
  if (!t || !t.prefer) return false;
  return t.prefer.indexOf(type) !== -1;
}
