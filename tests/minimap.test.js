import { mapTransform } from '../src/ui/minimap.js';

const xs = [-100, 300, 300, -100], zs = [-50, -50, 150, 150];

test('fits every point inside the padded square', () => {
  const toMap = mapTransform(xs, zs, 180, 12);
  xs.forEach((x, i) => {
    const [u, v] = toMap(x, zs[i]);
    expect(u).toBeGreaterThanOrEqual(12 - 1e-9);
    expect(u).toBeLessThanOrEqual(168 + 1e-9);
    expect(v).toBeGreaterThanOrEqual(12 - 1e-9);
    expect(v).toBeLessThanOrEqual(168 + 1e-9);
  });
});

test('keeps the aspect ratio and centres the shorter side', () => {
  const toMap = mapTransform(xs, zs, 180, 12);
  const [u0, v0] = toMap(-100, -50), [u1, v1] = toMap(300, 150);
  expect((u1 - u0) / (v1 - v0)).toBeCloseTo(400 / 200, 9);
  expect(u0).toBeCloseTo(12, 9);
  expect((v0 + v1) / 2).toBeCloseTo(90, 9);
});

test('matches the top-down view: +x right, +z down', () => {
  const toMap = mapTransform(xs, zs, 180, 12);
  expect(toMap(10, 0)[0]).toBeGreaterThan(toMap(0, 0)[0]);
  expect(toMap(0, 10)[1]).toBeGreaterThan(toMap(0, 0)[1]);
});
