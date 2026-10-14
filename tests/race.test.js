import { createRace, updateRace } from '../src/sim/race.js';

const L = 800;

function setup(playerIndex = 0) {
  const race = createRace({ carCount: 3, length: L, laps: 3, sectors: 8, countdown: 3, playerIndex });
  const tracking = [{ s: 790, along: 0 }, { s: 780, along: 0 }, { s: 770, along: 0 }];
  updateRace(race, tracking, 3);
  return { race, tracking };
}

// Moves car i by `distance` metres (signed) in 5 m steps of 0.1 s each.
function drive(ctx, i, distance, along = Math.sign(distance) * 50) {
  const step = Math.sign(distance) * 5;
  for (let k = 0; k < Math.abs(distance) / 5; k++) {
    ctx.tracking[i] = { s: (ctx.tracking[i].s + step + L) % L, along };
    updateRace(ctx.race, ctx.tracking, 0.1);
  }
}

test('countdown blocks racing', () => {
  const race = createRace({ carCount: 3, length: L, laps: 3, sectors: 8, countdown: 3, playerIndex: 0 });
  const tracking = [{ s: 790, along: 0 }, { s: 780, along: 0 }, { s: 770, along: 0 }];
  updateRace(race, tracking, 2.9);
  expect(race.phase).toBe('countdown');
  expect(race.time).toBe(0);
  updateRace(race, tracking, 0.1);
  expect(race.phase).toBe('racing');
});

test('first crossing from the grid starts lap 1 without completing a lap', () => {
  const ctx = setup();
  drive(ctx, 0, 15);
  expect(ctx.race.cars[0].lap).toBe(1);
  expect(ctx.race.cars[0].lapTimes).toEqual([]);
});

test('a full lap through all sectors completes a lap', () => {
  const ctx = setup();
  drive(ctx, 0, 15);
  drive(ctx, 0, L);
  const c = ctx.race.cars[0];
  expect(c.lapTimes.length).toBe(1);
  expect(c.bestLap).toBeGreaterThan(0);
  expect(c.lap).toBe(2);
});

test('reversing over the line and back does not count', () => {
  const ctx = setup();
  drive(ctx, 0, 20); // s = 10, lap 1
  drive(ctx, 0, -20);
  drive(ctx, 0, 20);
  expect(ctx.race.cars[0].lap).toBe(1);
  expect(ctx.race.cars[0].lapTimes).toEqual([]);
});

test('forth-and-back after a valid lap does not double count', () => {
  const ctx = setup();
  drive(ctx, 0, 15);
  drive(ctx, 0, L);
  drive(ctx, 0, -20);
  drive(ctx, 0, 20);
  expect(ctx.race.cars[0].lapTimes.length).toBe(1);
  expect(ctx.race.cars[0].lap).toBe(2);
});

test('reversing from the grid never credits a lap', () => {
  const ctx = setup();
  drive(ctx, 0, -190, -5);
  const c = ctx.race.cars[0];
  expect(c.lap).toBe(0);
  expect(c.progress).toBeLessThan(0);
  expect(c.wrongWay).toBe(true);
  expect(ctx.race.order[ctx.race.order.length - 1]).toBe(0);
});

test('wrongWay clears immediately when moving forward', () => {
  const ctx = setup();
  drive(ctx, 0, -60, -5);
  expect(ctx.race.cars[0].wrongWay).toBe(true);
  drive(ctx, 0, 5, 5);
  expect(ctx.race.cars[0].wrongWay).toBe(false);
});

test('positions order by progress', () => {
  const ctx = setup();
  drive(ctx, 1, 30);
  drive(ctx, 2, 100);
  expect(ctx.race.order).toEqual([2, 1, 0]);
});

test('finishing lap 3 marks the car finished', () => {
  const ctx = setup(2);
  drive(ctx, 0, 15);
  drive(ctx, 0, 3 * L);
  expect(ctx.race.cars[0].finished).toBe(true);
  expect(ctx.race.cars[0].finishTime).toBeGreaterThan(0);
  expect(ctx.race.phase).toBe('racing');
});

test('player finishing ends the race', () => {
  const ctx = setup(0);
  drive(ctx, 1, 25);
  drive(ctx, 1, L);
  drive(ctx, 0, 15);
  drive(ctx, 0, 3 * L);
  const { race } = ctx;
  expect(race.phase).toBe('finished');
  expect(race.results.length).toBe(3);
  const times = race.results.map((r) => r.time);
  expect([...times].sort((a, b) => a - b)).toEqual(times);
  const player = race.results.find((r) => r.index === 0);
  expect(player.estimated).toBe(false);
  for (const r of race.results.filter((r) => r.index !== 0)) {
    expect(r.estimated).toBe(true);
    expect(r.time).toBeGreaterThan(player.time);
  }
});

test('lap tracking continues for unfinished cars after the race ends', () => {
  const ctx = setup(0);
  drive(ctx, 0, 15);
  drive(ctx, 0, 3 * L);
  expect(ctx.race.phase).toBe('finished');
  drive(ctx, 1, 25);
  drive(ctx, 1, 3 * L);
  expect(ctx.race.cars[1].finished).toBe(true);
  expect(ctx.race.phase).toBe('finished');
});
