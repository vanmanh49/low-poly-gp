import { createDriver, targetSpeed, aiInput } from '../src/sim/ai.js';
import { createCar } from '../src/sim/car.js';
import { createTrack } from '../src/sim/track.js';
import { TRACK01 } from '../src/data/track01.js';
import { PARAMS } from '../src/sim/params.js';
import { createRng } from '../src/sim/rng.js';

const track = createTrack(TRACK01);
const pa = PARAMS.ai, pc = PARAMS.car;
const dt = 1 / 60;

function findStraight() {
  const w = Math.round(150 / track.spacing);
  let best = Infinity, bestI = 0;
  for (let i = 0; i < track.count; i++) {
    let sum = 0;
    for (let k = 0; k < w; k++) sum += Math.abs(track.curv[(i + k) % track.count]);
    if (sum < best) { best = sum; bestI = i; }
  }
  return track.ss[(bestI + Math.floor(w / 2)) % track.count];
}
function findHairpinEntry() {
  let maxK = 0, idx = 0;
  for (let i = 0; i < track.count; i++) if (Math.abs(track.curv[i]) > maxK) { maxK = Math.abs(track.curv[i]); idx = i; }
  return (track.ss[idx] - 10 + track.length) % track.length;
}
const sStraight = findStraight();
const sHairpinEntry = findHairpinEntry();

function carAt(s, lateral = 0, speed = 0) {
  const p = track.sampleAt(s);
  const car = createCar({ x: p.x + p.nx * lateral, z: p.z + p.nz * lateral, heading: Math.atan2(p.tx, p.tz) });
  car.vForward = speed;
  return car;
}
function driver(skill = 0.85, lineOffset = 0) {
  const d = createDriver(skill, createRng(1));
  d.lineOffset = lineOffset;
  d.offsetNow = lineOffset;
  return d;
}
const input = (car, d, others = []) => aiInput(car, track.project(car.x, car.z), d, track, others, pa, pc, dt);

test('accelerates on a straight from rest', () => {
  expect(input(carAt(sStraight), driver()).throttle).toBeGreaterThan(0.5);
});

test('slows for the hairpin', () => {
  const d = driver();
  expect(targetSpeed(sHairpinEntry, 45, track, d, pa, pc)).toBeLessThan(0.7 * targetSpeed(sStraight, 45, track, d, pa, pc));
});

test('higher skill means higher target speed', () => {
  expect(targetSpeed(sHairpinEntry, 30, track, driver(1.0), pa, pc))
    .toBeGreaterThan(targetSpeed(sHairpinEntry, 30, track, driver(0.55), pa, pc));
});

test('steers back toward its line', () => {
  expect(input(carAt(sStraight, -4, 20), driver()).steer).toBeGreaterThan(0);
});

test('recovers when stuck', () => {
  const d = driver();
  for (let i = 0; i < 96; i++) input(carAt(sStraight), d);
  expect(input(carAt(sStraight), d).throttle).toBeLessThan(0);
  for (let i = 0; i < 50; i++) expect(input(carAt(sStraight), d).throttle).toBeLessThan(0);
  for (let i = 0; i < 16; i++) input(carAt(sStraight), d);
  expect(input(carAt(sStraight), d).throttle).toBeGreaterThan(0);
});

test('shifts line to avoid a car directly ahead', () => {
  const d = driver();
  const me = carAt(sStraight, 0, 30);
  const other = carAt(sStraight + 8, 0, 25);
  for (let i = 0; i < 30; i++) input(me, d, [other]);
  expect(Math.abs(d.offsetNow - d.lineOffset)).toBeGreaterThan(1);
});

test('speedScale 0.5 halves target speed', () => {
  const d = driver();
  const full = targetSpeed(sStraight, 30, track, d, pa, pc);
  d.speedScale = 0.5;
  expect(targetSpeed(sStraight, 30, track, d, pa, pc)).toBeCloseTo(full / 2, 9);
});
