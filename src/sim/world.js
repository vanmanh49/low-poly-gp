// Owns all simulation state and advances it one fixed step at a time.
import { PARAMS } from './params.js';
import { createRng } from './rng.js';
import { createCar, stepCar, worldVelocity, speedOf } from './car.js';
import { resolveWall, resolveCars } from './collision.js';
import { createRace, updateRace } from './race.js';
import { createDriver, aiInput } from './ai.js';
import { assistSteer } from './assist.js';

const CAR_COUNT = 5;
const IDLE = { throttle: 0, steer: 0, handbrake: false };

function gridCar(track, i, grid) {
  const row = Math.floor(i / 2), col = i % 2;
  const s = track.length - grid.spacing * (row + 1) - (col ? grid.spacing / 2 : 0);
  const lateral = col ? -grid.lateral : grid.lateral;
  const p = track.sampleAt(s);
  return createCar({ x: p.x + p.nx * lateral, z: p.z + p.nz * lateral, heading: Math.atan2(p.tx, p.tz) });
}

export function createWorld({ track, seed, params = PARAMS, autopilotPlayer = false, assist = true }) {
  let assistOn = assist;
  const rng = createRng(seed);
  const pi = params.playerIndex;
  let cars = Array.from({ length: CAR_COUNT }, (_, i) => gridCar(track, i, params.grid));
  const drivers = cars.map((_, i) => {
    if (i !== pi) return createDriver(params.ai.skills[i], rng, params.ai.lineOffsetMax);
    return autopilotPlayer ? createDriver(params.ai.autopilotSkill, rng, params.ai.lineOffsetMax) : null;
  });
  const race = createRace({
    carCount: CAR_COUNT, length: track.length, laps: params.laps, sectors: params.sectors,
    countdown: params.countdown, playerIndex: pi,
  });
  let projs = cars.map((c) => track.project(c.x, c.z));

  function inputFor(i) {
    if (race.phase === 'countdown') return IDLE;
    if (race.cars[i].finished) {
      drivers[i] ??= createDriver(params.ai.autopilotSkill, rng, 0);
      drivers[i].speedScale = params.ai.cooldownSpeed;
    }
    return null;
  }

  const world = {
    track, cars, drivers, race,

    step(playerInput, dt) {
      const inputs = cars.map((car, i) => {
        const fixed = inputFor(i);
        if (fixed) return fixed;
        if (!drivers[i]) {
          // The assist only fills in when the player isn't steering or drifting.
          if (!assistOn || playerInput.steer !== 0 || playerInput.handbrake) return playerInput;
          return { ...playerInput, steer: assistSteer(car, projs[i], track, params.assist, params.car) };
        }
        const others = cars.filter((_, k) => k !== i);
        return aiInput(car, projs[i], drivers[i], track, others, params.ai, params.car, dt);
      });

      cars = cars.map((car, i) => {
        car.surface = Math.abs(projs[i].lateral) > track.halfWidth ? 'grass' : 'road';
        return stepCar(car, inputs[i], params.car, dt);
      });
      world.cars = cars;

      resolveCars(cars, params.car.radius, params.collision);
      projs = cars.map((car, i) => {
        const p = track.project(car.x, car.z, projs[i].index);
        return resolveWall(car, p, track, params.car.radius, params.collision) ? track.project(car.x, car.z, p.index) : p;
      });

      updateRace(race, cars.map((car, i) => {
        const t = track.sampleAt(projs[i].s);
        const { vx, vz } = worldVelocity(car);
        return { s: projs[i].s, along: vx * t.tx + vz * t.tz };
      }), dt);
    },

    setAssist(on) {
      assistOn = on;
    },

    snapshot() {
      const rc = race.cars[pi], player = cars[pi];
      return {
        phase: race.phase,
        countdownLeft: race.countdownLeft,
        time: race.time,
        playerIndex: pi,
        order: [...race.order],
        results: race.results,
        cars: cars.map((c) => ({
          x: c.x, z: c.z, heading: c.heading, steer: c.steer, speed: c.vForward, vLateral: c.vLateral, braking: c.braking,
        })),
        player: {
          position: race.order.indexOf(pi) + 1,
          lap: Math.min(Math.max(rc.lap, 1), params.laps),
          laps: params.laps,
          lapTime: rc.lap >= 1 && !rc.finished ? race.time - rc.lapStart : 0,
          bestLap: rc.bestLap,
          speedKmh: speedOf(player) * 3.6,
          wrongWay: rc.wrongWay,
          assist: assistOn,
        },
      };
    },
  };
  return world;
}
