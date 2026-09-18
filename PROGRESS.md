# PROGRESS — wippa-sky

### [plan-then-build]
## ✅ Done
- [2026-09-17] Explored the codebase (20 files, ~6.4k LOC). Found the game **did not boot at
  all**: `hud.js`, `sims.js`, `elevators.js` imported `getCell` from `grid.js`, but it lives
  in `state.js` → ES module graph failed → blank canvas. FIXED.
- [2026-09-17] Built a dependency-free headless Chrome (CDP) verification harness at
  `/tmp/opencode/cdp.mjs` (console errors + `window.__wippa` probe + screenshot).
- [2026-09-17] Rebuilt the elevator transport: waiting registry, direction-correct SCAN,
  boarding/alighting, capacity, calls, express stops, car upgrades.
- [2026-09-17] New `planItinerary()` (shaft-graph Dijkstra) → clean ride legs; sims pick the
  nearest shaft so the network shares load.
- [2026-09-17] Rewrote `sims.js`: itinerary state machine + continuous cross-cell walking.
- [2026-09-17] Rewrote `needs.js`: decay, mood, bands, wait/crowd stress, move-outs, vacancy
  + re-letting, per-cell mood→income multipliers.
- [2026-09-17] Real occupancy/staffing from live sims; population = live sim count; net/day.
- [2026-09-17] Fixed build preview (money + support), build particles (world space + decay),
  phantom "glass shell", ground-floor support rule.
- [2026-09-17] Visuals: rooftop + antenna beacon, podium entrance, basement foundation walls,
  passengers in cars, aggregated per-shaft wait badges, mood overlay legend, roof/podium.
- [2026-09-17] HUD: Net/day stat, richer info panel, mood legend wiring.
- [2026-09-17] 38 unit tests (`npm test`) + README rewrite.
- [2026-09-17] Fixed speed-fairness bug (waits were multiplied by game speed twice) and
  save/load stranding sims mid-ride.

## ⏭️ Next
- Express-shaft build tool + sky-lobby tooltips (planner + dispatcher already support them).
- Sprite cache (`js/sprites.js` is still dead code) for 500+ floor towers.
- Balance pass for the rush-hour crush at very tall towers (car count vs. floor count).

## 🧠 Decisions & Gotchas
- Decision: car→sim handoff via `state._simHooks.onAlight` to avoid an import cycle
  (sims → dispatch → sims).
- Decision: fixed 1/60 sub-steps in `stepWorld` so 2×/3× speed can't tunnel cars through floors.
- Gotcha: `state.tick` already includes the speed multiplier — never multiply by speed again
  when measuring elapsed game time.
- Gotcha: Chrome caches ES modules; the CDP harness uses a fresh `--user-data-dir` per run.
- Gotcha: `python3 -m http.server` started from a tool call can be killed on timeout; launched
  with `setsid nohup … &`.

### [plan-then-build] — screenshot assessment follow-up
## ✅ Done
- [2026-09-17] Assessed the desktop screenshot (1920x1080 live play) and found 3 real defects.
- [2026-09-17] **Camera clamp range was inverted** (`minCamY` > `maxCamY`), which forced
  `cameraY=229` at 1080p and shoved the whole tower down behind the toolbar. Rewrote
  `getCameraClamp` (content-extent based, margins for HUD/toolbar) and `handleResize`
  (preserves the centred row). cameraY is now 0 for a short tower; 323 for a 24-floor tower.
- [2026-09-17] **Exterior glow drawn as a hard rectangle** (`fillRect(towerLeft-80, baseY-900z,
  towerW+160, 950z)`), visible as a faint box over the sky. Replaced with a soft radial glow.
  Verified with a canvas pixel scan: sky is now uniform.
- [2026-09-17] **Day-1 net was negative** (−$69) because every cell paid a flat $50 upkeep,
  including free lobby and elevator cells. Replaced with cost-proportional upkeep (lobbies/
  service free, elevator $20, office $50, ...). Starter tower is now ≈ +$300/day.
- [2026-09-17] Wired `autoFollowBuild` so building near the screen edge eases the camera.
- [2026-09-17] Tests 39/39 pass; verified at 1920x1080 (short + 24-floor towers), no errors.

