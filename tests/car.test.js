import { createCar, stepCar, worldVelocity, setWorldVelocity, speedOf } from '../src/sim/car.js';
import { PARAMS } from '../src/sim/params.js';

const p = PARAMS.car;
const dt = 1 / 60;

function run(car, input, seconds, onStep = () => {}) {
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    car = stepCar(car, input, p, dt);
    onStep(car, (i + 1) * dt);
  }
  return car;
}
const go = { throttle: 1, steer: 0, handbrake: false };

test('does not mutate input', () => {
  const car = Object.freeze({ ...createCar({ x: 0, z: 0, heading: 0 }), vForward: 10 });
  expect(() => stepCar(car, { throttle: 1, steer: 1, handbrake: true }, p, dt)).not.toThrow();
  expect(car.vForward).toBe(10);
});

test('reaches 100 km/h within 4 s', () => {
  expect(run(createCar({ x: 0, z: 0, heading: 0 }), go, 4).vForward).toBeGreaterThanOrEqual(27.8);
});

test('never exceeds maxSpeed', () => {
  let max = 0;
  const car = run(createCar({ x: 0, z: 0, heading: 0 }), go, 30, (c) => { max = Math.max(max, c.vForward); });
  expect(max).toBeLessThanOrEqual(p.maxSpeed + 1e-6);
  expect(car.vForward).toBeGreaterThanOrEqual(0.95 * p.maxSpeed);
});

test('coasts to a stop without rolling back', () => {
  let min = Infinity;
  const start = { ...createCar({ x: 0, z: 0, heading: 0 }), vForward: 30 };
  const car = run(start, { throttle: 0, steer: 0, handbrake: false }, 40, (c) => { min = Math.min(min, c.vForward); });
  expect(car.vForward).toBeLessThan(0.5);
  expect(min).toBeGreaterThanOrEqual(0);
});

test('brakes from 40 m/s to < 1 m/s within 2.5 s', () => {
  let stoppedAt = Infinity;
  run({ ...createCar({ x: 0, z: 0, heading: 0 }), vForward: 40 }, { throttle: -1, steer: 0, handbrake: false }, 2.5,
    (c, t) => { if (c.vForward < 1 && t < stoppedAt) stoppedAt = t; });
  expect(stoppedAt).toBeLessThanOrEqual(2.5);
});

test('reverse is capped', () => {
  const car = run(createCar({ x: 0, z: 0, heading: 0 }), { throttle: -1, steer: 0, handbrake: false }, 10);
  expect(car.vForward).toBeGreaterThanOrEqual(-p.reverseMax - 1e-6);
  expect(car.vForward).toBeLessThan(-5);
});

test('steer left turns left', () => {
  const car = run({ ...createCar({ x: 0, z: 0, heading: 0 }), vForward: 20 }, { throttle: 0.3, steer: 1, handbrake: false }, 1);
  expect(car.heading).toBeGreaterThan(0.3);
  expect(car.x).toBeGreaterThan(0);
});

test('handbrake drifts', () => {
  const maxLat = (handbrake) => {
    let m = 0;
    run({ ...createCar({ x: 0, z: 0, heading: 0 }), vForward: 25 }, { throttle: 0.5, steer: 1, handbrake }, 1,
      (c) => { m = Math.max(m, Math.abs(c.vLateral)); });
    return m;
  };
  expect(maxLat(true)).toBeGreaterThan(2 * maxLat(false));
});

test('grass caps speed', () => {
  const car = run({ ...createCar({ x: 0, z: 0, heading: 0 }), surface: 'grass' }, go, 30);
  expect(speedOf(car)).toBeLessThanOrEqual(p.grass.speedMul * p.maxSpeed + 0.5);
});

test('worldVelocity/setWorldVelocity round-trip', () => {
  const car = { ...createCar({ x: 0, z: 0, heading: 1.0 }), vForward: 12, vLateral: -3 };
  const { vx, vz } = worldVelocity(car);
  expect(Math.hypot(vx, vz)).toBeCloseTo(Math.hypot(12, 3), 9);
  const other = createCar({ x: 0, z: 0, heading: 1.0 });
  setWorldVelocity(other, vx, vz);
  expect(other.vForward).toBeCloseTo(12, 9);
  expect(other.vLateral).toBeCloseTo(-3, 9);
});

