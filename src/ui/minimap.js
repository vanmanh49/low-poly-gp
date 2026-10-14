// Top-down track map. Orientation matches the 3D world seen from above:
// +x to the right, +z down the screen.

export function mapTransform(xs, zs, size, pad) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < xs.length; i++) {
    minX = Math.min(minX, xs[i]); maxX = Math.max(maxX, xs[i]);
    minZ = Math.min(minZ, zs[i]); maxZ = Math.max(maxZ, zs[i]);
  }
  const span = Math.max(maxX - minX, maxZ - minZ) || 1;
  const scale = (size - 2 * pad) / span;
  const offU = pad + (size - 2 * pad - (maxX - minX) * scale) / 2;
  const offV = pad + (size - 2 * pad - (maxZ - minZ) * scale) / 2;
  return (x, z) => [offU + (x - minX) * scale, offV + (z - minZ) * scale];
}

const SIZE = 180, PAD = 14;

export function createMinimap(track, colors, playerIndex) {
  const element = document.createElement('canvas');
  element.className = 'panel minimap';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  element.width = element.height = SIZE * dpr;
  const ctx = element.getContext('2d');
  const toMap = mapTransform(track.xs, track.zs, SIZE, PAD);

  // The track never changes, so draw it once and reuse the bitmap.
  const base = document.createElement('canvas');
  base.width = base.height = SIZE * dpr;
  const b = base.getContext('2d');
  b.scale(dpr, dpr);
  b.beginPath();
  for (let i = 0; i <= track.count; i++) {
    const [u, v] = toMap(track.xs[i % track.count], track.zs[i % track.count]);
    if (i === 0) b.moveTo(u, v); else b.lineTo(u, v);
  }
  b.lineJoin = 'round';
  b.strokeStyle = 'rgba(255,255,255,0.25)';
  b.lineWidth = 9;
  b.stroke();
  b.strokeStyle = 'rgba(255,255,255,0.85)';
  b.lineWidth = 3;
  b.stroke();
  const s0 = track.sampleAt(0), [lu, lv] = toMap(s0.x, s0.z);
  b.save();
  b.translate(lu, lv);
  b.rotate(Math.atan2(s0.tz, s0.tx));
  b.fillStyle = '#ffd60a';
  b.fillRect(-1.5, -7, 3, 14);
  b.restore();

  return {
    element,
    draw(cars) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, element.width, element.height);
      ctx.drawImage(base, 0, 0);
      ctx.scale(dpr, dpr);
      // Player last, so it sits on top.
      const order = cars.map((_, i) => i).filter((i) => i !== playerIndex).concat(playerIndex);
      for (const i of order) {
        const [u, v] = toMap(cars[i].x, cars[i].z);
        const me = i === playerIndex;
        ctx.beginPath();
        ctx.arc(u, v, me ? 5.5 : 4, 0, Math.PI * 2);
        ctx.fillStyle = colors[i];
        ctx.fill();
        ctx.lineWidth = me ? 2 : 1.25;
        ctx.strokeStyle = me ? '#ffffff' : 'rgba(0,0,0,0.6)';
        ctx.stroke();
      }
    },
  };
}