## ⏭️ Next
- Express-shaft build tool; sky-lobby transfer tooltips.
- Consider raising the 3 starting shafts' car count for very tall towers, or auto-hinting.

## 🧠 Decisions & Gotchas
- Gotcha: never build a screen-space rect for a "glow" — hard edges show against the sky.
- Gotcha: any clamp must be validated for `min <= max`; an inverted range silently pins the camera.

### [plan-then-build] — "tower looks like it goes below the road"
## ✅ Done
- [2026-09-17] Confirmed the report. Measured the desktop screenshot: ground line y=797, street
  band y=765-825, tower body y=637-797, but cameraY was 229 -> the tower was drawn at
  y=866-1026, i.e. entirely BELOW the street.
- [2026-09-17] **Root cause (bigger than the clamp):** `render/ground.js` and
  `drawBackgroundCity`/`drawHaze` in `render/sky.js` drew at a FIXED screen position and ignored
  `state.cameraY`, while the tower applied it. So any scroll (or the bad clamp) slid the tower
  through a stationary street -> "the tower goes below the road". Ground, skyline and haze now
  scroll with the world (`baseY = canvasH - GROUND_Y_OFFSET + cameraY`), with an early-out when
  the street is fully off-screen.
- [2026-09-17] Street top moved from `baseY - 32` to `baseY - 2` so the building's feet are flush
  with the road instead of overlapping the ground floor.
- [2026-09-17] **Pre-existing bug found:** `render/tower.js` used
  `lowestRow = -(state.basementDepth || 0)`. `basementDepth` is already negative, so with any
  basement this became POSITIVE and the tower skipped every row below it — basement/lower floors
  never rendered while shafts (`elevators.js`) and sims (`drawSims`) still did, producing
  "floating sims". Fixed to `Math.min(0, state.basementDepth)`.
- [2026-09-17] Re-verified: default view (tower above road), scrolled view with basements
  (parking levels now visible below the road, shafts continuous), 24-floor tower. 39/39 tests.

## 🧠 Decisions & Gotchas
- The ground is part of the world, not a screen-space overlay: it must use cameraY.
- `state.basementDepth` is a NEGATIVE row (or 0). Never negate it to get `lowestRow`.

### [plan-then-build] — ultra-modern tower element graphics
## ✅ Done
- [2026-09-17] Replaced the flat "coloured block" cells with an architectural facade system in
  new `js/render/facade.js`: concrete floor-slab bands, graphite corner columns + mullions,
  glazing with sky reflection + diagonal specular, per-type interiors behind the glass,
  venetian blinds per pane, balconies (residence/hotel), AC units (office), accent LED strips,
  illuminated signage, and warm night interiors with per-type accent lighting.
- [2026-09-17] All cell art is **pre-baked into cached sprites** keyed by
  (type, variant, day/night, pixel size) and blitted — so the detail is free per frame and the
  old per-cell gradient storm is gone. Day↔night crossfades via a new `nightAmount(dayTime)`
  curve in constants.js (replaces the discrete phase alpha).
- [2026-09-17] `render/tower.js` cell body reduced to `blitCell(...)` + mood overlay + hover;
  deleted ~890 lines of the old per-type interior drawing.
- [2026-09-17] Elevator shafts/cars recoloured to match (graphite shaft, brushed-steel car).
- [2026-09-17] Updated `COLORS` to the desaturated architectural palette (minimap follows).
- [2026-09-17] Deleted dead `js/sprites.js` (superseded by facade.js).
- [2026-09-17] Verified day / night / 1.6x zoom at 1920x1080; 39/39 tests pass, no exceptions.
  FPS is identical with an empty vs full tower in headless (15) → that's a headless rAF cap,
  not facade cost.

## ⏭️ Next
- Optional: bake the background skyline to an offscreen canvas (currently redrawn per frame).
- Optional: a couple more facade variants per type (e.g. arched hotel windows, rooftop signage).

### [plan-then-build] — depth & modern rendering (2.5D + atmosphere)
## ✅ Done
- [2026-09-17] Added **2.5D massing** (`js/render/volume.js`): every row's silhouette is extruded
  into a receding SIDE FACE (slab edges wrapping the corner, window slots, per-floor vertical
  falloff) plus a ROOF PLANE with deck joints. Bounded to the player's actual built shape.