describe('steering feel', () => {
  const timeUntil = (car, input, done, limit = 3) => {
    for (let i = 1; i <= limit / dt; i++) {
      car = stepCar(car, input, p, dt);
      if (done(car)) return i * dt;
    }
    return Infinity;
  };
  const moving = (steer) => ({ ...createCar({ x: 0, z: 0, heading: 0 }), vForward: 25, steer });

  test('steering builds up gradually', () => {
    expect(timeUntil(moving(0), { throttle: 0.5, steer: 1, handbrake: false }, (c) => c.steer >= 0.95)).toBeGreaterThan(0.3);
  });

  test('steering returns to centre quickly when released', () => {
    expect(timeUntil(moving(1), { throttle: 0.5, steer: 0, handbrake: false }, (c) => Math.abs(c.steer) < 0.05)).toBeLessThan(0.2);
  });

  test('switching direction passes centre quickly', () => {
    expect(timeUntil(moving(1), { throttle: 0.5, steer: -1, handbrake: false }, (c) => c.steer <= 0)).toBeLessThan(0.15);
  });

  test('car stops rotating soon after steering is released', () => {
    const turning = run(moving(0), { throttle: 0.5, steer: 1, handbrake: false }, 1);
    expect(timeUntil(turning, { throttle: 0.5, steer: 0, handbrake: false }, (c) => Math.abs(c.yawRate) < 0.05)).toBeLessThan(0.4);
  });

  test('a short tap at speed changes heading only a little', () => {
    let car = moving(0);
    car = run(car, { throttle: 1, steer: 1, handbrake: false }, 0.1);
    car = run(car, { throttle: 1, steer: 0, handbrake: false }, 0.5);
    expect(car.heading).toBeLessThan(0.08);
  });
});

test('reports braking only while braking forward', () => {
  const fast = { ...createCar({ x: 0, z: 0, heading: 0 }), vForward: 20 };
  expect(stepCar(fast, { throttle: -1, steer: 0, handbrake: false }, p, dt).braking).toBe(true);
  expect(stepCar(fast, { throttle: 1, steer: 0, handbrake: false }, p, dt).braking).toBe(false);
  expect(stepCar(createCar({ x: 0, z: 0, heading: 0 }), { throttle: -1, steer: 0, handbrake: false }, p, dt).braking).toBe(false);
});

describe('high-speed steering', () => {
  const at = (v) => ({ ...createCar({ x: 0, z: 0, heading: 0 }), vForward: v });
  const heldYaw = (v, steer) => run(at(v), { throttle: 0.6, steer, handbrake: false }, 2).yawRate;

  test('partial steer at 45 m/s turns much less than full lock', () => {
    expect(heldYaw(45, 0.3)).toBeLessThanOrEqual(0.35 * heldYaw(45, 1));
    expect(heldYaw(45, 0.6)).toBeLessThanOrEqual(0.6 * heldYaw(45, 1));
  });

  test('full lock at 45 m/s still turns as hard as the grip allows', () => {
    expect(heldYaw(45, 1)).toBeGreaterThanOrEqual(0.45);
  });

  test('a 0.2 s tap at 45 m/s changes heading by less than 3°', () => {
    let car = run(at(45), { throttle: 1, steer: 1, handbrake: false }, 0.2);
    car = run(car, { throttle: 1, steer: 0, handbrake: false }, 0.8);
    expect(car.heading * 180 / Math.PI).toBeLessThan(3);
  });

  test('steering builds up more slowly at top speed than when slow', () => {
    const steerAfter = (v) => run(at(v), { throttle: 1, steer: 1, handbrake: false }, 0.2).steer;
    expect(steerAfter(48)).toBeLessThan(steerAfter(5) * 0.8);
  });
});
