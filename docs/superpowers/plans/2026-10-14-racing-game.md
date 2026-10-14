# Browser 3D Racing Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser racing game: one track, 3 laps, the player against 4 AI cars, arcade handling, and HUD and results screens.

**Architecture:** A pure, deterministic simulation in `src/sim/` (track spline, car model, collisions, race rules, AI) advanced at a fixed 60 Hz by `world.js`. It has no Three.js imports and is fully unit-tested in Node. A Three.js render layer and a DOM HUD read `world.snapshot()` each frame, interpolating between sim steps.

**Tech Stack:** Node 24, Vite 8.3.4, Three.js 0.186.1, Vitest 5.0.4, JavaScript ES modules. Browser verification uses the Playwright MCP browser tools rather than an `@playwright/test` dependency.

**Spec:** `docs/superpowers/specs/2026-10-14-racing-game-design.md`

**Git:** The project folder is not a git repository and the user hasn't asked for commits, so each task ends with a test-suite checkpoint instead of a commit.

## Global Constraints

- Units are metres, seconds and radians. The world is the XZ plane with Y up.
- **Heading convention:** forward = `(sin h, cos h)` and left = `(cos h, −sin h)`. Increasing `h` turns left. Positive `steer` = left. Positive `lateral` = left of the centreline. Positive curvature = a left turn. Three.js `object.rotation.y = h` matches this.
- Nothing in `src/sim/**` imports `three` or touches the DOM.
- Sim timestep `dt = 1/60`. The frame delta is clamped to 0.25 s.
- Track: `halfWidth` 7 m, `runoff` 4 m, so the wall is at |lateral| 11 m. Car collision radius 1.3 m. Length 1.2–1.6 km.
- Cars: `maxSpeed` 50 m/s, reverse cap 10 m/s. On grass: max speed ×0.55, grip ×0.6, more drag.
- Race: 3 laps, 8 sectors, 3 s countdown, 5 cars. The player is at index 4 and starts last. Grid spacing is 8 m.
- AI skills are `[1.0, 0.85, 0.7, 0.55]` for car indices 0–3. Line offsets are ±2 m from the seeded RNG. No rubber-banding.
- Wall restitution 0.3 with a 15% speed penalty. Car-to-car restitution 0.4.
- Pin exact dependency versions (no `^`).

## Review Focus

1. **Window loses focus while a key is held.** Expected: the car stops accelerating (no stuck throttle). Test: Task 8 `releases all keys on blur`.
2. **Returning to a tab after minutes in the background.** Expected: the game resumes normally, with no freeze or teleport. Test: Task 8 `advance clamps a huge frame delta`.
3. **The player reverses away from the grid at the start.** Expected: no lap is credited, the car ranks last, and WRONG WAY shows. Test: Task 5 `reversing from the grid never credits a lap`.
4. **An AI car gets pinned against a wall or another car.** Expected: it backs out and rejoins. Test: Task 6 `recovers when stuck`.
5. **Pressing R mid-race or during the countdown.** Expected: a clean new race, with no duplicate meshes and no second game loop. Test: Task 10, browser step that counts `scene.children` before and after restart.

---

### Task 1: Project scaffold, RNG, params

**Files:**
- Create: `package.json`, `vite.config.js`, `index.html`, `src/sim/rng.js`, `src/sim/params.js`, `src/data/cars.js`
- Test: `tests/rng.test.js`

**Interfaces:**
- Produces:
  - `createRng(seed: number) → () => number`, a mulberry32 generator returning values in [0, 1).
  - `PARAMS`: the tuning object below.
  - `CARS: {name, color}[]`, with length 5 and the player at index 4.

- [ ] **Step 1: Write `package.json`.** Dependency `three@0.186.1`. Dev dependencies `vite@8.3.4` and `vitest@5.0.4`. Scripts: `"dev": "vite"`, `"build": "vite build"`, `"test": "vitest run"`. Set `"type": "module"`. `vite.config.js` sets `test: { environment: 'node', include: ['tests/**/*.test.js'] }`. `index.html` contains `<div id="app"></div>` and `<script type="module" src="/src/main.js">`. Create `src/main.js` as an empty placeholder for now.
- [ ] **Step 2: Run `npm install`.** Expected: it completes, and `node_modules/three` exists.
- [ ] **Step 3: Write the failing test `tests/rng.test.js`.**