- [2026-09-17] Added a **cast shadow across the street + contact occlusion**, direction derived
  from the sun's position (shadow flips as the sun crosses midday).
- [2026-09-17] Added `js/render/post.js`: **sun-following directional light** on the facade,
  **vertical ambient occlusion**, **corner occlusion** where the front meets the side,
  **height-varying sky reflection** on the glazing (bright top → dark base, faint moon sheen at
  night), a **night bloom** (1/6 downsample → additive `screen` upsample), and a
  **wet-street reflection** (mirrored, masked, alpha-scaled by night).
- [2026-09-17] Tower geometry is now globally offset by half the extrusion so the *mass* stays
  optically centred. `SIDE_DX/SIDE_DY/towerShift()` in constants; applied consistently in
  `cellToScreenLocal`, `screenToCell`, `drawTower`, `drawElevatorCar` so rendering, hit-testing,
  shafts and sims all agree.
- [2026-09-17] Added a regression test that `screenToCell` inverts `cellToScreenLocal` at
  zoom 0.75/1/1.6 including the 2.5D offset (would have caught any drift). 40/40 tests pass.
- [2026-09-17] Verified day / 1.35x zoom / night at 1920x1080; no exceptions.

## 🧠 Decisions & Gotchas
- The 2.5D offset must live in ONE place (constants + the two mapping functions); duplicating the
  `towerLeft` formula is what caused the elevator car to mis-align before.
- Bloom/reflection are 2–3 full-canvas `drawImage` ops, gated to night for bloom.

### [plan-then-build] — modern rendering pass (lighting, depth, atmosphere)
## ✅ Done
- [2026-09-17] **Sky crossfade**: replaced the four hard `SKY_COLORS` phases with interpolated
  keyframes (`skyStops`) so the palette blends continuously; sun/moon now fade in/out with smooth
  ramps that meet at 0 on the dawn boundary (no pop). (render/sky.js)
- [2026-09-17] **Parallax city** (new `render/city.js`): two baked layers — far (parallax 0.42,
  `ctx.filter: blur(1.9px)` for depth of field, low contrast = atmospheric perspective) and mid
  (0.72). Each bakes its own downward fill so no gaps at any camera position.
- [2026-09-17] **Rim light** on the silhouette at dawn/dusk (warm) and night (cool) — top edges,
  roof flank and the sun-facing vertical edge. (render/post.js)
- [2026-09-17] **Screen-space finishing**: time-of-day colour grade (`soft-light` warm at
  dawn/dusk, cool at night), **vignette**, and **film grain** (tiled noise pattern, 4% `overlay`).
- [2026-09-17] **Room depth cards** (render/facade.js): inset darker back wall, lit floor plane,
  ceiling + side occlusion, and `propShadow()` contact shadows under desks/sofas/beds/tables.
- [2026-09-17] **Life**: deterministic flickering windows at night, antenna sway, elevator
  **ease-out** near floors (dispatch `step` scaling), car **shadow into the shaft**, UI press states.
- [2026-09-17] 40/40 tests pass; verified day / 1.5x zoom / dusk / night / default at 1920x1080
  with no console exceptions.

## ⏭️ Next (from the art-direction list, not yet done)
- Weather: rain + window streaks, drifting cloud shadows, occasional birds.
- Sim walk cycles beyond the current arm/leg bob.
- Elevator cable sway; door chime timing.
- UI: icon badges with their own gradient, and lowering HUD contrast relative to the building.

### [plan-then-build] — street scene + skyline + interior polish
## ✅ Done
- [2026-09-17] **Rebuilt `render/ground.js`** as a modern urban cross-section: concrete
  sidewalk with expansion joints + tactile paving, kerbs with top highlight and underside
  shadow, a marked multi-lane road (centre dashes with moving offset, edge lines, crosswalk,
  tyre-wear tracks, manholes, road grain, wet sheen that intensifies at night).
- [2026-09-17] **Street furniture**: LED lamp posts with night glow, trees in pits (3 species,
  layered canopies with a sun-side rim light and a pavement contact shadow), bollards, bins,
  planters, hydrants, benches, kerb drains. All deterministic per x-index.
