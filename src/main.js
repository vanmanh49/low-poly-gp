import { PARAMS } from './sim/params.js';
import { createRng } from './sim/rng.js';
import { createTrack } from './sim/track.js';
import { createWorld } from './sim/world.js';
import { TRACK01 } from './data/track01.js';
import { CARS } from './data/cars.js';
import { advance } from './loop.js';
import { createKeyboard } from './input/keyboard.js';
import { isWebGLAvailable, createScene } from './render/scene.js';
import { buildTrackMesh } from './render/trackMesh.js';
import { createCarMesh } from './render/carMesh.js';
import { createChaseCamera } from './render/camera.js';
import { createHud } from './ui/hud.js';
import { createMinimap } from './ui/minimap.js';

const app = document.getElementById('app');

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}
const lerpPose = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading: lerpAngle(a.heading, b.heading, t),
  steer: b.steer, speed: b.speed, vLateral: b.vLateral, braking: b.braking,
});

function startGame() {
  const track = createTrack(TRACK01);
  const view = createScene(app);
  view.scene.add(buildTrackMesh(track, createRng(1234)));
  const carMeshes = CARS.map((c, i) => createCarMesh(c.color, i + 1));
  carMeshes.forEach((m) => view.scene.add(m.group));
  const chase = createChaseCamera();
  chase.setAspect(view.aspect());
  view.onResize((a) => chase.setAspect(a));
  const keyboard = createKeyboard(window);
  const minimap = createMinimap(track, CARS.map((c) => c.color), PARAMS.playerIndex);
  const hud = createHud(document.body, { minimap });

  // 'start' → 'race' → 'results'; R from race or results starts over.
  let state = 'start';
  let world, prev, acc = 0, fast = 1;
  let assistOn = true; // carried across restarts

  function newRace({ autopilotPlayer = false } = {}) {
    world = createWorld({ track, seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0, autopilotPlayer, assist: assistOn });
    prev = world.snapshot().cars;
    acc = 0;
    chase.reset(prev[PARAMS.playerIndex]);
    hud.hide();
    state = 'race';
  }

  newRace();
  state = 'start';
  hud.showStart();

  keyboard.onPress('Enter', () => { if (state === 'start') newRace(); });
  keyboard.onPress('KeyR', () => { if (state !== 'start') newRace(); });
  keyboard.onPress('KeyH', () => {
    assistOn = !assistOn;
    world.setAssist(assistOn);
  });
  hud.onRestart(() => newRace());

  // Slow orbit around the grid behind the start screen.
  const grid = track.sampleAt(track.length - 16);
  function orbit(t) {
    const a = t * 0.00012;
    chase.camera.position.set(grid.x + Math.sin(a) * 38, 16, grid.z + Math.cos(a) * 38);
    chase.camera.lookAt(grid.x, 0, grid.z);
  }

  let last = performance.now();
  function frame(now) {
    const frameDt = Math.min((now - last) / 1000, 0.25);
    last = now;

    const r = advance(acc, frameDt, PARAMS.dt);
    acc = r.acc;
    if (state !== 'start') {
      for (let i = 0; i < r.steps * fast; i++) {
        prev = world.snapshot().cars;
        world.step(keyboard.input(), PARAMS.dt);
      }
    }

    const snap = world.snapshot();
    const poses = snap.cars.map((c, i) => lerpPose(prev[i], c, state === 'start' ? 1 : r.alpha));
    poses.forEach((p, i) => carMeshes[i].update(p, frameDt));
    const player = poses[PARAMS.playerIndex];

    if (state === 'start') {
      orbit(now);
    } else {
      chase.update(player, frameDt);
    }
    view.followSun(player.x, player.z);

    if (state === 'race') {
      hud.update(snap);
      if (snap.phase === 'finished') {
        state = 'results';
        hud.showResults(snap.results, CARS, snap.playerIndex);
      }
    }
    view.render(chase.camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  if (import.meta.env.DEV) {
    window.__game = {
      get world() { return world; },
      get state() { return state; },
      scene: view.scene,
      autopilot: () => newRace({ autopilotPlayer: true }),
      set fast(n) { fast = n; },
    };
  }
}

if (isWebGLAvailable()) {
  startGame();
} else {
  app.textContent = "Your browser doesn't support WebGL, so the game can't run here.";
  app.style.cssText = 'font: 18px system-ui, sans-serif; padding: 24px; color: #111;';
}
