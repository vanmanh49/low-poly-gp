// Fixed-timestep accumulator. Clamping the frame delta keeps a long
// background-tab pause from turning into thousands of catch-up steps.
export function advance(acc, frameDt, dt, maxFrame = 0.25) {
  acc += Math.min(Math.max(frameDt, 0), maxFrame);
  let steps = 0;
  while (acc >= dt - 1e-12) {
    acc -= dt;
    steps++;
  }
  acc = Math.max(acc, 0);
  return { steps, acc, alpha: acc / dt };
}
