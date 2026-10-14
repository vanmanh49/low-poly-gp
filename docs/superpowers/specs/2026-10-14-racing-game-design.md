# Browser 3D Racing Game — Design Spec

- **Date:** 2026-10-14
- **Status:** Draft, awaiting review
- **Approach:** Three.js rendering + custom arcade physics (no physics engine)

## 1. Intent

### What was asked for
- A 3D racing/driving game that runs in the browser.
- The player races against AI cars and finishes in a position (1st, 2nd, …).
- Arcade handling: grippy, forgiving, easy to drift.

### Assumptions (accepted as defaults)
- Purpose: a fun, shareable, playable game — not a commercial product.
- One closed-loop track, 3 laps, player + 4 AI cars.
- Low-poly visuals generated entirely in code; no downloaded models or textures.
- Keyboard controls only.
- Flow: 3-2-1 countdown → race → results screen → restart.

### Success criteria
1. `npm install && npm run dev` opens a playable game in a desktop browser.
2. A player can complete a full 3-lap race against 4 AI cars and see a results screen with their finishing position.
3. AI cars complete the race without getting stuck, leaving the track, or driving backwards, and finish with a spread of times so the player can realistically win or lose.
4. The game holds a steady 60 fps on a typical laptop (integrated GPU) at 1080p.
5. All simulation logic (track, car, collisions, laps, AI) is covered by unit tests that run without a browser.

## 2. Scope

### In scope (v1)
- One track with a mix of corners: a hairpin, a fast sweeper, a chicane, and a long straight.
- 5 cars: 1 player, 4 AI with distinct colours and skill levels.
- Arcade car model with throttle, brake/reverse, steering, and a handbrake for drifting.
- Track boundaries: road, a grass run-off strip that slows the car, and solid walls beyond it.
- Approximate car-to-car collisions (cars bump and push apart).
- Lap counting with checkpoints, so shortcuts and reverse-crossing the line don't count.
- HUD: position, lap, current lap time, best lap time, speed.
- Countdown, results screen, restart.
- Chase camera.

### Out of scope (v1)
Multiplayer, multiple tracks or a track editor, car selection or upgrades, sound, mobile/touch/gamepad controls, ghost replays, skid marks and particles, settings menu, persistent high scores.

## 3. Tech Stack

| Concern | Choice | Notes |
|---|---|---|
| Rendering | Three.js | Exact version pinned in `package.json` at implementation time |
| Physics | Custom (this spec) | Plain JS, no dependencies |
| Build / dev server | Vite | `npm run dev`, `npm run build` |
| Language | JavaScript (ES modules) | JSDoc types where they help |
| Tests | Vitest | Headless; the sim layer never imports Three.js |
| Browser check | Playwright (dev only) | Smoke test + screenshots during development |

Units throughout: **metres, seconds, radians**. The world is the XZ plane with Y up.

## 4. Architecture

The core rule: **the simulation is pure and knows nothing about rendering.** It takes inputs and a fixed `dt` and produces new state. The render layer reads that state and draws it. This keeps the driving, collision, lap, and AI logic testable in Node and keeps the game deterministic given the same inputs.

```
keyboard ──► input ──┐
                     ▼
              ┌─────────────┐   fixed 60 Hz steps
  ai.js ────► │  world.js   │ ◄── track.js, params.js
              │ (sim state) │
              └──────┬──────┘
                     │ read-only snapshot each frame
          ┌──────────┴──────────┐
          ▼                     ▼
     render/*  (Three.js)    ui/hud.js  (DOM)
```

### Project layout

```
index.html
package.json
vite.config.js
src/
  main.js              game loop, wiring, lifecycle
  sim/
    params.js          all tuning constants in one place
    track.js           spline track: sampling, projection, curvature
    car.js             arcade car model (pure step function)
    collision.js       wall + car-to-car resolution
    race.js            countdown, checkpoints, laps, positions, finish
    ai.js              AI driver: steering + speed control
    world.js           owns all sim state; one step() for everything
    rng.js             small seeded PRNG (mulberry32)
  data/
    track01.js         control points + width for the v1 track
  render/
    scene.js           renderer, lights, sky colour, fog, resize
    trackMesh.js       road ribbon, kerbs, grass, walls, start line, scenery
    carMesh.js         low-poly car built from primitives
    camera.js          chase camera
  ui/
    hud.js             HUD, countdown, results overlay (DOM)
    hud.css
  input/
    keyboard.js        key state → normalised input
tests/
  track.test.js
  car.test.js
  collision.test.js
  race.test.js
  ai.test.js
  world.test.js        full headless races
```

