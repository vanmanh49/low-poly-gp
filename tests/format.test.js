import { formatTime, ordinal } from '../src/ui/format.js';

test('formatTime', () => {
  expect(formatTime(65.4321)).toBe('1:05.432');
  expect(formatTime(0)).toBe('0:00.000');
  expect(formatTime(599.9999)).toBe('9:59.999');
  expect(formatTime(null)).toBe('--:--.---');
});

test('ordinal', () => {
  expect([1, 2, 3, 4, 5, 11, 12, 13, 22].map(ordinal)).toEqual(
    ['1st', '2nd', '3rd', '4th', '5th', '11th', '12th', '13th', '22nd']);
});
