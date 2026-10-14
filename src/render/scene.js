import * as THREE from 'three';

const SKY = 0x9fd3ff;

export function isWebGLAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 180, 650);

  scene.add(new THREE.HemisphereLight(0xe8f4ff, 0x4a6b3a, 1.3));
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 320 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const resizeHandlers = [];
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    resizeHandlers.forEach((fn) => fn(window.innerWidth / window.innerHeight));
  });

  return {
    renderer, scene, sun,
    // Keeps the shadow frustum centred on whatever the camera is following.
    followSun(x, z) {
      sun.position.set(x + 60, 110, z + 40);
      sun.target.position.set(x, 0, z);
    },
    render: (camera) => renderer.render(scene, camera),
    onResize: (fn) => resizeHandlers.push(fn),
    aspect: () => window.innerWidth / window.innerHeight,
  };
}
