# Wippa Sky

A modern tower builder inspired by SimTower — offices, apartments, hotels, shops,
cinemas, spas, sky parks and a real working elevator network, all rendered with
HTML5 Canvas and vanilla ES modules. No frameworks, no dependencies.

> **Serve it over HTTP.** ES modules do not load from `file://`.
> ```bash
> ./launch.sh          # http://localhost:3001
> npm start            # same, via python3
> ```

## What makes it tick

### Elevators that actually work
Cars are driven by a **SCAN (collective control)** dispatcher. Sims walk to a
shaft, press a call, queue (with live wait badges), board when a car going their
way arrives, ride, and alight — nobody teleports.
- A shaft only serves floors where you have **built shaft cells**, so you must
  extend elevators to every floor you want connected. This is the core puzzle.
- Cars carry up to 8 (12 on express shafts), animate doors, and show passengers.
- Route planning (`planItinerary`) finds direct rides or multi-shaft transfers at
  shared floors, and sims pick the **nearest** shaft so your network shares load.
- No route? The sim complains, gets stressed, and eventually leaves.

### Sims with moods and consequences
Four tenant kinds — residents, workers, hotel guests, visitors — with `energy`,
`food`, `leisure` and `work` needs that decay over the day.
- Mood bands: **content** (≥70, 1.15× income), annoyed, **angry** (0.7×), furious (0.4×).
- Long elevator waits, crowding and no-route trips add stress.
- Furious tenants leave after two days: residents move out (cells show **VACANT**),
  workers quit, and unhappy floors earn less. Vacancies re-let when your rating recovers.
- A complaint ledger feeds the weekly report card.

### Feedback everywhere
- HUD: funds, **net/day**, population, floors, happiness, rating.
- Live **wait-time badges** next to crowded shafts.
- Mood overlay (`H`) tints every floor green→red.
- Click any cell for assigned vs. present occupancy, staffing, mood, income and waits.
- Event log + toasts for complaints, move-ins/outs, and daily income/expenses.

### World
Day/night cycle with dawn, aurora, stars and traffic. Build upward and dig
downward (B1–B8) into a soil cross-section with parking, service floors, basement
lobbies and a subway. Rooftop cellular tower (unlocks at 41+ floors),
podium entrance, construction crane, save/load to `localStorage`, achievements,
and a weekly report.

### Rendering
Everything is drawn through one shared **one-point perspective** projection
(`render/perspective.js`): a vanishing point above the roof, floors tapering as
they rise, basements scaling up toward the viewer, and the street scrolling with
the camera. A single source of truth, `project(col, row)`, positions the facade
cells, elevator shafts and cars, walking sims, and the hover/build hit-testing —
so what you see, what rides what, and where you click always agree (the inverse
mapper even snaps clicks in the gaps between floors to the nearest cell). On that
base: a baked curtain-wall elevation with dollhouse interiors, a receding side
face and finite roof plane that follow the built silhouette, a cast street
shadow, sun-tracking directional light, ambient occlusion, and height-varying sky
reflection in the glass. Plus a smooth sky crossfade, a two-layer parallax
skyline (the far layer blurred for depth of field), rim light at dawn/dusk, a
night bloom, a wet-street reflection, a time-of-day colour grade, vignette and
film grain. Cells are pre-baked sprites (`render/facade.js`) so the detail costs
nothing per frame.

## Controls

| Input | Action |
|-------|--------|
| `1`–`8` | Building tools |
| `E` | Elevator shaft |
| `D` / `Del` | Demolish |
| `S` | Select / inspect |
| `H` | Toggle mood overlay |
| `Space` | Pause |
| `↑`/`↓`, `PgUp`/`PgDn` | Scroll · `Home`/`End` jump to ground/top |
| `Ctrl`/`Cmd` + wheel | Zoom |
| Left drag (Select) / right or middle drag | Pan |
| Wheel | Scroll |

### Build tools
The toolbar holds every tool. Only the first group (`1`–`8`), the elevator (`E`),
demolish (`D`), select (`S`) and the mood overlay (`H`) have shortcuts — the
specialist builds below are click-to-select.

| Tool | Cost | Notes |
|------|------|-------|
| Office · Living · Hotel · Shop · Dining · Cinema · Park · Spa | $8k–$25k | keys `1`–`8` |
| Elevator | $5k shaft · $15k extra car | `E` — extend shafts to every floor you want served |
| Demolish | 30% refund | `D` / `Del` |
| Select | — | `S` — inspect any cell |
| Sky Lobby | $45k | mid-tower transfer lobby for multi-shaft journeys |
| Parking | $9k | basement parking |
| Service | $14k | service level |
| B.Lobby | $6k | basement lobby |
| Subway | $80k | deep transit, activates below B5 |
| CELL TWR | $25k | rooftop antenna, unlocks at 41+ floors — one-off install, no upkeep |

## Architecture

```
index.html            HTML + CSS shell
js/
  constants.js        Config: costs, capacities, colours, floor types
  state.js            Game state + grid accessors
  grid.js             Build/demolish, support rules, dig costs, perspective hit-test wrappers
  pathfind.js         planItinerary (shaft-graph Dijkstra)
  dispatch.js         SCAN elevator dispatch, boarding, calls
  elevators.js        Shaft, car and waiting-crowd rendering
  sims.js             Tenant creation, trip state machine, walking
  needs.js            Needs decay, mood, consequences, re-letting
  economy.js          Income, expenses, demand, rating, bankruptcy
  camera.js input.js hud.js achievements.js save.js
  render/             perspective.js · sky.js · city.js · ground.js · facade.js · volume.js · post.js · tower.js · minimap.js
test/                 node --test unit tests (pure logic)
```

## Tests

```bash
npm test    # node --test test/*.test.js  (no dependencies)
```

Covers grid support/dig rules, the SCAN dispatcher (boarding, capacity, calls,
reversal), itinerary planning (direct, transfer, no-route), mood/needs bands and
the economy (income, expenses, rating, bankruptcy).

## License

ISC
