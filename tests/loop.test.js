import { advance } from '../src/loop.js';

test('advance accumulates fixed steps', () => {
  const r = advance(0, 0.05, 1 / 60);
  expect(r.steps).toBe(3);
  expect(r.acc).toBeGreaterThanOrEqual(0);
  expect(r.acc).toBeLessThan(1 / 60);
});

test('advance carries the remainder into the next frame', () => {
  const a = advance(0, 0.01, 1 / 60);
  expect(a.steps).toBe(0);
  const b = advance(a.acc, 0.01, 1 / 60);
  expect(b.steps).toBe(1);
  expect(b.alpha).toBeCloseTo((0.02 - 1 / 60) * 60, 9);
});

test('advance clamps a huge frame delta', () => {
  const r = advance(0, 600, 1 / 60);
  expect(r.steps).toBe(15);
  expect(r.alpha).toBeGreaterThanOrEqual(0);
  expect(r.alpha).toBeLessThan(1);
});
