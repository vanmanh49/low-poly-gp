import { assistSteer } from '../src/sim/assist.js';
import { createCar } from '../src/sim/car.js';
import { createTrack } from '../src/sim/track.js';
import { TRACK01 } from '../src/data/track01.js';
import { PARAMS } from '../src/sim/params.js';

const track = createTrack(TRACK01);
const pa = PARAMS.assist;
const S = 20; // on the main straight

function carAt(s, lateral, headingOffset, speed) {
  const p = track.sampleAt(s);
  const car = createCar({ x: p.x + p.nx * lateral, z: p.z + p.nz * lateral, heading: Math.atan2(p.tx, p.tz) + headingOffset });
  car.vForward = speed;
  return car;
}
const steerFor = (car) => assistSteer(car, track.project(car.x, car.z), track, pa);

test('does nothing when nearly stopped', () => {
  expect(steerFor(carAt(S, 0, 0.3, 1))).toBe(0);
});

test('steers back when pointing left of the track', () => {
  expect(steerFor(carAt(S, 0, 0.2, 30))).toBeLessThan(0);
});

test('steers back when pointing right of the track', () => {
  expect(steerFor(carAt(S, 0, -0.2, 30))).toBeGreaterThan(0);
});

test('authority is limited', () => {
  expect(Math.abs(steerFor(carAt(S, 0, 1.2, 30)))).toBeLessThanOrEqual(pa.maxSteer + 1e-9);
});

test('keeps the current line instead of pulling to the centre', () => {
  expect(Math.abs(steerFor(carAt(S, 4, 0, 30)))).toBeLessThan(0.05);
});

test('does not try to turn a car that faces backwards', () => {
  expect(steerFor(carAt(S, 0, Math.PI * 0.8, 10))).toBe(0);
});
