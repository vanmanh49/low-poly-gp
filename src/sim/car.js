// Arcade car model. Velocity lives in the car's local frame:
// vForward along (sin h, cos h), vLateral along left = (cos h, -sin h).

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const approach = (v, target, maxDelta) => v + clamp(target - v, -maxDelta, maxDelta);

export function createCar({ x, z, heading }) {
  return { x, z, heading, vForward: 0, vLateral: 0, yawRate: 0, steer: 0, gripNow: 1, surface: 'road', braking: false };
}

export function speedOf(car) {
  return Math.hypot(car.vForward, car.vLateral);
}

export function worldVelocity(car) {
  const s = Math.sin(car.heading), c = Math.cos(car.heading);
  return {
    vx: car.vForward * s + car.vLateral * c,
    vz: car.vForward * c - car.vLateral * s,
  };
}

export function setWorldVelocity(car, vx, vz) {
  const s = Math.sin(car.heading), c = Math.cos(car.heading);
  car.vForward = vx * s + vz * c;
  car.vLateral = vx * c - vz * s;
}

// Engine force fades out over the last 10% below the speed cap.
function taper(speed, cap) {
  return clamp((cap - speed) / (0.1 * cap), 0, 1);
}

function longitudinal(vF, throttle, p, vmax) {
  if (throttle > 0) return vF >= 0 ? p.accel * throttle * taper(vF, vmax) : p.brake * throttle;
  if (throttle < 0) {
    return vF > 0.5 ? -p.brake * -throttle : -p.accel * -throttle * taper(-vF, p.reverseMax);
  }
  return 0;
}

export function stepCar(car, input, p, dt) {
  const grass = car.surface === 'grass';
  let { heading, vForward: vF, vLateral: vL, yawRate } = car;
  const braking = input.throttle < 0 && vF > 0.5;

  // Steering winds on gently (more gently at speed) but snaps back or across centre quickly,
  // so keyboard taps stay small.
  const speedFrac = Math.min(1, Math.abs(vF) / p.maxSpeed);
  const steerIn = clamp(input.steer, -1, 1);
  const easing = steerIn === 0 || Math.sign(steerIn) !== Math.sign(car.steer) || Math.abs(steerIn) < Math.abs(car.steer);
  const buildRate = p.steerRate * lerp(1, p.highSpeedSteerRate, speedFrac);
  const steer = approach(car.steer, steerIn, (easing ? p.steerReturnRate : buildRate) * dt);
  // Response curve: small inputs give fine corrections, full lock is unchanged.
  const shaped = Math.sign(steer) * Math.abs(steer) ** p.steerCurve;

  const gripNow = approach(car.gripNow, input.handbrake ? 0 : 1, dt / p.gripRecovery);
  const grip = lerp(p.driftGrip, p.grip, gripNow) * (grass ? p.grass.gripMul : 1);
  const vmax = p.maxSpeed * (grass ? p.grass.speedMul : 1);

  // Throttle / brake / reverse, then drag and rolling resistance (which never reverse the car).
  vF += longitudinal(vF, clamp(input.throttle, -1, 1), p, vmax) * dt;
  const resist = (p.drag * vF * vF * (grass ? p.grass.dragMul : 1) + p.rolling) * dt;
  vF = vF > 0 ? Math.max(0, vF - resist) : Math.min(0, vF + resist);

  // Full-lock yaw is the bicycle model limited by tyre grip; steering input scales it
  // proportionally, so partial steer stays partial even when grip is the limit.
  const lockAngle = p.maxSteer * lerp(1, p.highSpeedSteer, speedFrac);
  const lockYaw = Math.min(
    (Math.abs(vF) * Math.tan(lockAngle)) / p.wheelbase,
    (p.turnAccel * (grass ? p.grass.gripMul : 1)) / Math.max(Math.abs(vF), 1),
  );
  let yawTarget = shaped * lockYaw * Math.sign(vF);
  if (input.handbrake) yawTarget += p.driftYaw * steer * Math.min(1, Math.abs(vF) / 20);
  yawRate += (yawTarget - yawRate) * (1 - Math.exp(-p.yawResponse * dt));

  // Rotate the body; the old velocity is re-expressed in the new frame, then grip bleeds off the slide.
  const dTheta = yawRate * dt;
  heading += dTheta;
  const c = Math.cos(dTheta), s = Math.sin(dTheta);
  const vF2 = vF * c + vL * s;
  const vL2 = (-vF * s + vL * c) * Math.exp(-grip * dt);

  const sh = Math.sin(heading), ch = Math.cos(heading);
  return {
    ...car,
    x: car.x + (vF2 * sh + vL2 * ch) * dt,
    z: car.z + (vF2 * ch - vL2 * sh) * dt,
    heading, vForward: vF2, vLateral: vL2, yawRate, steer, gripNow, braking,
  };
}