## 5. Components

### 5.1 `track.js` — Track geometry

**Purpose:** Turn a list of control points into a closed, drivable track and answer "where am I on the track?"

- **Input:** `{ points: [[x, z], ...], halfWidth, runoff }` from `data/track01.js`.
- **Construction:** Build a closed centripetal Catmull-Rom spline through the points. Sample it every ~1 m into arrays of position, unit tangent, unit normal (pointing left), cumulative arc length `s`, and signed curvature.
- **API:**
  - `track.length` — total centreline length.
  - `track.sampleAt(s)` → `{ x, z, tangent, normal, curvature }`. `s` wraps modulo length; linear interpolation between samples.
  - `track.project(x, z, hintIndex?)` → `{ s, lateral, index }`. `lateral` is the signed distance from the centreline (positive = left). With a hint, it searches ±20 samples around the hint (O(1) per frame); without one, it does a full scan (used at spawn).
  - `track.maxCurvatureAhead(s, distance)` → the maximum |curvature| in `[s, s + distance]`, used by the AI to brake.
- **Zones by |lateral|:** road `≤ halfWidth` (7 m); grass run-off `≤ halfWidth + runoff` (+4 m); wall beyond that.
- **Target track:** ~1.4 km long, giving laps of ~35–45 s and races of ~2–2.5 min.

### 5.2 `car.js` — Arcade car model

**Purpose:** Advance one car by `dt` given its input. A pure function; no knowledge of the track or other cars.

- **State:** `{ x, z, heading, vForward, vLateral, yawRate, steer, surface }`. Velocity is stored in the car's local frame, which makes grip and drift easy to express.
- **Input:** `{ throttle: -1..1, steer: -1..1, handbrake: boolean }`. Negative throttle brakes, then reverses once the car is nearly stopped.
- **Step (`stepCar(state, input, params, dt) → newState`):**
  1. **Steering:** `steer` moves toward the input at a fixed rate (smooth, not instant). The effective steering angle shrinks as speed rises, so high speed stays stable.
  2. **Longitudinal:** engine force `throttle × accel`, tapering to zero at `maxSpeed` (~50 m/s ≈ 180 km/h); a braking force when throttle opposes motion; quadratic drag plus rolling resistance; reverse is capped at ~10 m/s.
  3. **Yaw:** `yawRate = vForward × tan(steerAngle) / wheelbase` (bicycle model), blended toward its target for smoothness. Heading integrates the yaw rate.
  4. **Grip / drift:** When the car rotates, part of its forward velocity turns into lateral velocity in the new frame. Lateral velocity is then damped toward zero by `grip` each step: high grip snaps straight, low grip slides. The handbrake drops grip to `driftGrip` and adds a little extra yaw, producing a controllable drift. Releasing it restores grip over ~0.3 s.
  5. **Surface:** `surface` (`'road' | 'grass'`) is set by `world.js` from the track projection. On grass, `maxSpeed` is ×0.55, grip ×0.6, and drag rises.
  6. Integrate position from world-frame velocity.
- **Tuning:** All constants live in `params.js` under `car.*`. AI and player share the same physics; AI skill only changes how they drive.

### 5.3 `collision.js` — Walls and car-to-car

Each car is approximated as a circle (radius ~1.3 m) for collisions. This is approximate by design.

