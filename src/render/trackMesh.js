import * as THREE from 'three';

const COLORS = {
  grass: 0x5d9e3c, runoff: 0x71b04c, asphalt: 0x3b3e44, line: 0xf2f2f2,
  kerbRed: 0xd62828, kerbWhite: 0xf5f5f5, wall: 0xe9e9e9, wallRed: 0xc1121f,
  trunk: 0x6b4423, leaves: 0x2f7d32, cone: 0xff7b00,
};
const KERB_CURVATURE = 0.02;

// A flat strip between lateral offsets `inner` and `outer`. `colorAt(i)` returns
// a colour for the quad starting at sample i, or null to leave a gap.
function ribbon(track, inner, outer, y, colorAt) {
  const pos = [], col = [], c = new THREE.Color();
  for (let i = 0; i < track.count; i++) {
    const hex = colorAt(i);
    if (hex === null) continue;
    const j = (i + 1) % track.count;
    const corner = (k, off) => {
      const nx = track.tzs[k], nz = -track.txs[k];
      return [track.xs[k] + nx * off, y, track.zs[k] + nz * off];
    };
    const a = corner(i, inner), b = corner(i, outer), d = corner(j, inner), e = corner(j, outer);
    pos.push(...a, ...b, ...e, ...a, ...e, ...d);
    c.setHex(hex);
    for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// Vertical barrier strip at lateral offset `off`, striped every 4 m.
function wall(track, off, height) {
  const pos = [], col = [], c = new THREE.Color();
  for (let i = 0; i < track.count; i++) {
    const j = (i + 1) % track.count;
    const at = (k, y) => [track.xs[k] + track.tzs[k] * off, y, track.zs[k] - track.txs[k] * off];
    const a = at(i, 0), b = at(i, height), d = at(j, 0), e = at(j, height);
    pos.push(...a, ...b, ...e, ...a, ...e, ...d);
    c.setHex(Math.floor(track.ss[i] / 4) % 2 ? COLORS.wall : COLORS.wallRed);
    for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function chequerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 2; y++) {
      ctx.fillStyle = (x + y) % 2 ? '#111' : '#fafafa';
      ctx.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function startLine(track) {
  const group = new THREE.Group();
  const p = track.sampleAt(0);
  const heading = Math.atan2(p.tx, p.tz);
  const w = track.halfWidth * 2;

  const line = new THREE.Mesh(new THREE.PlaneGeometry(w, 2), new THREE.MeshLambertMaterial({ map: chequerTexture() }));
  line.rotation.x = -Math.PI / 2;
  line.position.y = 0.04;
  group.add(line);

  // Gantry over the line.
  const postMat = new THREE.MeshLambertMaterial({ color: 0x333a44 });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), postMat);
    post.position.set(side * (track.halfWidth + 1.5), 3.5, 0);
    post.castShadow = true;
    group.add(post);
  }
  const banner = new THREE.Mesh(new THREE.BoxGeometry(w + 3.5, 1.4, 0.4), new THREE.MeshLambertMaterial({ map: chequerTexture() }));
  banner.position.y = 7;
  banner.castShadow = true;
  group.add(banner);

  group.position.set(p.x, 0, p.z);
  group.rotation.y = heading;
  return group;
}

function scenery(track, rng) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < track.count; i++) {
    minX = Math.min(minX, track.xs[i]); maxX = Math.max(maxX, track.xs[i]);
    minZ = Math.min(minZ, track.zs[i]); maxZ = Math.max(maxZ, track.zs[i]);
  }
  const margin = 140, clear = track.wallLimit + 3;
  const trees = [];
  for (let tries = 0; trees.length < 300 && tries < 5000; tries++) {
    const x = minX - margin + rng() * (maxX - minX + 2 * margin);
    const z = minZ - margin + rng() * (maxZ - minZ + 2 * margin);
    if (Math.abs(track.project(x, z).lateral) < clear) continue;
    trees.push({ x, z, s: 0.7 + rng() * 0.9 });
  }

  const group = new THREE.Group();
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.3, 0.4, 2, 6), new THREE.MeshLambertMaterial({ color: COLORS.trunk }), trees.length);
  const leaves = new THREE.InstancedMesh(
    new THREE.ConeGeometry(2.2, 5, 7), new THREE.MeshLambertMaterial({ color: COLORS.leaves, flatShading: true }), trees.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  trees.forEach((t, i) => {
    sc.setScalar(t.s);
    m.compose(v.set(t.x, 1 * t.s, t.z), q, sc);
    trunks.setMatrixAt(i, m);
    m.compose(v.set(t.x, 4.2 * t.s, t.z), q, sc);
    leaves.setMatrixAt(i, m);
  });
  trunks.castShadow = leaves.castShadow = true;
  group.add(trunks, leaves);

  // Cones just outside the wall on the outside of tight corners.
  const cones = [];
  for (let i = 0; i < track.count; i += 6) {
    const k = track.curv[i];
    if (Math.abs(k) < KERB_CURVATURE * 1.5) continue;
    const off = -Math.sign(k) * (track.wallLimit + 1.2);
    cones.push([track.xs[i] + track.tzs[i] * off, track.zs[i] - track.txs[i] * off]);
  }
  const coneMesh = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.35, 0.9, 8), new THREE.MeshLambertMaterial({ color: COLORS.cone }), Math.max(cones.length, 1));
  coneMesh.count = cones.length;
  cones.forEach(([x, z], i) => coneMesh.setMatrixAt(i, m.compose(v.set(x, 0.45, z), q, sc.setScalar(1))));
  coneMesh.castShadow = true;
  group.add(coneMesh);
  return group;
}

export function buildTrackMesh(track, rng) {
  const group = new THREE.Group();
  const flat = (geometry) => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    mesh.receiveShadow = true;
    return mesh;
  };
  const hw = track.halfWidth;

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshLambertMaterial({ color: COLORS.grass }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  group.add(flat(ribbon(track, -track.wallLimit, track.wallLimit, 0.01, () => COLORS.runoff)));
  group.add(flat(ribbon(track, -hw, hw, 0.02, () => COLORS.asphalt)));
  group.add(flat(ribbon(track, -0.15, 0.15, 0.03, (i) => (Math.floor(track.ss[i] / 5) % 2 ? null : COLORS.line))));
  group.add(flat(ribbon(track, hw - 0.25, hw - 0.1, 0.03, () => COLORS.line)));
  group.add(flat(ribbon(track, -hw + 0.1, -hw + 0.25, 0.03, () => COLORS.line)));

  const kerb = (i) => {
    if (Math.abs(track.curv[i]) < KERB_CURVATURE) return null;
    return Math.floor(track.ss[i] / 2) % 2 ? COLORS.kerbRed : COLORS.kerbWhite;
  };
  group.add(flat(ribbon(track, hw, hw + 1.2, 0.025, kerb)));
  group.add(flat(ribbon(track, -hw - 1.2, -hw, 0.025, kerb)));

  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(wall(track, side * track.wallLimit, 1.1),
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    w.castShadow = w.receiveShadow = true;
    group.add(w);
  }

  group.add(startLine(track));
  group.add(scenery(track, rng));
  return group;
}
