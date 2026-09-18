// ═══════════════════════════════════════════
//  PATHFINDING — Wippa Sky v2
// ═══════════════════════════════════════════

const TRANSFER_PENALTY = 10;

// ─── Build floor adjacency graph ─────────────────────

export function buildFloorGraph(state) {
  const adj = new Map();

  const ensure = (floor) => {
    if (!adj.has(floor)) adj.set(floor, []);
  };

  for (const shaft of state.elevators) {
    const floors = shaft.floors;
    for (let i = 0; i < floors.length; i++) {
      ensure(floors[i]);
      if (i < floors.length - 1) {
        const a = floors[i];
        const b = floors[i + 1];
        ensure(b);
        const dist = Math.abs(b - a);
        adj.get(a).push({ floor: b, dist, shaftId: shaft.id });
        adj.get(b).push({ floor: a, dist, shaftId: shaft.id });
      }
    }
  }

  return adj;
}

// ─── Find optimal route (direct or via sky lobby) ─────

export function findRoute(state, fromFloor, fromCol, toFloor, toCol) {
  if (fromFloor === toFloor) {
    return [{ floor: fromFloor, col: fromCol, shaftId: null, action: 'alight' }];
  }

  const cacheKey = `${fromFloor}-${fromCol}-${toFloor}-${toCol}`;
  if (state.pathCache.has(cacheKey)) {
    return state.pathCache.get(cacheKey);
  }

  const direct = dijkstra(state, fromFloor, toFloor, fromCol, toCol);
  if (direct) {
    state.pathCache.set(cacheKey, direct);
    return direct;
  }

  const viaSky = findRouteWithSkyLobby(state, fromFloor, fromCol, toFloor, toCol);
  if (viaSky) {
    state.pathCache.set(cacheKey, viaSky);
    return viaSky;
  }

  return null;
}

// ─── Route via sky lobbies ────────────────────────────

export function findRouteWithSkyLobby(state, fromFloor, fromCol, toFloor, toCol) {
  const skyFloors = getSkyLobbyFloors(state);
  if (skyFloors.length === 0) return null;

  let bestRoute = null;
  let bestCost = Infinity;

  for (const skyFloor of skyFloors) {
    const legA = dijkstra(state, fromFloor, skyFloor, fromCol, toCol);
    if (!legA) continue;

    const legB = dijkstra(state, skyFloor, toFloor, toCol, toCol);
    if (!legB) continue;

    const combined = mergeRoutes(legA, legB);
    const cost = routeCost(combined);

    if (cost < bestCost) {
      bestCost = cost;
      bestRoute = combined;
    }
  }

  if (bestRoute) {
    const cacheKey = `${fromFloor}-${fromCol}-${toFloor}-${toCol}`;
    state.pathCache.set(cacheKey, bestRoute);
    return bestRoute;
  }

  return null;
}

// ─── Invalidate cache ─────────────────────────────────

export function invalidatePathCache(state) {
  state.pathCache.clear();
}

// ─── Get all floors reachable from a floor ────────────