- [2026-09-17] **Vehicles rebuilt as 2.5D**: six types (sedan/hatch/van/taxi/bus/truck) with body
  gradient + specular, glazed greenhouse with a diagonal highlight and pillar, wheel arches,
  hubcaps, contact shadow, taxi roof sign, ribbed truck cargo box, and headlight cones +
  taillights at night.
- [2026-09-17] **Skyline upgrade** (`render/city.js`): richer massing — setbacks, spires with
  beacons, roof boxes, floor bands, per-window variation (lit / cool / dark), and illuminated
  vertical signage at night.
- [2026-09-17] **Interior polish** (`render/facade.js`): suspended ceiling luminaires across
  office/shop/restaurant/lobby/skyLobby/hotel, glazed meeting-room partition in offices, wall TV
  in residences, potted plants, all sitting on the dollhouse room shell.
- [2026-09-17] Reduced road-grain draw count for headroom. 40/40 tests pass; verified day / night
  / 1.5x zoom / default view at 1920x1080, no console exceptions.

## 🧠 Decisions & Gotchas
- Street elements scale with a CLAMPED zoom factor (0.8–1.3) so the pavement never becomes
  oversized at max zoom — a deliberate stylisation, worth revisiting if it reads wrong up close.
- Ground still scrolls 1:1 with the camera (it is world geometry), while the skyline parallaxes.

