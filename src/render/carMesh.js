import * as THREE from 'three';
import { PARAMS } from '../sim/params.js';

const WHEEL_RADIUS = 0.38;
const BODY_WIDTH = 1.9;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Side profiles as [z, y] points (z forward). Extruded across the car's width.
const BODY_PROFILE = [
  [-2.2, 0.28], [1.95, 0.28], [2.25, 0.36], [2.18, 0.52], [1.0, 0.72],
  [-0.2, 0.8], [-1.9, 0.84], [-2.2, 0.8],
];
const CABIN_PROFILE = [
  [-1.55, 0.78], [0.75, 0.74], [0.05, 1.22], [-1.0, 1.26], [-1.6, 0.98],
];

// Extrudes a [z, y] profile `width` wide, centred on x = 0, with soft edges.
function profileGeometry(profile, width, bevel) {
  const shape = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2,
  });
  // Shape x → car z, extrusion depth → car x.
  g.rotateY(-Math.PI / 2);
  g.translate((width - 2 * bevel) / 2, 0, 0);
  g.computeVertexNormals();
  return g;
}

function mesh(geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function numberTexture(number) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f7f7f7';
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), 32, 35);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A dark stripe on light paint, a white stripe on dark paint.
function stripeColor(color) {
  const c = new THREE.Color(color);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b > 0.45 ? 0x1c1c1c : 0xf4f4f4;
}

// Local +z is forward, so rotation.y = heading matches the sim convention.
export function createCarMesh(color, number) {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.15 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x18202c, roughness: 0.15, metalness: 0.5 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
  const stripe = new THREE.MeshStandardMaterial({ color: stripeColor(color), roughness: 0.4 });

  const body = new THREE.Group();
  body.add(mesh(profileGeometry(BODY_PROFILE, BODY_WIDTH, 0.08), paint));
  body.add(mesh(profileGeometry(CABIN_PROFILE, 1.5, 0.06), glass));
  // Racing stripe: a narrow copy of the body profile, nudged up so only its top shows.
  body.add(mesh(profileGeometry(BODY_PROFILE, 0.45, 0.08), stripe, 0, 0.012, 0));

  // Flipped so the number reads upright from the chase camera behind the car.
  const roofDisc = new THREE.CircleGeometry(0.34, 24).rotateZ(Math.PI).rotateX(-Math.PI / 2);
  const roof = new THREE.Mesh(roofDisc, new THREE.MeshBasicMaterial({ map: numberTexture(number) }));
  roof.position.set(0, 1.33, -0.48);
  body.add(roof);

  // Front splitter and rear wing on struts.
  body.add(mesh(new THREE.BoxGeometry(1.9, 0.06, 0.35), trim, 0, 0.2, 2.2));
  body.add(mesh(new THREE.BoxGeometry(1.95, 0.07, 0.42), paint, 0, 1.18, -1.98));
  for (const x of [-0.6, 0.6]) body.add(mesh(new THREE.BoxGeometry(0.08, 0.36, 0.18), trim, x, 0.98, -1.98));
  for (const x of [-1.0, 1.0]) body.add(mesh(new THREE.BoxGeometry(0.06, 0.3, 0.46), paint, x, 1.18, -1.98));

  // Lights: headlights always on; tail lights brighten under braking.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6d5 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0x6e0e0e });
  for (const x of [-0.62, 0.62]) {
    const head = mesh(new THREE.BoxGeometry(0.42, 0.1, 0.06), headMat, x, 0.47, 2.27);
    head.rotation.x = -0.35;
    head.castShadow = false;
    body.add(head);
    const tail = mesh(new THREE.BoxGeometry(0.48, 0.12, 0.05), tailMat, x, 0.66, -2.3);
    tail.castShadow = false;
    body.add(tail);
  }
  group.add(body);

  const tyre = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.3, 16);
  tyre.rotateZ(Math.PI / 2);
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const rim = new THREE.CylinderGeometry(0.22, 0.22, 0.32, 8);
  rim.rotateZ(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.3, metalness: 0.7 });
  const spinners = [], frontPivots = [];
  for (const [x, z, front] of [[-0.98, 1.35, true], [0.98, 1.35, true], [-0.98, -1.35, false], [0.98, -1.35, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, WHEEL_RADIUS, z);
    const spinner = new THREE.Group();
    // The 8-sided rim makes the spin visible.
    spinner.add(mesh(tyre, tyreMat), mesh(rim, rimMat));
    pivot.add(spinner);
    group.add(pivot);
    spinners.push(spinner);
    if (front) frontPivots.push(pivot);
  }

  return {
    group,
    update(pose, frameDt) {
      group.position.set(pose.x, 0, pose.z);
      group.rotation.y = pose.heading;
      for (const p of frontPivots) p.rotation.y = pose.steer * PARAMS.car.maxSteer;
      for (const s of spinners) s.rotation.x += (pose.speed * frameDt) / WHEEL_RADIUS;
      body.rotation.z = clamp(-pose.vLateral * 0.02, -0.12, 0.12);
      tailMat.color.setHex(pose.braking ? 0xff2a2a : 0x6e0e0e);
    },
  };
}
