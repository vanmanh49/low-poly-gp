// Race rules: countdown, sector checkpoints, laps, live positions, results.

export function createRace({ carCount, length, laps, sectors, countdown, playerIndex }) {
  const cars = Array.from({ length: carCount }, () => ({
    lap: 0, nextSector: 1, behindLine: true, lastS: null, lapStart: 0,
    lapTimes: [], bestLap: null, finished: false, finishTime: null,
    progress: 0, wrongWayTime: 0, wrongWay: false,
  }));
  return {
    phase: 'countdown', countdownLeft: countdown, time: 0,
    length, laps, sectors, playerIndex,
    cars, order: cars.map((_, i) => i), results: null,
  };
}

function updateCar(race, c, { s, along }, dt) {
  const { length: L, laps, sectors } = race;
  if (c.lastS !== null) {
    const ds = s - c.lastS;
    if (ds > L / 2) {
      c.behindLine = true; // went backwards over the line
    } else if (ds < -L / 2) {
      c.behindLine = false;
      if (c.lap === 0) {
        c.lap = 1;
        c.lapStart = race.time;
        c.nextSector = 1;
      } else if (c.nextSector === sectors && !c.finished) {
        const lapTime = race.time - c.lapStart;
        c.lapTimes.push(lapTime);
        c.bestLap = c.bestLap === null ? lapTime : Math.min(c.bestLap, lapTime);
        c.lapStart = race.time;
        c.nextSector = 1;
        if (c.lap === laps) {
          c.finished = true;
          c.finishTime = race.time;
        } else {
          c.lap++;
        }
      }
    }
  }
  c.lastS = s;

  const sector = Math.floor(s / (L / sectors));
  if (!c.behindLine && sector === c.nextSector) c.nextSector++;

  c.progress = c.finished
    ? laps * L
    : (Math.max(c.lap, 1) - 1) * L + s - (c.behindLine ? L : 0);

  c.wrongWayTime = along < -1 ? c.wrongWayTime + dt : 0;
  c.wrongWay = c.wrongWayTime > 1;
}

function computeResults(race) {
  const total = race.laps * race.length;
  return race.cars
    .map((c, index) => {
      if (c.finished) return { index, time: c.finishTime, bestLap: c.bestLap, estimated: false };
      const pace = Math.max(c.progress / Math.max(race.time, 1e-6), 1);
      return { index, time: race.time + (total - c.progress) / pace, bestLap: c.bestLap, estimated: true };
    })
    .sort((a, b) => a.time - b.time);
}

// tracking[i] = { s, along } for car i. Mutates `race`.
export function updateRace(race, tracking, dt) {
  if (race.phase === 'countdown') {
    race.countdownLeft -= dt;
    if (race.countdownLeft > 1e-9) {
      tracking.forEach((t, i) => { race.cars[i].lastS = t.s; });
      return;
    }
    race.phase = 'racing';
    race.time = Math.max(0, -race.countdownLeft);
    race.countdownLeft = 0;
  } else {
    race.time += dt;
  }

  tracking.forEach((t, i) => updateCar(race, race.cars[i], t, dt));

  race.order = race.cars
    .map((_, i) => i)
    .sort((a, b) => {
      const ca = race.cars[a], cb = race.cars[b];
      if (ca.finished && cb.finished) return ca.finishTime - cb.finishTime;
      if (ca.finished !== cb.finished) return ca.finished ? -1 : 1;
      return cb.progress - ca.progress;
    });

  if (race.phase === 'racing' && race.cars[race.playerIndex].finished) {
    race.phase = 'finished';
    race.results = computeResults(race);
  }
}