export function getAccessibleFloors(state, fromFloor) {
  const visited = new Set();
  const queue = [fromFloor];
  visited.add(fromFloor);

  while (queue.length > 0) {
    const current = queue.shift();

    for (const shaft of state.elevators) {
      if (!shaft.floors.includes(current)) continue;

      for (const neighbor of shaft.floors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
  }

  return [...visited].sort((a, b) => a - b);
}

// ═══════════════════════════════════════════════════════
//  ITINERARY PLANNER (legs for the sim state machine)
//  Returns [{ shaftId, boardFloor, exitFloor, destFloor, isLast }] or null.
//  A shaft can only be boarded/alighted at floors where it has a built cell.
// ═══════════════════════════════════════════════════════

export function planItinerary(state, fromFloor, toFloor, opts = {}) {
  const transferPenalty = opts.transferPenalty ?? TRANSFER_PENALTY;
  const fromCol = opts.fromCol ?? 0;
  if (fromFloor === toFloor) return [];

  const shafts = (state.elevators || []).filter(s => s.floors && s.floors.length > 0);
  if (shafts.length === 0) return null;

  const dist = new Map();
  const prev = new Map();
  const pq = [];
  const keyOf = (floor, shaftId) => `${floor}:${shaftId}`;

  const relax = (floor, shaftId, cost, from) => {
    const k = keyOf(floor, shaftId);
    const existing = dist.get(k);
    if (existing === undefined || cost < existing) {
      dist.set(k, cost);
      prev.set(k, from);
      pq.push({ floor, shaftId, cost });
    }
  };

  // Seed with a small distance-to-shaft bias so the three lobby shafts share
  // the load instead of every sim queueing for the lowest-id shaft.
  for (const s of shafts) {
    if (s.floors.includes(fromFloor)) {
      relax(fromFloor, s.id, Math.abs(s.col - fromCol) * 0.6, null);
    }
  }
  if (pq.length === 0) return null;

  let endNode = null;
  while (pq.length > 0) {
    pq.sort((a, b) => a.cost - b.cost);
    const cur = pq.shift();
    if ((dist.get(keyOf(cur.floor, cur.shaftId)) ?? Infinity) < cur.cost) continue;
    if (cur.floor === toFloor) { endNode = cur; break; }

    const s = shafts.find(x => x.id === cur.shaftId);
    if (!s) continue;

    // ride within this shaft
    for (const f of s.floors) {
      if (f === cur.floor) continue;
      relax(f, s.id, cur.cost + Math.abs(f - cur.floor), { floor: cur.floor, shaftId: cur.shaftId });
    }
    // transfer to another shaft that also serves this floor
    for (const o of shafts) {
      if (o.id === s.id || !o.floors.includes(cur.floor)) continue;
      relax(cur.floor, o.id, cur.cost + transferPenalty, { floor: cur.floor, shaftId: cur.shaftId });
    }
  }

  if (!endNode) return null;

  // reconstruct node chain
  const chain = [];
  let k = keyOf(endNode.floor, endNode.shaftId);
  let guard = 0;
  while (k && guard++ < 10000) {
    const [floor, shaftId] = k.split(':').map(Number);
    chain.unshift({ floor, shaftId });
    const p = prev.get(k);
    k = p ? keyOf(p.floor, p.shaftId) : null;
  }

  // group consecutive nodes on the same shaft into legs
  const legs = [];
  let cur = null;
  for (const node of chain) {
    if (!cur || cur.shaftId !== node.shaftId) {
      cur = { shaftId: node.shaftId, boardFloor: node.floor, exitFloor: node.floor };
      legs.push(cur);
    }
    cur.exitFloor = node.floor;
  }

  return legs.map((l, i) => ({
    shaftId: l.shaftId,
    boardFloor: l.boardFloor,
    exitFloor: l.exitFloor,
    destFloor: i === legs.length - 1 ? toFloor : l.exitFloor,
    isLast: i === legs.length - 1,
  }));
}

// ═══════════════════════════════════════════════════════
//  INTERNAL HELPERS
// ═══════════════════════════════════════════════════════

function getCellAt(state, floor, col) {
  const row = state.grid.get(floor);
  if (!row) return null;
  return row[col] || null;
}

function getSkyLobbyFloors(state) {
  const floors = [];
  for (const [floor] of state.grid) {
    const cell = getCellAt(state, floor, 0);
    if (cell && cell.type === 'skyLobby') {
      floors.push(floor);
    }
  }
  const zero = getCellAt(state, 0, 0);
  if (zero && (zero.type === 'lobby' || zero.type === 'basementLobby')) {
    if (!floors.includes(0)) floors.push(0);
  }
  return floors.sort((a, b) => a - b);
}

function isSkyLobby(state, floor) {
  if (floor === 0) return true;
  const cell = getCellAt(state, floor, 0);
  return !!(cell && cell.type === 'skyLobby');
}

function findShaftCol(state, shaftId) {
  const shaft = state.elevators.find(s => s.id === shaftId);
  return shaft ? shaft.col : null;
}

// ─── Dijkstra single-source shortest path ─────────────

function dijkstra(state, fromFloor, toFloor, fromCol, toCol) {
  if (fromFloor === toFloor) {
    return [{ floor: fromFloor, col: fromCol, shaftId: null, action: 'alight' }];
  }

  // State key is "floor-shaftId" to track per-shaft distances
  const dist = new Map();
  const prev = new Map();
  const visited = new Set();

  // Priority queue: { floor, cost, shaftId }
  const pq = [];

  // Seed from all shafts that serve fromFloor
  for (const shaft of state.elevators) {
    if (!shaft.floors.includes(fromFloor)) continue;
    const key = `${fromFloor}-${shaft.id}`;
    dist.set(key, 0);
    pq.push({ floor: fromFloor, cost: 0, shaftId: shaft.id });
  }

  if (pq.length === 0) return null;

  while (pq.length > 0) {
    pq.sort((a, b) => a.cost - b.cost);
    const { floor: current, cost: currentCost, shaftId } = pq.shift();

    const stateKey = `${current}-${shaftId}`;
    if (visited.has(stateKey)) continue;
    visited.add(stateKey);

    // Reached target
    if (current === toFloor) {
      return reconstructPath(state, prev, current, shaftId, fromFloor, fromCol, toFloor, toCol);
    }

    const shaft = state.elevators.find(s => s.id === shaftId);
    if (!shaft || !shaft.floors.includes(current)) continue;

    // Move to adjacent floors in the same shaft
    for (const neighbor of shaft.floors) {
      const nKey = `${neighbor}-${shaftId}`;
      if (visited.has(nKey)) continue;
      const moveCost = Math.abs(neighbor - current);
      const newCost = currentCost + moveCost;
      const existing = dist.get(nKey);
      if (existing === undefined || newCost < existing) {
        dist.set(nKey, newCost);
        prev.set(nKey, { floor: current, shaftId, cost: currentCost });
        pq.push({ floor: neighbor, cost: newCost, shaftId });
      }
    }

    // Transfer to other shafts at sky lobbies or ground floor
    if (isSkyLobby(state, current) || current === 0) {
      for (const otherShaft of state.elevators) {
        if (otherShaft.id === shaftId) continue;
        if (!otherShaft.floors.includes(current)) continue;
        const tKey = `${current}-${otherShaft.id}`;
        if (visited.has(tKey)) continue;
        const transferCost = currentCost + TRANSFER_PENALTY;
        const existing = dist.get(tKey);
        if (existing === undefined || transferCost < existing) {
          dist.set(tKey, transferCost);
          prev.set(tKey, { floor: current, shaftId, cost: currentCost, isTransfer: true });
          pq.push({ floor: current, cost: transferCost, shaftId: otherShaft.id });
        }
      }
    }
  }

  return null;
}

// ─── Reconstruct path from prev map ───────────────────

function reconstructPath(state, prev, endFloor, endShaftId, fromFloor, fromCol, toFloor, toCol) {
  const steps = [];
  let curFloor = endFloor;
  let curShaftId = endShaftId;

  // Walk backwards from destination
  while (true) {
    const key = `${curFloor}-${curShaftId}`;
    steps.unshift({ floor: curFloor, shaftId: curShaftId });

    const p = prev.get(key);
    if (!p) break;

    // We've reached the origin — add start marker and stop
    if (p.floor === fromFloor && !p.isTransfer) break;

    // If this was a transfer, we stay on the same floor but switch shaft
    if (p.isTransfer) {
      steps.unshift({ floor: p.floor, shaftId: p.shaftId, isTransfer: true });
      curFloor = p.floor;
      curShaftId = p.shaftId;
      continue;
    }

    curFloor = p.floor;
    curShaftId = p.shaftId;
  }

  // Build route objects from the step sequence
  const route = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const next = steps[i + 1];

    if (step.isTransfer) {
      route.push({
        floor: step.floor,
        col: findShaftCol(state, step.shaftId) || fromCol,
        shaftId: step.shaftId,
        action: 'transfer',
      });
      continue;
    }

    if (i === 0) {
      route.push({
        floor: step.floor,
        col: fromCol,
        shaftId: step.shaftId,
        action: 'board',
      });
    } else if (!next || next.isTransfer || next.shaftId !== step.shaftId) {
      route.push({
        floor: step.floor,
        col: findShaftCol(state, step.shaftId) || toCol,
        shaftId: step.shaftId,
        action: 'alight',
      });
    }
  }

  // Ensure final entry reaches destination
  if (route.length === 0) {
    route.push({ floor: fromFloor, col: fromCol, shaftId: null, action: 'board' });
    route.push({ floor: toFloor, col: toCol, shaftId: null, action: 'alight' });
  } else {
    const last = route[route.length - 1];
    if (last.floor !== toFloor) {
      route.push({ floor: toFloor, col: toCol, shaftId: last.shaftId, action: 'alight' });
    } else {
      last.col = toCol;
      last.action = 'alight';
    }
  }

  return route;
}

// ─── Merge two route legs at the sky lobby ────────────

function mergeRoutes(legA, legB) {
  if (!legA || legA.length === 0) return legB;
  if (!legB || legB.length === 0) return legA;

  const merged = [...legA];

  // Skip first step of legB if it's at the same floor as the last of legA
  const startIdx = legB[0].floor === merged[merged.length - 1].floor ? 1 : 0;

  for (let i = startIdx; i < legB.length; i++) {
    const step = legB[i];
    const last = merged[merged.length - 1];

    // Skip if this duplicates the last step
    if (last.floor === step.floor && last.action === step.action) continue;

    merged.push(step);
  }

  return merged;
}

// ─── Route cost (distance + transfer penalty) ─────────

function routeCost(route) {
  if (!route || route.length === 0) return Infinity;

  let distance = 0;
  let transfers = 0;

  for (let i = 1; i < route.length; i++) {
    distance += Math.abs(route[i].floor - route[i - 1].floor);
  }

  for (let i = 1; i < route.length; i++) {
    if (route[i].action === 'transfer' || route[i - 1].action === 'transfer') {
      transfers++;
    }
  }

  // Also count implicit transfers (shaft changes without explicit transfer step)
  for (let i = 1; i < route.length; i++) {
    const prev = route[i - 1];
    const curr = route[i];
    if (prev.shaftId && curr.shaftId && prev.shaftId !== curr.shaftId &&
        prev.action !== 'transfer' && curr.action !== 'transfer') {
      transfers++;
    }
  }

  return distance + transfers * TRANSFER_PENALTY;
}
