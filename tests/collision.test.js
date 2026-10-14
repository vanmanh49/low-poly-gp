import { resolveWall, resolveCars } from '../src/sim/collision.js';
import { createCar, worldVelocity, setWorldVelocity, speedOf } from '../src/sim/car.js';
import { createTrack } from '../src/sim/track.js';
import { TRACK01 } from '../src/data/track01.js';
import { PARAMS } from '../src/sim/params.js';
import { createRng } from '../src/sim/rng.js';

const track = createTrack(TRACK01);
const radius = PARAMS.car.radius;
const pc = PARAMS.collision;
const limit = track.wallLimit - radius;

function carAt(s, lateral, heading) {
  const p = track.sampleAt(s);
  return createCar({ x: p.x + p.nx * lateral, z: p.z + p.nz * lateral, heading: heading ?? Math.atan2(p.tx, p.tz) });
}

test('pushes a car beyond the wall back inside', () => {
  const s = 20;
  const car = carAt(s, 12);
  const n = track.sampleAt(s);
  setWorldVelocity(car, n.nx * 20, n.nz * 20); // straight outward (left)
  const before = speedOf(car);
  const hit = resolveWall(car, track.project(car.x, car.z), track, radius, pc);
  expect(hit).toBe(true);
  const proj = track.project(car.x, car.z);
  expect(Math.abs(proj.lateral)).toBeLessThanOrEqual(limit + 0.01);
  const { vx, vz } = worldVelocity(car);
  expect(vx * n.nx + vz * n.nz).toBeLessThanOrEqual(0);
  expect(speedOf(car)).toBeLessThanOrEqual(before * 0.85 + 1e-9);
});

test('leaves a car inside the limits untouched', () => {
  const car = carAt(300, 3);
  car.vForward = 15;
  const copy = { ...car };
  expect(resolveWall(car, track.project(car.x, car.z), track, radius, pc)).toBe(false);
  expect(car).toEqual(copy);
});

test('1000 random positions beyond the wall all end inside the limit', () => {
  const rng = createRng(5);
  for (let i = 0; i < 1000; i++) {
    const s = rng() * track.length;
    const side = rng() < 0.5 ? -1 : 1;
    const car = carAt(s, side * (limit + rng() * 3), rng() * 6.28);
    car.vForward = rng() * 50;
    resolveWall(car, track.project(car.x, car.z), track, radius, pc);
    expect(Math.abs(track.project(car.x, car.z).lateral)).toBeLessThanOrEqual(limit + 0.01);
  }
});

test('separates overlapping cars', () => {
  const a = createCar({ x: 0, z: 0, heading: 0 });
  const b = createCar({ x: 1, z: 0, heading: 0 });
  resolveCars([a, b], radius, pc);
  expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(2 * radius - 1e-6);
});

test('conserves momentum in a car-to-car hit', () => {
  const a = createCar({ x: 0, z: 0, heading: 0 });
  const b = createCar({ x: 0, z: 2.4, heading: 0.3 });
  a.vForward = 20;
  const va0 = worldVelocity(a), vb0 = worldVelocity(b);
  resolveCars([a, b], radius, pc);
  const va1 = worldVelocity(a), vb1 = worldVelocity(b);
  expect(va1.vx + vb1.vx).toBeCloseTo(va0.vx + vb0.vx, 6);
  expect(va1.vz + vb1.vz).toBeCloseTo(va0.vz + vb0.vz, 6);
  expect(va1.vz).toBeLessThan(va0.vz); // normal is +z here
});

test('ignores cars that do not overlap', () => {
  const a = createCar({ x: 0, z: 0, heading: 0 });
  const b = createCar({ x: 5, z: 0, heading: 0 });
  a.vForward = 10;
  const ca = { ...a }, cb = { ...b };
  resolveCars([a, b], radius, pc);
  expect(a).toEqual(ca);
  expect(b).toEqual(cb);
});