```js
import { createRng } from '../src/sim/rng.js';
test('same seed gives same sequence', () => {
  const a = createRng(42), b = createRng(42);
  for (let i = 0; i < 100; i++) expect(a()).toBe(b());
});
test('values are in [0,1) and seeds differ', () => {
  const r = createRng(1), q = createRng(2);
  let same = 0;
  for (let i = 0; i < 1000; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); if (v === q()) same++; }
  expect(same).toBeLessThan(5);
});
```

- [ ] **Step 4: Run `npx vitest run tests/rng.test.js`.** Expected: FAIL (module not found).
- [ ] **Step 5: Implement `createRng`** (mulberry32). Write `params.js` with exactly these keys, so later tasks share the names:

```js
export const PARAMS = {
  dt: 1 / 60, laps: 3, sectors: 8, countdown: 3, playerIndex: 4,
  track: { halfWidth: 7, runoff: 4 },
  car: { maxSpeed: 50, reverseMax: 10, accel: 16, brake: 30, drag: 0.004, rolling: 0.5,
         wheelbase: 2.6, maxSteer: 0.55, steerRate: 4, highSpeedSteer: 0.35,
         grip: 9, driftGrip: 1.4, driftYaw: 0.5, gripRecovery: 0.3, radius: 1.3,
         grass: { speedMul: 0.55, gripMul: 0.6, dragMul: 4 } },
  collision: { wallRestitution: 0.3, wallSpeedPenalty: 0.15, carRestitution: 0.4 },
  ai: { skills: [1.0, 0.85, 0.7, 0.55], autopilotSkill: 0.85, lineOffsetMax: 2,
        lookaheadBase: 8, lookaheadTime: 0.5, steerGain: 2.5, maxLatAccel: 12, brakeDecel: 22,
        avoidAhead: 12, avoidLateral: 2.5, avoidShift: 3, stuckSpeed: 2, stuckTime: 1.5,
        recoverTime: 1, cooldownSpeed: 0.5 },
  grid: { spacing: 8, lateral: 3 },
};
```

  `cars.js`: names `Blaze`, `Viper`, `Nova`, `Rook`, `You`. Colours `#e63946`, `#f4a261`, `#2a9d8f`, `#7b2cbf`, `#ffd60a`.
- [ ] **Step 6: Checkpoint.** Run `npm test`. Expected: 2 passed.

---

### Task 2: Track geometry + v1 track

