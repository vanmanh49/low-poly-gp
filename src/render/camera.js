import * as THREE from 'three';

const BACK = 9, UP = 4, AHEAD = 6;

function wrapAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

// Chase camera: distance to the car is fixed; only the viewing heading is
// smoothed, so the camera never falls behind at speed but swings softly.
export function createChaseCamera() {
  const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 1500);
  const look = new THREE.Vector3();
  let heading = 0;

  function place(pose) {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    camera.position.set(pose.x - fx * BACK, UP, pose.z - fz * BACK);
    look.set(pose.x + fx * AHEAD, 1, pose.z + fz * AHEAD);
    camera.lookAt(look);
  }

  return {
    camera,
    reset(pose) {
      heading = pose.heading;
      place(pose);
    },
    update(pose, dt) {
      heading += wrapAngle(pose.heading - heading) * (1 - Math.exp(-6 * dt));
      place(pose);
      const fov = 65 + 10 * Math.min(1, Math.abs(pose.speed) / 50);
      if (Math.abs(fov - camera.fov) > 0.05) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    },
    setAspect(a) {
      camera.aspect = a;
      camera.updateProjectionMatrix();
    },
  };
}
