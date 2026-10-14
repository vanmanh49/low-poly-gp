import { createWorld } from '../src/sim/world.js';
import { createTrack } from '../src/sim/track.js';
import { TRACK01 } from '../src/data/track01.js';
import { PARAMS } from '../src/sim/params.js';

const track = createTrack(TRACK01);
const dt = PARAMS.dt;
const idle = { throttle: 0, steer: 0, handbrake: false };

test('grid', () => {
  const w = createWorld({ track, seed: 1 });
  expect(w.cars.length).toBe(5);
  const projs = w.cars.map((c) => track.project(c.x, c.z));
  const minS = Math.min(...projs.map((p) => p.s));
  expect(projs[PARAMS.playerIndex].s).toBe(minS);
  w.cars.forEach((c, i) => {
    expect(Math.abs(projs[i].lateral)).toBeLessThanOrEqual(track.halfWidth);
    const t = track.sampleAt(projs[i].s);
    expect(Math.sin(c.heading) * t.tx + Math.cos(c.heading) * t.tz).toBeGreaterThan(0.99);
  });
});

test('nothing moves during countdown', () => {
  const w = createWorld({ track, seed: 1 });
  const before = JSON.stringify(w.snapshot().cars);
  for (let i = 0; i < Math.round(2.9 / dt); i++) w.step({ throttle: 1, steer: 1, handbrake: false }, dt);
  expect(JSON.stringify(w.snapshot().cars)).toBe(before);
  expect(w.snapshot().phase).toBe('countdown');
});

function runFullRace(seed) {
  const w = createWorld({ track, seed, autopilotPlayer: true });
  const limit = track.wallLimit - PARAMS.car.radius + 0.01;
  const slowFor = new Array(5).fill(0);
  let worstSlow = 0, worstLat = 0, finite = true, playerResults = null;
  for (let i = 0; i < Math.round(400 / dt); i++) {
    w.step(idle, dt);
    w.cars.forEach((c, k) => {
      if (![c.x, c.z, c.heading, c.vForward, c.vLateral].every(Number.isFinite)) finite = false;
      worstLat = Math.max(worstLat, Math.abs(track.project(c.x, c.z).lateral));
      const racingCar = w.race.phase !== 'countdown' && !w.race.cars[k].finished;
      slowFor[k] = racingCar && Math.abs(c.vForward) < 1 ? slowFor[k] + dt : 0;
      worstSlow = Math.max(worstSlow, slowFor[k]);
    });
    if (!playerResults && w.snapshot().results) playerResults = w.snapshot().results;
    if (w.race.cars.every((c) => c.finished)) break;
  }
  return { w, worstSlow, worstLat, finite, limit, playerResults };
}

describe.each([1, 2, 3])('full AI race, seed %i', (seed) => {
  const r = runFullRace(seed);

  test('full AI race completes', () => {
    expect(r.finite).toBe(true);
    expect(r.worstLat).toBeLessThanOrEqual(r.limit);
    expect(r.worstSlow).toBeLessThanOrEqual(5);
    expect(r.w.race.cars.every((c) => c.finished)).toBe(true);
  });

  test('finish times are spread', () => {
    const times = r.w.race.cars.map((c) => c.finishTime);
    expect(Math.max(...times) - Math.min(...times)).toBeGreaterThanOrEqual(3);
  });

  test('results appear when the player finishes', () => {
    expect(r.playerResults.length).toBe(5);
  });
});

test('deterministic', () => {
  const run = () => {
    const w = createWorld({ track, seed: 7 });
    for (let i = 0; i < Math.round(30 / dt); i++) w.step({ throttle: 1, steer: Math.sin(i * dt), handbrake: false }, dt);
    return JSON.stringify(w.snapshot());
  };
  expect(run()).toBe(run());
});

describe('steering assist', () => {
  const afterCountdown = (w) => { for (let i = 0; i < Math.round(3 / dt); i++) w.step(idle, dt); };
  function nudgedRun(assist, input, seconds) {
    const w = createWorld({ track, seed: 3, assist });
    afterCountdown(w);
    const p = w.cars[PARAMS.playerIndex];
    p.heading += 0.12; // knocked slightly off line
    for (let i = 0; i < Math.round(seconds / dt); i++) w.step(input, dt);
    return w;
  }

  test('assist is on by default and reported in the snapshot', () => {
    expect(createWorld({ track, seed: 1 }).snapshot().player.assist).toBe(true);
    expect(createWorld({ track, seed: 1, assist: false }).snapshot().player.assist).toBe(false);
  });

  test('hands-off, assist straightens the car; without it the car drifts off line', () => {
    const go = { throttle: 1, steer: 0, handbrake: false };
    const err = (w) => {
      const c = w.cars[PARAMS.playerIndex];
      const pr = track.project(c.x, c.z);
      const t = track.sampleAt(pr.s);
      return Math.abs(Math.atan2(Math.sin(c.heading - Math.atan2(t.tx, t.tz)), Math.cos(c.heading - Math.atan2(t.tx, t.tz))));
    };
    expect(err(nudgedRun(true, go, 2))).toBeLessThan(0.03);
    expect(err(nudgedRun(false, go, 2))).toBeGreaterThan(0.08);
  });

  test('assist never alters steering the player is giving', () => {
    const turn = { throttle: 1, steer: 1, handbrake: false };
    const a = nudgedRun(true, turn, 1).cars[PARAMS.playerIndex];
    const b = nudgedRun(false, turn, 1).cars[PARAMS.playerIndex];
    expect(a.heading).toBeCloseTo(b.heading, 9);
  });

  test('setAssist toggles it', () => {
    const w = createWorld({ track, seed: 1 });
    w.setAssist(false);
    expect(w.snapshot().player.assist).toBe(false);
  });
});
