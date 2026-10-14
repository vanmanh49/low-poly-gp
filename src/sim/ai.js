// AI driver: pure-pursuit steering along a personal racing line, plus
// a braking-envelope speed controller, simple avoidance and stuck recovery.
import { PARAMS } from './params.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function wrapAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function createDriver(skill, rng, lineOffsetMax = PARAMS.ai.lineOffsetMax) {
  const lineOffset = (rng() * 2 - 1) * lineOffsetMax;
  return { skill, lineOffset, offsetNow: lineOffset, stuckTime: 0, recoverLeft: 0, speedScale: 1 };
}

const lookahead = (speed, pa) => pa.lookaheadBase + pa.lookaheadTime * Math.max(speed, 0);

// Fastest speed now that still lets the car brake down to every corner ahead.
export function targetSpeed(s, speed, track, driver, pa, pc) {
  const pace = (0.86 + 0.12 * driver.skill) * driver.speedScale;
  const window = (speed * speed) / (2 * pa.brakeDecel) + lookahead(speed, pa);
  const start = Math.floor((((s % track.length) + track.length) % track.length) / track.spacing);
  let target = pc.maxSpeed * pace;
  for (let k = 0; k * track.spacing <= window; k++) {
    const curv = Math.abs(track.curv[(start + k) % track.count]);
    const corner = Math.sqrt(pa.maxLatAccel / Math.max(curv, 1e-4)) * pace;
    const d = Math.max(0, k * track.spacing - pa.lookaheadBase);
    target = Math.min(target, Math.sqrt(corner * corner + 2 * pa.brakeDecel * d));
  }
  return target;
}

function updateAvoidance(car, driver, track, others, pa, dt) {
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  let blocker = null;
  for (const o of others) {
    const dx = o.x - car.x, dz = o.z - car.z;
    const ahead = dx * fx + dz * fz, lat = dx * fz - dz * fx; // lat > 0: other car is to our left
    if (ahead > 0 && ahead < pa.avoidAhead && Math.abs(lat) < pa.avoidLateral) {
      if (!blocker || ahead < blocker.ahead) blocker = { ahead, lat };
    }
  }
  const limit = track.halfWidth - 1.5;
  let desired = driver.lineOffset;
  if (blocker) {
    desired = driver.lineOffset + (blocker.lat >= 0 ? -pa.avoidShift : pa.avoidShift);
    if (Math.abs(desired) > limit) desired = driver.lineOffset + (blocker.lat >= 0 ? pa.avoidShift : -pa.avoidShift);
    desired = clamp(desired, -limit, limit);
  }
  driver.offsetNow += (desired - driver.offsetNow) * (1 - Math.exp(-dt / 0.5));
  return blocker !== null;
}

export function aiInput(car, proj, driver, track, others, pa, pc, dt) {
  const speed = car.vForward;
  const blocked = updateAvoidance(car, driver, track, others, pa, dt);

  const p = track.sampleAt(proj.s + lookahead(speed, pa));
  const tx = p.x + p.nx * driver.offsetNow, tz = p.z + p.nz * driver.offsetNow;
  const angle = wrapAngle(Math.atan2(tx - car.x, tz - car.z) - car.heading);
  const steer = clamp(angle * pa.steerGain, -1, 1);

  if (driver.recoverLeft > 0) {
    driver.recoverLeft -= dt;
    return { throttle: -1, steer: -steer, handbrake: false };
  }
  if (Math.abs(speed) < pa.stuckSpeed) {
    driver.stuckTime += dt;
    if (driver.stuckTime >= pa.stuckTime) {
      driver.stuckTime = 0;
      driver.recoverLeft = pa.recoverTime;
    }
  } else {
    driver.stuckTime = 0;
  }

  let throttle = clamp((targetSpeed(proj.s, speed, track, driver, pa, pc) - speed) / 5, -1, 1);
  if (blocked) throttle = Math.min(throttle, 0.7);
  return { throttle, steer, handbrake: false };
}
