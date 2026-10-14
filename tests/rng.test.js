import { createRng } from '../src/sim/rng.js';

test('same seed gives same sequence', () => {
  const a = createRng(42), b = createRng(42);
  for (let i = 0; i < 100; i++) expect(a()).toBe(b());
});

test('values are in [0,1) and seeds differ', () => {
  const r = createRng(1), q = createRng(2);
  let same = 0;
  for (let i = 0; i < 1000; i++) {
    const v = r();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
    if (v === q()) same++;
  }
  expect(same).toBeLessThan(5);
});