- **Walls:** if `|lateral| > halfWidth + runoff − radius`, push the car back along the track normal to the limit. Reflect the velocity component along the normal with restitution 0.3, and apply a 15% speed penalty. Cars can never end a step outside the wall.
- **Car-to-car:** for each pair (5 cars = 10 pairs, so brute force is fine) whose circles overlap, push each car half the overlap apart along the line between their centres. Apply an equal-mass impulse along that normal with restitution 0.4. Velocities are converted between world and local frames as needed.
- **Order per step:** move all cars, then car-to-car, then walls (walls last, so a push can't shove a car through a wall).

### 5.4 `race.js` — Race rules

**State machine:** `countdown` (3 s; cars frozen, inputs ignored) → `racing` → `finished`.

- **Lap counter:** each car has `lap`, starting at `0` because the grid is behind the line. The car's first forward crossing of the start/finish line (s = 0) sets `lap = 1` and starts its lap timer. Each later valid crossing completes the current lap and increments `lap`. A car finishes when it completes lap 3, which is its 4th crossing.
- **Checkpoints:** the track is split into 8 equal sectors by `s`. A car's `nextSector` advances only when it enters the next sector in order. A crossing counts as valid only if all 8 sectors were visited since the previous crossing. Reversing over the line, or cutting across, does not count. The first crossing from the grid needs no sectors.
- **Progress:** for `lap ≥ 1`, `progress = (lap − 1) × length + s`. For `lap = 0` (still behind the line), `progress = s − length`, which is a small negative number. This avoids a jump at the line. Progress is used for live positions.
- **Positions:** finished cars ranked by finish time; unfinished cars ranked by `progress`, descending.
- **Lap times:** each car records every lap time and its best lap.
- **Finish:** when a car completes lap 3, it gets a finish time and switches to AI "cool-down" (it keeps driving at reduced speed). The race enters `finished` once the player finishes. Any AI still racing then has its result estimated from its current pace: remaining distance ÷ its average speed so far. Results are final at that point, so the player never waits.
- **Grid:** 5 cars in a staggered two-wide grid behind the line, 8 m apart. **The player starts last (5th)**, so the race is about overtaking.

### 5.5 `ai.js` — AI drivers

`aiInput(car, raceCar, track, driver, others) → input`, where `driver = { skill: 0..1, lineOffset, aggression }` is fixed per AI at race start from the seeded RNG.

- **Steering:** a pure-pursuit target at `s + lookahead`, with lookahead = 8 m + 0.5 s × speed. The target point sits at `lineOffset` metres lateral from the centreline (each AI has a slightly different line, ±2 m). Steering input is `clamp(angleToTarget × gain, -1, 1)`.
- **Speed:** look ahead over the braking distance for the tightest curvature `k`. Corner speed is `sqrt(maxLateralAccel / k)` (with ~12 m/s² as the lateral-acceleration limit). Target speed is `min(maxSpeed, cornerSpeed) × (0.86 + 0.12 × skill)`. Throttle is proportional to `targetSpeed − currentSpeed`, braking when well above target.
- **Avoidance:** if another car is within 12 m ahead and within 2.5 m laterally, shift this car's line offset toward the more open side (smoothed over ~0.5 s) and ease the throttle slightly.
- **Recovery:** if the AI's speed stays below 2 m/s for 1.5 s during `racing`, it reverses with opposite steering for 1 s, then resumes.
- **No rubber-banding in v1.** The four skills are spread (≈0.55, 0.7, 0.85, 1.0), so lap times differ noticeably and the fastest AI is a real challenge.

### 5.6 `world.js` — Simulation owner

- `createWorld({ track, seed, playerIndex })` builds cars on the grid, AI drivers, and race state.
- `world.step(playerInput, dt)`:
  1. Get AI inputs (and the player's input; inputs are zeroed during countdown).
  2. Project each car onto the track and set `surface`.
  3. `stepCar` for every car.
  4. Resolve collisions.
  5. Re-project each car, update race state (sectors, laps, positions, finish).
- `world.snapshot()` returns read-only data for rendering and the HUD: car poses, steer angle, speed, positions, lap info, race phase, countdown time, and results.
- Deterministic for a given seed and input sequence. Tests rely on this.

### 5.7 Render layer (`render/*`)

- **scene.js:** `WebGLRenderer` with antialiasing. Pixel ratio is capped at 2. A hemisphere light plus one directional "sun" with a 2048 shadow map whose frustum follows the player. Sky-coloured background and matching fog. Handles window resize.
- **trackMesh.js:** built once from the track samples.
  - A road ribbon mesh (dark asphalt with a subtle procedural centre dash via vertex colours or a tiny canvas texture).
  - Red/white kerb strips on corners where |curvature| exceeds a threshold.
  - A large flat grass plane.
  - Low walls (barriers) along both outer edges.
  - A chequered start/finish line from a canvas texture.
  - Scenery: trees and cones as `InstancedMesh`, placed with the seeded RNG outside the walls.
- **carMesh.js:** a body box, cabin, and 4 cylinder wheels, coloured per car. Front wheels turn with `steer`. Wheels spin proportional to speed. The body leans slightly with lateral velocity.
- **camera.js:** a chase camera behind and above the player car. Position and look-at are smoothed with critically damped springs. The camera looks slightly ahead of the car and widens its FOV a little at high speed.
- **Render interpolation:** the renderer blends between the previous and current sim state, using the fixed-step accumulator remainder, so motion is smooth on any display rate.
- **Performance budget:** fewer than 100 draw calls, which instancing makes achievable.

### 5.8 UI (`ui/hud.js`, DOM overlay)

- **HUD:** `POS 3/5`, `LAP 2/3`, current lap time, best lap, speed in km/h.
- **WRONG WAY:** a centred warning shown under the conditions in §6.
- **Countdown:** a large centred "3", "2", "1", "GO!".
- **Results:** a table of position, car name, total time, and best lap, with the player highlighted. Has a "Race again" button; `R` also restarts.
- **Start screen:** the title, controls help, and "Press Enter to start".
- The HUD updates its text only when values change, to avoid needless DOM writes.

### 5.9 Input (`input/keyboard.js`)

| Action | Keys |
|---|---|
| Accelerate | W / ↑ |
| Brake / reverse | S / ↓ |
| Steer | A D / ← → |
| Handbrake (drift) | Space |
| Restart | R |
| Start | Enter |

Digital keys map to `throttle` and `steer` values of −1, 0, or 1. Smoothing happens in the car model's steering rate. Arrow keys and Space call `preventDefault` so the page doesn't scroll. All keys are released when the window loses focus.

### 5.10 `main.js` — Game loop

- Fixed timestep `dt = 1/60` with an accumulator. The frame delta is clamped to 0.25 s, so returning from a background tab doesn't cause a spiral of catch-up steps.
- Each frame: read input, run 0–N sim steps, render with interpolation, update the HUD.
- **Restart:** throw away the world and car meshes and create a fresh world. The track mesh and scene are reused.

## 6. Error Handling and Edge Cases

| Case | Behaviour |
|---|---|
| WebGL unavailable | Show a clear "Your browser doesn't support WebGL" message instead of a blank page |
| Tab hidden / long frame | Frame delta clamped to 0.25 s; sim stays stable |
| Window focus lost | All inputs released (no stuck throttle) |
| Car somehow outside the walls | Wall resolution clamps it back every step (tested invariant) |
| Car stuck (AI) | Recovery manoeuvre (§5.5) |
| Player drives backwards | Laps don't count without the sectors in order; a "WRONG WAY" HUD hint appears if the car moves against the track direction for more than 1 s |
| NaN in sim state | Prevented by clamping divisions (curvature, speed near zero); tests assert finite values over full races |
| Window resize | Renderer and camera aspect updated |

## 7. Testing Strategy

### Unit tests (Vitest, Node, no Three.js)
- **track:**
  - Length is positive and stable.
  - `sampleAt` wraps.
  - `project(sampleAt(s) + normal × d)` returns `≈(s, d)`.
  - Hinted and full-scan projection agree.
  - Curvature sign matches turn direction.
- **car:**
  - Full throttle reaches but never exceeds `maxSpeed`.
  - Coasting slows to a stop.
  - Steering left increases heading in the expected direction.
  - Handbrake during a turn produces noticeably higher `|vLateral|` than a normal turn.
  - Reverse is capped.
  - Grass lowers top speed.
- **collision:**
  - After resolution, no car is beyond the wall limit.
  - Overlapping cars end up non-overlapping.
  - Momentum is roughly conserved in a car-to-car hit.
  - Wall hits reduce speed.
- **race:**
  - The first crossing from the grid starts lap 1 without completing a lap.
  - A lap counts only after all sectors are visited in order.
  - Crossing the line backwards, or forth and back, does not add laps.
  - Positions order correctly by progress.
  - The finish triggers after lap 3.
  - Countdown blocks movement.
- **ai:**
  - On a straight, the AI accelerates.
  - Before a tight corner, the target speed drops.
  - Steering points toward the target.

### Headless race tests (`world.test.js`)
- Run full races with every car (including the player slot) AI-driven, across several seeds. Assert that:
  - All cars finish 3 laps within a time limit.
  - No car is ever outside the walls.
  - No AI is stuck for more than 5 s.
  - All state stays finite.
  - Finishing times are spread (the fastest and slowest AI differ by at least 3 s).
- A determinism check: the same seed and inputs produce an identical final state.

### Browser verification
- A Playwright smoke test:
  - Load the dev server and confirm the canvas renders with no console errors.
  - Press Enter, hold W for a few seconds, and confirm the HUD speed increases.
  - Take a screenshot for visual review.
- A manual playtest checklist: handling feels fun, drift is controllable, AI is beatable but not trivial, the camera isn't nauseating, and frame rate is steady.

## 8. Defaults Chosen (flag any you want changed)
- The player starts last on the grid.
- No AI rubber-banding.
- No sound in v1.
- The race ends for scoring as soon as the player finishes; the remaining AI times are estimated.
- A single chase camera.
- Kilometres per hour for the speed readout.