**Files:**
- Create: `src/sim/track.js`, `src/data/track01.js`
- Test: `tests/track.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `createTrack({ points: [x,z][], halfWidth, runoff }) → Track`, where:
  - `Track = { length, halfWidth, runoff, wallLimit, count, xs, zs, txs, tzs, curv: Float64Array, ss: Float64Array, sampleAt(s), project(x, z, hint?), maxCurvatureAhead(s, dist) }`
  - `sampleAt(s) → { x, z, tx, tz, nx, nz, curvature }`, where `(nx, nz) = (tz, −tx)` (left) and `s` wraps.
  - `project(x, z, hint?) → { s, lateral, index }`
  - `maxCurvatureAhead(s, dist) → number` (the maximum |curvature|)
  - `TRACK01 = { points, halfWidth: 7, runoff: 4 }`

- [ ] **Step 1: Write the failing tests.** Use a circle fixture: `points = 32 × [100·sin a, 100·cos a]` for ascending `a`, which is a left-turning loop.
  - `circle length ≈ 2π·100 within 1%`
  - `circle curvature ≈ +0.01 within 5% at 10 random s`
  - `sampleAt wraps`: `sampleAt(L + 5).x ≈ sampleAt(5).x`
  - `project round-trips`: for s ∈ {0, 123.4, L − 0.5} and d ∈ {−9, 0, 6}, project `sample + n·d`. Expect `s` within 0.5 (wrap-aware) and `lateral` within 0.1 of d.
  - `hinted project agrees with full scan` at 50 random on-track points, giving the hint as the true index ± 5.
  - `maxCurvatureAhead on circle ≈ 0.01`
  - TRACK01 tests:
    - `TRACK01 length in [1200, 1600]`
    - `TRACK01 min radius ≥ 15 m` (1/max|curv|)
    - `TRACK01 has a hairpin`: max |curv| ≥ 1/30
    - `TRACK01 has a straight ≥ 150 m with |curv| < 0.002`
    - `TRACK01 does not overlap itself`: for samples more than 60 m apart along the track (wrap-aware), the Euclidean distance is greater than `2·wallLimit + 4`.
- [ ] **Step 2: Run `npx vitest run tests/track.test.js`.** Expected: FAIL.
- [ ] **Step 3: Implement `createTrack`.**
  - Build a closed centripetal Catmull-Rom spline (alpha 0.5). Densely sample it (≥ 20 sub-steps per span) to measure arc length, then resample at ~1 m spacing.
  - Tangent: normalised central difference.
  - Curvature: `dθ/ds`, where `θ = atan2(tx, tz)` unwrapped, by central difference, then smoothed with a 5-sample moving average.
  - `project`: find the nearest sample (with a hint, search ±20 indices with wrap; otherwise scan all). Then project onto the better of the two adjacent segments to get a fractional `s`. `lateral = dot(p − foot, n)`.
- [ ] **Step 4: Design `TRACK01` control points** (~14–20 points) so that the TRACK01 tests pass. Include:
  - a long start straight;
  - a hairpin (radius ~22–30 m);
  - a fast sweeper;
  - an S-chicane.
  - Place s = 0 (the first point) partway down the main straight, at least 60 m after the preceding corner, so the grid sits on the straight.
- [ ] **Step 5: Run the track tests.** Expected: all pass.
- [ ] **Step 6: Checkpoint.** Run `npm test`. Expected: all green.

---

### Task 3: Arcade car model

**Files:**
- Create: `src/sim/car.js`
- Test: `tests/car.test.js`

**Interfaces:**
- Consumes: `PARAMS.car`.
- Produces:
  - `createCar({ x, z, heading }) → Car`, where `Car = { x, z, heading, vForward, vLateral, yawRate, steer, gripNow, surface: 'road'|'grass' }` and `gripNow` is in [0, 1] (1 = full grip, 0 = drift grip).
  - `stepCar(car, input, p, dt) → Car`: returns a new object and never mutates its input. `input = { throttle, steer, handbrake }`.
  - `worldVelocity(car) → { vx, vz }`
  - `setWorldVelocity(car, vx, vz)`: mutates the car, re-expressing the velocity in local components.
  - `speedOf(car) → number`

- [ ] **Step 1: Write the failing tests.** Use `p = PARAMS.car` and `dt = 1/60`, and freeze the input car with `Object.freeze` to prove purity.
  - `does not mutate input`
  - `reaches 100 km/h within 4 s`: `vForward ≥ 27.8` by t = 4.
  - `never exceeds maxSpeed`: over 30 s of full throttle, max `vForward ≤ 50 + 1e-6`, and the final value is ≥ 47.5.
  - `coasts to a stop without rolling back`: from 30 m/s with throttle 0 for 40 s, `vForward` ends < 0.5 and is never < 0.
  - `brakes from 40 m/s to < 1 m/s within 2.5 s`
  - `reverse is capped`: after 10 s at throttle −1 from rest, −10 − 1e-6 ≤ vForward < −5.
  - `steer left turns left`: at 20 m/s with steer +1 for 1 s, heading > 0.3 and x > 0.
  - `handbrake drifts`: at 25 m/s with steer +1 for 1 s, the max |vLateral| with the handbrake is more than 2× the max without it.
  - `grass caps speed`: with `surface: 'grass'` and 30 s of full throttle, the final speed is ≤ 0.55 × 50 + 0.5.
  - `worldVelocity/setWorldVelocity round-trip` at heading 1.0.
- [ ] **Step 2: Run `npx vitest run tests/car.test.js`.** Expected: FAIL.
- [ ] **Step 3: Implement `stepCar`.** Follow this order (spec §5.2):

```
steer      → moves toward input.steer at p.steerRate/s
steerAngle = steer · maxSteer · lerp(1, highSpeedSteer, |vF|/maxSpeed)
gripTarget = handbrake ? 0 : 1; gripNow moves toward it at 1/gripRecovery per second
grip       = lerp(driftGrip, grip, gripNow) · (grass ? gripMul : 1)
vmax       = maxSpeed · (grass ? speedMul : 1)
longitudinal:
  throttle > 0 & vF ≥ 0  → +accel·throttle·max(0, 1 − vF/vmax)
  throttle < 0 & vF > 0.5 → −brake·|throttle|
  throttle < 0 & vF ≤ 0.5 → reverse accel toward −reverseMax (scaled like forward)
  throttle > 0 & vF < 0   → +brake·throttle
  minus drag·vF·|vF|·(grass ? dragMul : 1) and rolling·sign(vF), never crossing zero from rolling/drag alone