### [plan-then-build] — 3-cycle code review of the perspective pipeline
## ✅ Done
- [2026-09-18] Ran the requested 3x review→fix→verify cycles on the one-point perspective
  rendering. (User: "Check the desktop screenshot. Find any issues and fix. Do 3 x code and fix
  reviews.") Screenshot itself is unviewable by the model — analysis is static code review +
  numeric verification; findings in `.tmp/agent/perspective-review/REVIEW.md`.
- [2026-09-18] **C1 (13 findings):** perspective.js now returns
  `highest/lowest/towerRight/cols` + inverse helpers; grid.js delegates to the single source of
  truth; input.js hit-tests use perspective inverse; volume side faces/roof + street-level cast
  shadow rebuilt; post lighting clip/rim fixed; tower glass shell/sheen/edge lights/crown/
  particles/motes/plinth fixed; sims use perspective projection.
- [2026-09-18] **C2 (7 findings, incl. 3 CRITICAL):** `vanishY` camera-sign bug (`-cameraY` vs
  orthoY's `+cameraY`) — scrolling inverted the tower top; `rowAtScreenY` returned garbage for
  clicks in floor gaps / above roof (ground click mapped to row 60) — rewrote as binary search on
  cell BOTTOMS + nearest-cell gap snap; grid.js wrapper passed args swapped vs
  `project(col,row)`; basement foundation painted a solid brown wedge over the whole tower → pit
  side walls; volume per-row side faces were 100% occluded → whole-silhouette side bands (O(1));
  street reflection now tracks `baseY + cameraY`.
- [2026-09-18] **C3 (final sweep):** verified render order (sky→ground→tower→shafts→sims→
  atmosphere), camera-clamp sign conventions, ground street line == projection street line,
  elevator car interpolation, particle (col,row) units, facade sprite scaling; noted dead
  orthographic helpers in state.js + facade sprite-cache churn on tall towers (perf only).
- [2026-09-18] Numeric verification (inline scripts, not committed): every row/col inverse
  round-trip x camY in {-300..300}, roof-band clicks clamp to top row, gap samples snap to a
  neighbor row, NaN-free, monotone scales — ALL PASS. 44/44 unit tests, `node --check` clean on
  all js files. Artifacts: `.tmp/agent/perspective-review/{REVIEW,CHANGES,TEST}.md`.
- [2026-09-18] Updated README.md: Rendering section rewritten to describe the shared
  one-point perspective projection (`render/perspective.js` — vanish above the roof, tapering
  floors, growing basements, camera-coupled street, one `project(col,row)` source of truth for
  cells/shafts/sims/hit-testing, gap-snapping inverse); added `perspective.js` and the grid.js
  hit-test wrappers to the architecture tree.
- [2026-09-18] **Screenshot-defect round (5 fixes + docs):** `loadGame()` rewritten **atomic** —
  validates save shape before mutating anything, deserializes grid/elevators/cars/tenants first,
  then derives `highestFloor`/`basementDepth` from the grid (no longer trusts the save's copies);
  a failed load is now a true no-op. Ghost-silhouette render hardening: every
  silhouette-following effect (glow, glass shell, sheen, edge lights, crown, floor labels,
  cast shadow, tower lighting, rim light, podium) is gated on a real built silhouette
  (`rowInfo` / `grid.size > 0`); removed post.js's `|| {left:0,right:cols-1}` full-width
  fallback that lit a ghost. **Fixed a live crash**: tower.js called
  `isProjectedCellVisible` without importing it → `drawTower` threw a ReferenceError every
  frame (pure-logic tests never render, so it shipped unnoticed). Single clock: `dayPhase` was
  only recomputed inside the `speed > 0` branch, so a paused game / fresh load showed a stale
  'Morning' label while the sky drew the real time — now derived from `dayTime` every frame.
  README documents the full toolbar (Sky Lobby $45k, Parking $9k, Service $14k, B.Lobby $6k,
  Subway $80k, elevator $5k/+car $15k, Demolish, CELL TWR $25k, Select).
- [2026-09-18] Verification this round: `node --test test/*.test.js` → **50/50 PASS** (44 +
  3 save-atomicity regressions + 3 NEW render-smoke tests); ghost proof = stale
  `highestFloor=21` + empty grid → 0 silhouette gradients vs 18 for a real 21-floor tower;
  `node --check` clean on all js files.
- [2026-09-18] Gotcha corrected: the user's "stale `highestFloor` survives boot" theory does NOT
  hold on the boot path — main.js calls `initNewGame(true)` whenever `loadGame` returns false,
  and that explicitly re-zeroes `highestFloor`/`basementDepth` (money → 500000). The atomicity
  fix is still correct as an invariant, and the render guards now make a desync harmless.
- [2026-09-18] **Load-atomicity deep dive (audit fallout):** the user's audit found
  `initNewGame` is the one place that never resets `state.grid` — a failed load that had
  already written grid cells (deserializeGrid cleared+wrote the LIVE grid before the risky
  elevator/car/tenant steps) left orphan floors: invisible to the renderer (bounds by
  highestFloor=0), but counted by `getFloorCount`/`getCellCount` and blocking build support
  checks. Fixed BOTH layers: (1) `initNewGame` now does `state.grid.clear()` + `cellTower =
  null` + `totalBuilt = 0`; (2) `loadGame` is now TRULY atomic — all four deserializers are
  pure (`data` → value), everything is built into locals, and a single commit block of
  non-throwing assignments applies them; removed the vestigial `cellTower ||=`/`totalBuilt-1`
  grid-side writes and the dead `getOrCreateRow` helper.
- [2026-09-18] **51/51 PASS** (`node --test test/*.test.js`): added mid-deserialize atomicity
  regression — `elevatorCars: [null]` + `highestFloor: 50` + poisoned cellTower grid entry →
  loadGame false, all 11 sampled state fields byte-identical to pre-load. `node --check` clean
  on all js files. Artifacts updated in `.tmp/agent/perspective-review/{REVIEW,CHANGES,TEST}.md`.

## ⏭️ Next
- Optional manual smoke test in a browser (scroll / tall tower / basement / hover) to confirm
  the numeric guarantees visually.
- Optional: delete dead orthographic `cellToScreen`/`screenToCell` in state.js.
- Express-shaft build tool; sky-lobby transfer tooltips (unchanged backlog).
- Consider raising the 3 starting shafts' car count for very tall towers.

## 🧠 Decisions & Gotchas
- The vanish point must follow the camera the SAME way orthoY does (`+ cameraY`); a sign flip
  inverts the whole tower when scrolling.
- Projected floor cells do NOT tile contiguously (each row shrinks independently toward the
  vanish) — an inverse mapper that assumes tiling returns garbage for clicks in the gaps.
- Keep a single projection source of truth: `createPerspective().project(col, row)` — col FIRST.
  Duplicated/divergent projection code (old grid.js wrapper, old state.js screenToCell) was the
  root cause of elevator/sim/hover misalignment.
