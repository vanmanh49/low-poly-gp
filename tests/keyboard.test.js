import { createKeyboard } from '../src/input/keyboard.js';

const key = (type, code, repeat = false) => Object.assign(new Event(type, { cancelable: true }), { code, repeat });

function setup() {
  const target = new EventTarget();
  return { target, kb: createKeyboard(target) };
}

test('maps keys to input', () => {
  const { target, kb } = setup();
  target.dispatchEvent(key('keydown', 'KeyW'));
  target.dispatchEvent(key('keydown', 'ArrowLeft'));
  target.dispatchEvent(key('keydown', 'Space'));
  expect(kb.input()).toEqual({ throttle: 1, steer: 1, handbrake: true });
  target.dispatchEvent(key('keyup', 'KeyW'));
  target.dispatchEvent(key('keydown', 'ArrowDown'));
  target.dispatchEvent(key('keyup', 'ArrowLeft'));
  target.dispatchEvent(key('keydown', 'KeyD'));
  expect(kb.input()).toEqual({ throttle: -1, steer: -1, handbrake: true });
});

test('opposite keys cancel', () => {
  const { target, kb } = setup();
  ['KeyW', 'KeyS', 'KeyA', 'KeyD'].forEach((c) => target.dispatchEvent(key('keydown', c)));
  expect(kb.input()).toEqual({ throttle: 0, steer: 0, handbrake: false });
});

test('releases all keys on blur', () => {
  const { target, kb } = setup();
  target.dispatchEvent(key('keydown', 'KeyW'));
  target.dispatchEvent(key('keydown', 'KeyA'));
  target.dispatchEvent(new Event('blur'));
  expect(kb.input()).toEqual({ throttle: 0, steer: 0, handbrake: false });
});

test('onPress fires once per keydown, not on repeat', () => {
  const { target, kb } = setup();
  let n = 0;
  kb.onPress('KeyR', () => n++);
  target.dispatchEvent(key('keydown', 'KeyR'));
  target.dispatchEvent(key('keydown', 'KeyR', true));
  target.dispatchEvent(key('keydown', 'KeyR', true));
  expect(n).toBe(1);
});

test('prevents page scroll for arrows and Space', () => {
  const { target } = setup();
  const e = key('keydown', 'ArrowUp'), s = key('keydown', 'Space'), r = key('keydown', 'KeyR');
  [e, s, r].forEach((ev) => target.dispatchEvent(ev));
  expect(e.defaultPrevented).toBe(true);
  expect(s.defaultPrevented).toBe(true);
  expect(r.defaultPrevented).toBe(false);
});
