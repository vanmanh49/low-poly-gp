// Steering assist for the player: when they aren't steering, gently follow the
// track at the car's current line. Limited authority; off when slow or facing backwards.
import { PARAMS } from './params.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function wrapAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

// Returns a steering input in [-maxSteer, maxSteer].
export function assistSteer(car, proj, track, pa, pc = PARAMS.car) {
  if (car.vForward < pa.minSpeed) return 0;
  const here = track.sampleAt(proj.s);
  if (Math.abs(wrapAngle(car.heading - Math.atan2(here.tx, here.tz))) > pa.maxHeadingError) return 0;

  // Aim at a point ahead at the same lateral offset (pulled back onto the road if off it).
  const lateral = clamp(proj.lateral, -(track.halfWidth - 1), track.halfWidth - 1);
  const ahead = track.sampleAt(proj.s + Math.max(pa.lookMin, car.vForward * pa.lookTime));
  const tx = ahead.x + ahead.nx * lateral, tz = ahead.z + ahead.nz * lateral;
  const want = wrapAngle(Math.atan2(tx - car.x, tz - car.z) - car.heading) * pa.gain;

  // Undo the steering response curve so small corrections aren't flattened to nothing.
  const input = Math.sign(want) * Math.abs(want) ** (1 / pc.steerCurve);
  return clamp(input, -pa.maxSteer, pa.maxSteer);
}
