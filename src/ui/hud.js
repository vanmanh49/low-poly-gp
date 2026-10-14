import './hud.css';
import { formatTime, ordinal } from './format.js';

const GO_SHOWN_FOR = 0.7;

const START_HTML = `
  <div class="card">
    <h1 class="title">Low-Poly <span>GP</span></h1>
    <p class="subtitle">3 laps. 4 rivals. You start last.</p>
    <table class="controls">
      <tr><td><kbd>W</kbd> / <kbd>↑</kbd></td><td>Accelerate</td></tr>
      <tr><td><kbd>S</kbd> / <kbd>↓</kbd></td><td>Brake / reverse</td></tr>
      <tr><td><kbd>A</kbd> <kbd>D</kbd> / <kbd>←</kbd> <kbd>→</kbd></td><td>Steer</td></tr>
      <tr><td><kbd>Space</kbd></td><td>Handbrake (drift)</td></tr>
      <tr><td><kbd>H</kbd></td><td>Steering assist on / off</td></tr>
      <tr><td><kbd>R</kbd></td><td>Restart race</td></tr>
    </table>
    <div class="prompt">Press Enter to start</div>
  </div>`;

const HUD_HTML = `
  <div class="panel hud-pos">
    <div class="row"><div class="label">Pos</div><div class="big" data-k="pos"></div></div>
    <div class="row"><div class="label">Lap</div><div class="big" data-k="lap"></div></div>
  </div>
  <div class="panel hud-time">
    <div class="label">Lap time</div><div class="value" data-k="lapTime"></div>
    <div class="label" style="margin-top:6px">Best</div><div class="value best" data-k="best"></div>
  </div>
  <div class="panel hud-speed"><div class="assist" data-k="assist"></div><div class="big" data-k="speed"></div></div>
  <div class="countdown hidden" data-k="countdown"></div>
  <div class="wrong-way hidden" data-k="wrongWay">WRONG WAY</div>`;

function el(html, className, id) {
  const node = document.createElement('div');
  if (id) node.id = id;
  if (className) node.className = className;
  node.innerHTML = html;
  return node;
}

export function createHud(root, { minimap } = {}) {
  const start = el(START_HTML, 'overlay hidden');
  const hud = el(HUD_HTML, 'hidden', 'hud');
  if (minimap) hud.append(minimap.element);
  const results = el('', 'overlay hidden');
  root.append(hud, start, results);

  const fields = Object.fromEntries([...hud.querySelectorAll('[data-k]')].map((n) => [n.dataset.k, n]));
  const shown = {};
  // Only touch the DOM when a value actually changes.
  const set = (key, html) => {
    if (shown[key] === html) return;
    shown[key] = html;
    fields[key].innerHTML = html;
  };
  const toggle = (key, visible) => fields[key].classList.toggle('hidden', !visible);

  const restartHandlers = [];

  return {
    showStart() {
      start.classList.remove('hidden');
      hud.classList.add('hidden');
      results.classList.add('hidden');
    },

    hide() {
      start.classList.add('hidden');
      hud.classList.add('hidden');
      results.classList.add('hidden');
    },

    update(snap) {
      hud.classList.remove('hidden');
      const p = snap.player;
      set('pos', `${p.position}<small>/${snap.cars.length}</small>`);
      set('lap', `${p.lap}<small>/${p.laps}</small>`);
      set('lapTime', formatTime(p.lapTime));
      set('best', formatTime(p.bestLap));
      set('speed', `${Math.round(p.speedKmh)}<small> km/h</small>`);
      set('assist', `Assist ${p.assist ? 'on' : 'off'} <kbd>H</kbd>`);
      fields.assist.classList.toggle('on', p.assist);

      const counting = snap.phase === 'countdown';
      const go = snap.phase === 'racing' && snap.time < GO_SHOWN_FOR;
      toggle('countdown', counting || go);
      if (counting) set('countdown', String(Math.ceil(snap.countdownLeft)));
      if (go) set('countdown', 'GO!');
      fields.countdown.classList.toggle('go', go);
      toggle('wrongWay', p.wrongWay && snap.phase === 'racing');
      minimap?.draw(snap.cars);
    },

    showResults(list, cars, playerIndex) {
      const rows = list.map((r, i) => `
        <tr class="${r.index === playerIndex ? 'me' : ''}">
          <td>${ordinal(i + 1)}</td>
          <td><span class="swatch" style="background:${cars[r.index].color}"></span>${cars[r.index].name}</td>
          <td class="num">${r.estimated ? '~' : ''}${formatTime(r.time)}</td>
          <td class="num">${formatTime(r.bestLap)}</td>
        </tr>`).join('');
      const place = list.findIndex((r) => r.index === playerIndex) + 1;
      results.innerHTML = `
        <div class="card">
          <h2 class="results-head">You finished ${ordinal(place)}</h2>
          <table class="results">
            <tr><th>Pos</th><th>Driver</th><th class="num">Time</th><th class="num">Best lap</th></tr>
            ${rows}
          </table>
          <button class="again" type="button">Race again (R)</button>
        </div>`;
      results.querySelector('button').addEventListener('click', () => restartHandlers.forEach((fn) => fn()));
      results.classList.remove('hidden');
      hud.classList.add('hidden');
    },

    onRestart(fn) {
      restartHandlers.push(fn);
    },
  };
}
