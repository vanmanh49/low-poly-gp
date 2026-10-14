// Closed spline track: sampled centreline with arc length, tangents,
// left normals and signed curvature (positive = left turn).

const SUBSTEPS = 40;

function catmullRom(p0, p1, p2, p3, u) {
  // Centripetal Catmull-Rom (alpha 0.5), Barry-Goldman form.
  const knot = (a, b) => Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])) || 1e-6;
  const t0 = 0, t1 = t0 + knot(p0, p1), t2 = t1 + knot(p1, p2), t3 = t2 + knot(p2, p3);
  const t = t1 + (t2 - t1) * u;
  const mix = (a, b, ta, tb) => {
    const w = (t - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
  };
  const a1 = mix(p0, p1, t0, t1), a2 = mix(p1, p2, t1, t2), a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2), b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

function wrapAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function createTrack({ points, halfWidth, runoff }) {
  const n = points.length;

  // Dense polyline through the spline, closed back to the start.
  const dense = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
    for (let k = 0; k < SUBSTEPS; k++) dense.push(catmullRom(p0, p1, p2, p3, k / SUBSTEPS));
  }
  dense.push(dense[0]);
  const denseS = [0];
  for (let i = 1; i < dense.length; i++) {
    denseS.push(denseS[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  }
  const length = denseS[denseS.length - 1];

  // Resample at ~1 m spacing.
  const count = Math.max(8, Math.round(length));
  const spacing = length / count;
  const xs = new Float64Array(count), zs = new Float64Array(count), ss = new Float64Array(count);
  let j = 0;
  for (let i = 0; i < count; i++) {
    const s = i * spacing;
    while (denseS[j + 1] < s) j++;
    const w = (s - denseS[j]) / (denseS[j + 1] - denseS[j] || 1);
    xs[i] = dense[j][0] + (dense[j + 1][0] - dense[j][0]) * w;
    zs[i] = dense[j][1] + (dense[j + 1][1] - dense[j][1]) * w;
    ss[i] = s;
  }

  const txs = new Float64Array(count), tzs = new Float64Array(count), heading = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const a = (i - 1 + count) % count, b = (i + 1) % count;
    const dx = xs[b] - xs[a], dz = zs[b] - zs[a], len = Math.hypot(dx, dz) || 1;
    txs[i] = dx / len;
    tzs[i] = dz / len;
    heading[i] = Math.atan2(txs[i], tzs[i]);
  }
  const raw = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    raw[i] = wrapAngle(heading[(i + 1) % count] - heading[(i - 1 + count) % count]) / (2 * spacing);
  }
  const curv = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let k = -2; k <= 2; k++) sum += raw[(i + k + count) % count];
    curv[i] = sum / 5;
  }

  const wrapS = (s) => ((s % length) + length) % length;

  function sampleAt(s) {
    const u = wrapS(s) / spacing;
    const i = Math.floor(u) % count, k = (i + 1) % count, w = u - Math.floor(u);
    let tx = txs[i] + (txs[k] - txs[i]) * w, tz = tzs[i] + (tzs[k] - tzs[i]) * w;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    return {
      x: xs[i] + (xs[k] - xs[i]) * w,
      z: zs[i] + (zs[k] - zs[i]) * w,
      tx, tz, nx: tz, nz: -tx,
      curvature: curv[i] + (curv[k] - curv[i]) * w,
    };
  }

  function nearestIndex(x, z, hint) {
    let best = -1, bestD = Infinity;
    const scan = (i) => {
      const d = (xs[i] - x) ** 2 + (zs[i] - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    };
    if (hint === undefined || hint === null) {
      for (let i = 0; i < count; i++) scan(i);
    } else {
      for (let o = -20; o <= 20; o++) scan((hint + o + count) % count);
    }
    return best;
  }

  function project(x, z, hint) {
    const i = nearestIndex(x, z, hint);
    let bestD = Infinity, bestS = 0, bestLat = 0;
    for (const a of [(i - 1 + count) % count, i]) {
      const b = (a + 1) % count;
      const ex = xs[b] - xs[a], ez = zs[b] - zs[a], el2 = ex * ex + ez * ez || 1;
      const t = Math.min(1, Math.max(0, ((x - xs[a]) * ex + (z - zs[a]) * ez) / el2));
      const fx = xs[a] + ex * t, fz = zs[a] + ez * t;
      const d = (x - fx) ** 2 + (z - fz) ** 2;
      if (d < bestD) {
        const el = Math.sqrt(el2);
        bestD = d;
        bestS = wrapS(ss[a] + t * spacing);
        bestLat = (x - fx) * (ez / el) + (z - fz) * (-ex / el);
      }
    }
    return { s: bestS, lateral: bestLat, index: i };
  }

  function maxCurvatureAhead(s, dist) {
    const start = Math.floor(wrapS(s) / spacing), steps = Math.ceil(dist / spacing);
    let m = 0;
    for (let k = 0; k <= steps; k++) m = Math.max(m, Math.abs(curv[(start + k) % count]));
    return m;
  }

  return {
    length, halfWidth, runoff, wallLimit: halfWidth + runoff, count, spacing,
    xs, zs, txs, tzs, curv, ss, sampleAt, project, maxCurvatureAhead,
  };
}
