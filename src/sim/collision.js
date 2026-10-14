// Approximate collisions: every car is a circle of `radius`.
import { worldVelocity, setWorldVelocity } from './car.js';

// Keeps the car inside the walls. Mutates `car`; returns true if it hit.
export function resolveWall(car, proj, track, radius, pc) {
  const limit = track.wallLimit - radius;
  if (Math.abs(proj.lateral) <= limit) return false;

  const side = Math.sign(proj.lateral);
  const n = track.sampleAt(proj.s);
  // A couple of passes so the re-projected lateral settles on curves.
  let p = proj;
  for (let k = 0; k < 3 && Math.abs(p.lateral) > limit; k++) {
    const push = p.lateral - side * limit;
    const m = track.sampleAt(p.s);
    car.x -= m.nx * push;
    car.z -= m.nz * push;
    p = track.project(car.x, car.z, p.index);
  }

  const ox = n.nx * side, oz = n.nz * side;
  let { vx, vz } = worldVelocity(car);
  const vn = vx * ox + vz * oz;
  if (vn > 0) {
    vx -= (1 + pc.wallRestitution) * vn * ox;
    vz -= (1 + pc.wallRestitution) * vn * oz;
    vx *= 1 - pc.wallSpeedPenalty;
    vz *= 1 - pc.wallSpeedPenalty;
    setWorldVelocity(car, vx, vz);
  }
  return true;
}

// Pushes overlapping cars apart and exchanges an equal-mass impulse. Mutates the cars.
export function resolveCars(cars, radius, pc) {
  const minDist = 2 * radius;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.x - a.x, dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d >= minDist) continue;
      const nx = d > 1e-9 ? dx / d : 1, nz = d > 1e-9 ? dz / d : 0;
      const half = (minDist - d) / 2;
      a.x -= nx * half; a.z -= nz * half;
      b.x += nx * half; b.z += nz * half;

      const va = worldVelocity(a), vb = worldVelocity(b);
      const vRelN = (va.vx - vb.vx) * nx + (va.vz - vb.vz) * nz;
      if (vRelN <= 0) continue;
      const jImp = ((1 + pc.carRestitution) * vRelN) / 2;
      setWorldVelocity(a, va.vx - jImp * nx, va.vz - jImp * nz);
      setWorldVelocity(b, vb.vx + jImp * nx, vb.vz + jImp * nz);
    }
  }
}
