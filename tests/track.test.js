import { createTrack } from '../src/sim/track.js';
import { TRACK01 } from '../src/data/track01.js';
import { createRng } from '../src/sim/rng.js';

const R = 100;
const circlePoints = Array.from({ length: 32 }, (_, i) => {
  const a = (i / 32) * Math.PI * 2;
  return [R * Math.sin(a), R * Math.cos(a)];
});
const circle = createTrack({ points: circlePoints, halfWidth: 7, runoff: 4 });

function wrapDist(a, b, L) {
  const d = Math.abs(a - b) % L;
  return Math.min(d, L - d);
}

describe('circle fixture', () => {
  test('circle length ≈ 2π·100 within 1%', () => {
    expect(Math.abs(circle.length - 2 * Math.PI * R) / (2 * Math.PI * R)).toBeLessThan(0.01);
  });

  test('circle curvature ≈ +0.01 within 5% at 10 random s', () => {
    const rng = createRng(3);
    for (let i = 0; i < 10; i++) {
      const k = circle.sampleAt(rng() * circle.length).curvature;
      expect(Math.abs(k - 0.01) / 0.01).toBeLessThan(0.05);
    }
  });

  test('sampleAt wraps', () => {
    const a = circle.sampleAt(circle.length + 5), b = circle.sampleAt(5);
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.z).toBeCloseTo(b.z, 6);
  });

  test('project round-trips', () => {
    const L = circle.length;
    for (const s of [0, 123.4, L - 0.5]) {
      for (const d of [-9, 0, 6]) {
        const p = circle.sampleAt(s);
        const r = circle.project(p.x + p.nx * d, p.z + p.nz * d);
        expect(wrapDist(r.s, s, L)).toBeLessThan(0.5);
        expect(Math.abs(r.lateral - d)).toBeLessThan(0.1);
      }
    }
  });

  test('hinted project agrees with full scan', () => {
    const rng = createRng(9);
    for (let i = 0; i < 50; i++) {
      const s = rng() * circle.length;
      const d = (rng() * 2 - 1) * 10;
      const p = circle.sampleAt(s);
      const x = p.x + p.nx * d, z = p.z + p.nz * d;
      const full = circle.project(x, z);
      const hint = (full.index + 5) % circle.count;
      const hinted = circle.project(x, z, hint);
      expect(wrapDist(hinted.s, full.s, circle.length)).toBeLessThan(1e-6);
      expect(hinted.lateral).toBeCloseTo(full.lateral, 6);
    }
  });

  test('maxCurvatureAhead on circle ≈ 0.01', () => {
    expect(circle.maxCurvatureAhead(10, 100)).toBeCloseTo(0.01, 3);
  });
});

describe('TRACK01', () => {
  const t = createTrack(TRACK01);
  const maxK = Math.max(...Array.from(t.curv, Math.abs));

  test('TRACK01 length in [1200, 1600]', () => {
    expect(t.length).toBeGreaterThanOrEqual(1200);
    expect(t.length).toBeLessThanOrEqual(1600);
  });

  test('TRACK01 min radius ≥ 15 m', () => {
    expect(1 / maxK).toBeGreaterThanOrEqual(15);
  });

  test('TRACK01 has a hairpin', () => {
    expect(maxK).toBeGreaterThanOrEqual(1 / 30);
  });

  test('TRACK01 has a straight ≥ 150 m with |curv| < 0.002', () => {
    let run = 0, best = 0;
    for (let i = 0; i < t.count * 2; i++) {
      if (Math.abs(t.curv[i % t.count]) < 0.002) { run++; best = Math.max(best, run); } else run = 0;
    }
    const spacing = t.length / t.count;
    expect(Math.min(best, t.count) * spacing).toBeGreaterThanOrEqual(150);
  });

  test('TRACK01 does not overlap itself', () => {
    const minGap = 2 * t.wallLimit + 4;
    let worst = Infinity;
    for (let i = 0; i < t.count; i += 2) {
      for (let j = i + 1; j < t.count; j += 2) {
        if (wrapDist(t.ss[i], t.ss[j], t.length) <= 60) continue;
        worst = Math.min(worst, Math.hypot(t.xs[i] - t.xs[j], t.zs[i] - t.zs[j]));
      }
    }
    expect(worst).toBeGreaterThan(minGap);
  });
});
