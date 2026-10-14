// Keyboard state → normalised driving input. Positive steer = left.
const BINDINGS = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'handbrake',
};
const NO_SCROLL = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export function createKeyboard(target = window) {
  const held = new Set();
  const pressHandlers = new Map();

  const onDown = (e) => {
    if (NO_SCROLL.has(e.code)) e.preventDefault();
    if (BINDINGS[e.code]) held.add(BINDINGS[e.code]);
    if (!e.repeat) (pressHandlers.get(e.code) ?? []).forEach((fn) => fn());
  };
  const onUp = (e) => {
    if (BINDINGS[e.code]) held.delete(BINDINGS[e.code]);
  };
  const onBlur = () => held.clear();

  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);
  target.addEventListener('blur', onBlur);

  const axis = (pos, neg) => (held.has(pos) ? 1 : 0) - (held.has(neg) ? 1 : 0);

  return {
    input: () => ({ throttle: axis('up', 'down'), steer: axis('left', 'right'), handbrake: held.has('handbrake') }),
    onPress(code, fn) {
      if (!pressHandlers.has(code)) pressHandlers.set(code, []);
      pressHandlers.get(code).push(fn);
    },
    dispose() {
      target.removeEventListener('keydown', onDown);
      target.removeEventListener('keyup', onUp);
      target.removeEventListener('blur', onBlur);
    },
  };
}