yawTarget  = vF·tan(steerAngle)/wheelbase + (handbrake ? driftYaw·steer·min(1,|vF|/20) : 0)
yawRate    → blend toward yawTarget (factor 1 − e^(−10·dt))
dθ = yawRate·dt; heading += dθ
rotate (vF, vL) into the new frame: vF' = vF·cos dθ + vL·sin dθ; vL' = −vF·sin dθ + vL·cos dθ
vL' *= e^(−grip·dt)
position += (vF'·fwd + vL'·left)·dt
```

- [ ] **Step 4: Run the car tests.** Expected: all pass. If a feel threshold fails, tune `PARAMS.car`; don't loosen the test.
- [ ] **Step 5: Checkpoint.** Run `npm test`. Expected: all green.

---

### Task 4: Collisions

**Files:**
- Create: `src/sim/collision.js`
- Test: `tests/collision.test.js`

**Interfaces:**
- Consumes: `Track.sampleAt`, `Track.project`, `Track.wallLimit`, `setWorldVelocity` and `worldVelocity` from Task 3, `PARAMS.collision`, `PARAMS.car.radius`.
- Produces:
  - `resolveWall(car, proj, track, radius, pc) → boolean`: mutates the car and returns whether it hit.
  - `resolveCars(cars: Car[], radius, pc)`: mutates the cars.

- [ ] **Step 1: Write the failing tests** on `createTrack(TRACK01)`:
  - `pushes a car beyond the wall back inside`: the car is at lateral 12 moving outward at 20 m/s. After the call, |lateral| ≤ 9.7 + 0.01, the outward normal velocity is ≤ 0, and speed has dropped by at least 15%.
  - `leaves a car inside the limits untouched`: returns false and the car is unchanged.
  - `1000 random positions beyond the wall all end inside the limit`
  - `separates overlapping cars`: two cars 1 m apart end up ≥ 2.6 − 1e-6 apart.
  - `conserves momentum in a car-to-car hit`: A moves at 20 m/s into a stationary B. The summed world velocities before and after match within 1e-6, and A's velocity along the normal decreased.
  - `ignores cars that do not overlap`
- [ ] **Step 2: Run the collision tests.** Expected: FAIL.
- [ ] **Step 3: Implement both functions** as in spec §5.3.
  - Wall limit: `track.wallLimit − radius`.
  - The wall normal is the track normal at `proj.s`, with its sign taken from the lateral side.
  - Car pairs: equal-mass impulse `j = (1 + e)·vRelN / 2`, applied only when the cars are approaching each other.
- [ ] **Step 4: Run the collision tests.** Expected: PASS.
- [ ] **Step 5: Checkpoint.** Run `npm test`. Expected: all green.

---

### Task 5: Race rules

**Files:**
- Create: `src/sim/race.js`
- Test: `tests/race.test.js`

**Interfaces:**
- Consumes: only `track.length` (tests use `{ length: 800 }`).
- Produces:
  - `createRace({ carCount, length, laps, sectors, countdown, playerIndex }) → Race`
  - `Race = { phase: 'countdown'|'racing'|'finished', countdownLeft, time, cars: RaceCar[], order: number[], results: Result[] | null }`
  - `RaceCar = { lap, nextSector, behindLine, lastS, lapStart, lapTimes: number[], bestLap: number|null, finished, finishTime: number|null, progress, wrongWayTime, wrongWay }`
  - `Result = { index, time, bestLap, estimated: boolean }`, sorted by `time`.
  - `updateRace(race, tracking: {s, along}[], dt)` mutates the race. `along` is the car's velocity projected on the track tangent.

- [ ] **Step 1: Write the failing tests.** Use a helper `drive(race, i, sFrom, sTo, step)` that feeds s values (wrapping at 800) for car `i`, keeping the other cars still.
  - `countdown blocks racing`: phase is `countdown` after 2.9 s and `racing` after 3.0 s. `time` stays 0 during the countdown.
  - `first crossing from the grid starts lap 1 without completing a lap`: from 790 to 5, `lap === 1` and `lapTimes` is empty.
  - `a full lap through all sectors completes a lap`: `lapTimes.length === 1` and `bestLap > 0`.
  - `reversing over the line and back does not count`: after crossing back from 10 to 790 and forward to 10, `lapTimes` is empty.
  - `forth-and-back after a valid lap does not double count`
  - `reversing from the grid never credits a lap`: s goes from 790 down to 600 with along = −5 for 2 s. `lap === 0`, progress < 0, `wrongWay` is true, and the car is last in `order`.
  - `wrongWay clears immediately when moving forward`
  - `positions order by progress`
  - `finishing lap 3 marks the car finished`
  - `player finishing ends the race`: phase is `finished` and `results` has 5 entries sorted by time. AI cars that didn't finish have `estimated: true`, and their estimate is greater than the player's time.
  - `lap tracking continues for unfinished cars after the race ends`: a car can still reach `finished` while the phase is `finished`.
- [ ] **Step 2: Run the race tests.** Expected: FAIL.
- [ ] **Step 3: Implement `createRace` and `updateRace`.**
  - Initial state per car: `lap = 0`, `behindLine = true`, `nextSector = 1`, `lastS = null`.

```
countdown: countdownLeft −= dt; on ≤ 0 → phase 'racing' (carry leftover into time)
racing/finished: time += dt; for each car:
  ds = s − lastS (skip on first sample)
  forward crossing  if ds < −length/2;  backward crossing if ds > length/2
  backward: behindLine = true
  forward:  behindLine = false
            if lap === 0 → lap = 1, lapStart = time, nextSector = 1
            else if nextSector === sectors → push lap time, bestLap, lapStart = time, nextSector = 1,
                 if lap === laps → finished, finishTime = time  else lap++
            (otherwise the crossing is invalid: nothing else changes)
  sector = floor(s / (length/sectors)); if !behindLine && sector === nextSector → nextSector++
  progress = (max(lap,1) − 1)·length + s − (behindLine ? length : 0) (+ laps·length for finished cars, so they rank by finishTime)
  wrongWayTime += dt while along < −1, else 0; wrongWay = wrongWayTime > 1
order: finished cars by finishTime, then the rest by progress descending
on the player finishing (racing → finished): results = every car's finishTime, or for unfinished cars
  time + (laps·length − progress) / max(progress/time, 1), with estimated: true
```

- [ ] **Step 4: Run the race tests.** Expected: PASS.
- [ ] **Step 5: Checkpoint.** Run `npm test`. Expected: all green.

---

### Task 6: AI driver

**Files:**
- Create: `src/sim/ai.js`
- Test: `tests/ai.test.js`

**Interfaces:**
- Consumes:
  - `Track` (Task 2): `sampleAt`, `maxCurvatureAhead`
  - `Car` and `speedOf` (Task 3)
  - `PARAMS.ai`, `PARAMS.car`
- Produces:
  - `createDriver(skill, rng) → Driver`, where `Driver = { skill, lineOffset, offsetNow, stuckTime, recoverLeft, speedScale }`
  - `targetSpeed(s, speed, track, driver, pa, pc) → number`
  - `aiInput(car, proj, driver, track, others: Car[], pa, pc, dt) → { throttle, steer, handbrake: false }`. It mutates the driver's `offsetNow`, `stuckTime` and `recoverLeft`.

- [ ] **Step 1: Write the failing tests** on `createTrack(TRACK01)`.
  - Helpers: find `sStraight` (the middle of the lowest-|curv| 150 m window) and `sHairpinEntry` (40 m before the max-|curv| sample). Place the car on the centreline with heading `atan2(tx, tz)`.
  - `accelerates on a straight from rest`: throttle > 0.5.
  - `slows for the hairpin`: `targetSpeed(sHairpinEntry, 45, …) < 0.7 × targetSpeed(sStraight, 45, …)`.
  - `higher skill means higher target speed` on the same s.
  - `steers back toward its line`: a car at lateral −4 (right of a 0-offset line) gives steer > 0.
  - `recovers when stuck`: feed a car with speed 0 (re-created every call) for 1.6 s of 1/60 steps. The next call returns throttle < 0, the calls continue to reverse for about 1 s, and after that throttle > 0.
  - `shifts line to avoid a car directly ahead`: with another car 8 m ahead on the same line, |offsetNow − lineOffset| > 1 after 0.5 s.
  - `speedScale 0.5 halves target speed` (cool-down).
- [ ] **Step 2: Run the AI tests.** Expected: FAIL.
- [ ] **Step 3: Implement the AI** as in spec §5.5.
  - Lookahead: `lookaheadBase + lookaheadTime·speed`.
  - The target point is offset by `offsetNow` along the sample normal.
  - Steer: `clamp(wrapAngle(atan2(dx, dz) − heading)·steerGain, −1, 1)`, negated while reversing.
  - Braking window: `speed²/(2·brakeDecel) + lookahead`.
  - Corner speed: `sqrt(maxLatAccel/max(k, 1e-4))`.
  - Target speed: `min(maxSpeed, corner)·(0.86 + 0.12·skill)·speedScale`.
  - Throttle: `clamp((target − speed)/5, −1, 1)`.
  - Avoidance: a car is "ahead" when its along-track distance is between 0 and `avoidAhead` and its lateral gap is under `avoidLateral`. Shift the target offset by `avoidShift` toward whichever side has more room within ±(halfWidth − 1.5), smoothed with `1 − e^(−dt/0.5)`, and cap throttle at 0.7.
  - Stuck: speed < `stuckSpeed` for `stuckTime` → `recoverLeft = recoverTime`.
  - `createDriver`: `lineOffset = (rng()·2 − 1)·lineOffsetMax`.
- [ ] **Step 4: Run the AI tests.** Expected: PASS.
- [ ] **Step 5: Checkpoint.** Run `npm test`. Expected: all green.

---

### Task 7: World + headless full races

**Files:**
- Create: `src/sim/world.js`
- Test: `tests/world.test.js`

**Interfaces:**
- Consumes everything from Tasks 1–6.
- Produces:
  - `createWorld({ track, seed, params = PARAMS, autopilotPlayer = false }) → World`
  - `World = { track, cars: Car[], drivers: (Driver|null)[], race: Race, step(playerInput, dt), snapshot() }`
  - `snapshot() → { phase, countdownLeft, time, playerIndex, order, results, cars: Pose[], player: { position, lap, laps, lapTime, bestLap, speedKmh, wrongWay } }`
  - `Pose = { x, z, heading, steer, speed, vLateral }`
  - The player's driver is `null` unless `autopilotPlayer` is set, in which case it uses `autopilotSkill`.

- [ ] **Step 1: Write the failing tests.**
  - `grid`: 5 cars, the player last (lowest progress), all inside the road, all facing the track direction.
  - `nothing moves during countdown`: 2.9 s of steps with full throttle input leaves every pose unchanged.
  - `full AI race completes`: for each seed in [1, 2, 3], run with `autopilotPlayer` until every `race.cars[i].finished` is true, with a cap of 400 s. Every step:
    - all `x`, `z` and `heading` values are finite;
    - |lateral| ≤ wallLimit − radius + 0.01;
    - no unfinished car has speed < 1 m/s for more than 5 s continuously while racing.
  - `finish times are spread`: the max minus min finish time across the cars is ≥ 3 s, for every seed.
  - `results appear when the player finishes`: `snapshot().results.length === 5`.
  - `deterministic`: two worlds (seed 7) fed the same scripted input (full throttle, steer `sin(t)`) for 30 s produce equal `JSON.stringify(snapshot())`.
- [ ] **Step 2: Run `npx vitest run tests/world.test.js`.** Expected: FAIL.
- [ ] **Step 3: Implement `createWorld`.**
  - Grid: car `i` has `row = floor(i/2)` and `col = i%2`. Its s is `length − spacing·(row + 1) − (col ? spacing/2 : 0)`, with lateral `col ? −lateral : +lateral`. It faces the tangent.
  - `step`: follow spec §5.6, and keep the projection index of each car as the hint for the next step.
    - Surface: `surface = |lateral| > halfWidth ? 'grass' : 'road'`.
    - Inputs are zeroed during the countdown.
    - Finished cars get `driver.speedScale = cooldownSpeed`. A finished player with no driver gets a temporary cool-down driver.
    - `along = dot(worldVelocity, tangent)`.
  - `speedKmh = speed·3.6`.
  - `lapTime = race.time − lapStart` (0 before lap 1).
- [ ] **Step 4: Run the world tests.** Expected: PASS. If AI cars get stuck or don't spread, tune `PARAMS.ai` or the TRACK01 geometry and re-run all tests.
- [ ] **Step 5: Checkpoint.** Run `npm test`. Expected: all green.

---

### Task 8: Game loop, keyboard, rendering

**Files:**
- Create:
  - `src/loop.js`, `src/input/keyboard.js`
  - `src/render/scene.js`, `src/render/trackMesh.js`, `src/render/carMesh.js`, `src/render/camera.js`
- Modify: `src/main.js`
- Test: `tests/loop.test.js`, `tests/keyboard.test.js`

**Interfaces:**
- Consumes: `createWorld` and `snapshot()` from Task 7, `createTrack` and `TRACK01`, `createRng`, `CARS`.
- Produces:
  - `advance(acc, frameDt, dt, maxFrame = 0.25) → { steps, acc, alpha }`
  - `createKeyboard(target = window) → { input() → {throttle, steer, handbrake}, onPress(code, fn), dispose() }`. Key codes: `KeyW`/`ArrowUp`, `KeyS`/`ArrowDown`, `KeyA`/`ArrowLeft` (+1), `KeyD`/`ArrowRight` (−1), `Space`.
  - `isWebGLAvailable() → boolean`
  - `createScene(container) → { renderer, scene, sun, render(camera), onResize(fn) }`
  - `buildTrackMesh(track, rng) → THREE.Group`
  - `createCarMesh(color) → { group, update(pose, frameDt) }`
  - `createChaseCamera() → { camera, reset(pose), update(pose, dt), setAspect(a) }`

- [ ] **Step 1: Write the failing tests.**
  - `advance accumulates fixed steps`: `advance(0, 0.05, 1/60)` gives 3 steps.
  - `advance clamps a huge frame delta`: `advance(0, 600, 1/60)` gives steps === 15 and 0 ≤ alpha < 1.
  - `maps keys to input`
  - `opposite keys cancel`
  - `releases all keys on blur`
  - `onPress fires once per keydown, not on repeat`
  - Keyboard tests use a plain `EventTarget` and `Object.assign(new Event('keydown'), { code: 'KeyW', repeat: false })`. The keyboard calls `preventDefault` for arrows and Space.
- [ ] **Step 2: Run the loop and keyboard tests.** Expected: FAIL. Then implement `advance` and `createKeyboard`, and run them again. Expected: PASS.
- [ ] **Step 3: Implement the render modules** as in spec §5.7.
  - Road ribbon: a `BufferGeometry` strip across ±halfWidth.
  - Kerbs: where |curv| > 0.02, alternating red and white segments at the road edge.
  - Walls: boxes along ±wallLimit (segmented strips are fine).
  - Start line: a `CanvasTexture` chequer.
  - Scenery: about 300 trees (cone + cylinder) and cones as `InstancedMesh`es, placed only where they're at least 3 m outside the wall on both sides. Reject positions using `track.project`.
  - Car: body, cabin and wheels. Front-wheel yaw = `steer·maxSteer`. Body roll = `−vLateral·0.02` clamped to ±0.12.
  - Camera: 9 m behind and 4 m above, looking 6 m ahead. Spring smoothing `1 − e^(−6·dt)`. FOV goes from 65 to 75 with speed.
  - Shadow camera: centred on the player each frame.
- [ ] **Step 4: Wire `main.js`** (temporary; Task 9 adds the screens).
  - If `!isWebGLAvailable()`, render the fallback message and stop.
  - Otherwise, build the track, meshes and world (seed `Date.now()`) and start a single `requestAnimationFrame` loop.
  - Use `advance` for fixed steps, keeping the previous poses.
  - Render each car at the interpolated pose: lerp x and z, and the shortest-arc lerp of heading by `alpha`.
- [ ] **Step 5: Browser check.**
  - Start `npm run dev` in the background, navigate the Playwright MCP browser to it, and take a screenshot.
  - Expected: the track, 5 cars and scenery are visible, and the console has no errors.
  - Hold `w` for 3 s after the countdown and take another screenshot. Expected: the player car has moved and the camera has followed.
- [ ] **Step 6: Checkpoint.** Run `npm test`. Expected: all green.

---

### Task 9: HUD, screens, race flow

**Files:**
- Create: `src/ui/format.js`, `src/ui/hud.js`, `src/ui/hud.css`
- Modify: `src/main.js`
- Test: `tests/format.test.js`

**Interfaces:**
- Consumes: `snapshot()` (Task 7), `createKeyboard().onPress` (Task 8), `CARS`.
- Produces:
  - `formatTime(seconds | null) → string`: `"1:05.432"`, with `"--:--.---"` for null.
  - `ordinal(n) → string`: `"1st"`, `"2nd"`, `"3rd"`, `"4th"`.
  - `createHud(root) → { showStart(), update(snapshot), showResults(results, cars, playerIndex), hide(), onRestart(fn) }`

- [ ] **Step 1: Write the failing tests.** `formatTime(65.4321) === "1:05.432"`, `formatTime(0) === "0:00.000"`, `formatTime(null) === "--:--.---"`, `ordinal` for 1–5, 11, 12, 13 and 22. Run them. Expected: FAIL. Implement. Expected: PASS.
- [ ] **Step 2: Implement `createHud`** as in spec §5.8.
  - HUD elements: `POS 3/5`, `LAP 2/3`, lap time, best lap, `123 km/h`.
  - Countdown text: `3`, `2`, `1`, then `GO!` for 0.7 s after the race starts.
  - WRONG WAY banner.
  - Results table: position, name, time (estimated times prefixed with `~`), best lap. The player row is highlighted. Include a "Race again (R)" button.
  - Start overlay: the title "Low-Poly GP", a controls table and "Press Enter to start".
  - Only write `textContent` when the value changes.
- [ ] **Step 3: Wire the game flow in `main.js`.**
  - States: `start` → `race` → `results`.
  - On the start screen, the scene renders a slowly orbiting camera around the grid. Enter starts.
  - In the race, `R` at any time builds a fresh world and resets the car meshes in place (no new meshes and no new rAF loop). After results, `R` or the button restarts the same way.
  - On `phase === 'finished'`, show the results.
- [ ] **Step 4: Browser check.**
  - Load the page and take a screenshot. Expected: the start overlay.
  - Press Enter and take a screenshot during the countdown. Expected: the countdown number and HUD.
  - Check the console. Expected: no errors.
- [ ] **Step 5: Checkpoint.** Run `npm test`. Expected: all green.

---

### Task 10: End-to-end verification & tuning

**Files:**
- Modify: `src/sim/params.js` and `src/data/track01.js` only if tuning is needed. Expose `window.__game = { world, scene }` in `main.js` only when `import.meta.env.DEV`.

- [ ] **Step 1: Restart test (Review Focus 5).** In the browser, record `__game.scene.children.length`. Start a race, press `R` during the countdown and again mid-race, and record it again. Expected: the counts are equal, and the countdown restarted at 3.
- [ ] **Step 2: Full race via autopilot.**
  - In the browser console, swap in a world with `autopilotPlayer: true` (a dev-only `__game.autopilot()` helper in `main.js`).
  - Speed up by stepping 10× per frame (`__game.fast = 10`). Wait until the results show.
  - Expected: a results table with 5 rows, a highlighted player row, and no console errors.
- [ ] **Step 3: Frame-rate check.** Use `browser_evaluate` to measure the average rAF interval over 3 s while racing. Expected: ≤ 17.5 ms (≈ 60 fps) on this machine.
- [ ] **Step 4: Production build.** Run `npm run build`. Expected: it succeeds and `dist/` is created.
- [ ] **Step 5: Final checkpoint.** Run `npm test`. Expected: all green. Report the screenshots and the manual playtest checklist (spec §7) to the user, because handling feel has to be judged by a human.
