/**
 * Audio harness: every sound, bus event and mood on a button, the ambience fields on sliders, a
 * level meter, and the offline analysis (levels by numbers, printed to the console).
 *
 *   /harness/audio.html               interactive
 *   /harness/audio.html?analyze=1     run the offline analysis on load (optionally &only=<text>)
 *   /harness/audio.html?live=1        unlock at once and play a short scripted scene (headless check)
 */
import { createAudio } from '../src/audio/index';
import type { AmbienceState, MusicMood, SfxId } from '../src/core/contracts';
import { Bus, type BusEvents } from '../src/core/bus';
import type { ActorKind, Vec3 } from '../src/core/types';
import { offlineOptions, runAll, type CaseResult, type Check } from './audio-offline';

const params = new URLSearchParams(location.search);
offlineOptions.reverb = !params.has('noreverb');
const bus = new Bus();
const audio = createAudio(bus);
const app = document.getElementById('app') as HTMLElement;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(parent: HTMLElement, label: string, fn: () => void, cls?: string): HTMLButtonElement {
  const b = el('button', cls, label);
  b.type = 'button';
  b.addEventListener('click', () => {
    void audio.unlock();
    fn();
  });
  parent.append(b);
  return b;
}

function slider(parent: HTMLElement, label: string, min: number, max: number, step: number, value: number, fn: (v: number) => void): void {
  const l = el('label', 'slider');
  const input = el('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  const out = el('output', undefined, String(value));
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = String(v);
    fn(v);
  });
  l.append(el('span', undefined, label), input, out);
  parent.append(l);
}

function section(parent: HTMLElement, title: string): HTMLElement {
  const s = el('section');
  s.append(el('h2', undefined, title));
  const body = el('div', 'buttons');
  s.append(body);
  parent.append(s);
  return body;
}

/* -- layout ---------------------------------------------------------------------------------- */

const top = el('div', 'top');
top.append(el('h1', undefined, 'Kemer · audio'));
const unlockBtn = button(top, 'Unlock audio', () => void audio.unlock().then(refresh), 'primary');
const meter = el('canvas', 'meter');
meter.width = 320;
meter.height = 18;
top.append(meter);
const status = el('span', 'status', 'locked');
top.append(status);
app.append(top);

const grid = el('div', 'grid');
app.append(grid);

const P = (x = 0, y = 4): Vec3 => ({ x, y, z: 0 });
const emit = <K extends keyof BusEvents>(type: K, payload: BusEvents[K]): void => bus.emit(type, payload);

const mix = section(grid, 'Mix');
const vol = { master: 0.9, music: 0.6, effects: 0.9 };
slider(mix, 'master', 0, 1, 0.01, vol.master, (v) => audio.setVolumes((vol.master = v), vol.music, vol.effects));
slider(mix, 'music', 0, 1, 0.01, vol.music, (v) => audio.setVolumes(vol.master, (vol.music = v), vol.effects));
slider(mix, 'effects', 0, 1, 0.01, vol.effects, (v) => audio.setVolumes(vol.master, vol.music, (vol.effects = v)));
let muted = false;
button(mix, 'mute', () => audio.setMuted((muted = !muted)));
button(mix, 'suspend', () => audio.suspend());
button(mix, 'resume', () => audio.resume());
const listener = { x: 0, distance: 30 };
slider(mix, 'listener x', -150, 150, 1, 0, (v) => audio.setListener((listener.x = v), listener.distance));
slider(mix, 'distance', 5, 600, 1, 30, (v) => audio.setListener(listener.x, (listener.distance = v)));
slider(mix, 'region', 0, 13, 1, 1, (v) => audio.setRegion(v));

const amb = section(grid, 'Ambience');
const state: AmbienceState = { river: 0.3, wind: 0.1, birds: 1, rain: 0, night: 0, season: 0.35, lapse: 0 };
for (const key of Object.keys(state) as (keyof AmbienceState)[]) {
  slider(amb, key, 0, 1, 0.01, state[key], (v) => audio.setAmbience({ [key]: v }));
}
audio.setAmbience(state);

const moods = section(grid, 'Music mood');
const MOODS: MusicMood[] = ['none', 'title', 'survey', 'design', 'build', 'hush', 'relief', 'time', 'peril', 'elegy', 'legacy'];
const moodButtons: HTMLButtonElement[] = [];
for (const m of MOODS) {
  const b = button(moods, m, () => {
    audio.setMood(m, 2.5);
    moodButtons.forEach((x) => x.classList.toggle('on', x === b));
  });
  moodButtons.push(b);
}

const sfx = section(grid, 'Interface sounds (SfxId)');
const SFX: SfxId[] = ['ui-tap', 'ui-hover', 'ui-back', 'ui-page', 'handle-grab', 'handle-tick', 'handle-release', 'handle-limit', 'safe', 'unsafe', 'seal', 'year-tick', 'century', 'timber', 'crack', 'rumble'];
for (const id of SFX) button(sfx, id, () => audio.play(id));
button(sfx, 'handle drag (10 ticks)', () => {
  for (let i = 0; i < 10; i++) setTimeout(() => audio.play('handle-tick', { pitch: 1 + i * 0.025 }), i * 90);
});

const stones = section(grid, 'Building');
button(stones, 'stone 0.3 t', () => emit('stone:land', { at: P(-3), mass: 0.3, part: 'voussoir', count: 1 }));
button(stones, 'stone 1 t', () => emit('stone:land', { at: P(0), mass: 1, part: 'voussoir', count: 1 }));
button(stones, 'pier stone 3 t', () => emit('stone:land', { at: P(4, 1), mass: 3, part: 'pier', count: 1 }));
button(stones, 'flurry x5', () => emit('stone:land', { at: P(2), mass: 0.7, part: 'voussoir', count: 5 }));
button(stones, 'lay 20 (quickening)', () => {
  let t = 0;
  for (let i = 0; i < 20; i++) {
    t += Math.max(90, 520 - i * 25);
    setTimeout(() => emit('stone:land', { at: P(i % 2 ? 6 - i * 0.3 : -6 + i * 0.3), mass: 0.5 + (i % 3) * 0.3, part: 'voussoir', count: 1 }), t);
  }
});
button(stones, 'keystone', () => emit('keystone:seat', { at: P(0, 6), span: 0 }));
button(stones, 'chisel x3', () => [1, 2, 3].forEach((n) => setTimeout(() => emit('mark:tap', { at: P(1), n }), (n - 1) * 380)));
button(stones, 'centering raise', () => emit('centering:raise', { at: P(0, 2), span: 0 }));
button(stones, 'creak 0.4', () => emit('timber:creak', { at: P(0, 2), strain: 0.4 }));
button(stones, 'creak 0.9', () => emit('timber:creak', { at: P(0, 2), strain: 0.9 }));
for (const left of [2, 1, 0]) button(stones, `wedge (left ${left})`, () => emit('wedge:strike', { at: P(0, 1), left }));
button(stones, 'centering fall', () => emit('centering:fall', { at: P(0, 2), span: 0 }));
button(stones, 'arch settle', () => emit('arch:settle', { at: P(0, 6), span: 0, drop: 0.012 }));

const water = section(grid, 'Water, debris, hazards');
for (const size of [0.3, 1.5, 5]) button(water, `splash ${size} m`, () => emit('splash', { at: P(0, 0), size }));
button(water, 'impact ground', () => emit('impact', { at: P(5, 0), energy: 120, surface: 'ground' }));
button(water, 'impact stone', () => emit('impact', { at: P(-5, 2), energy: 40, surface: 'stone' }));
button(water, 'crack', () => emit('crack', { at: P(2, 5) }));
button(water, 'collapse (full)', () => {
  emit('collapse:start', { info: { year: 1683, cause: 'flood-scour', spans: [], piers: [] } });
  for (let i = 0; i < 300; i++) {
    setTimeout(() => {
      const x = -10 + (i % 21);
      if (i % 3 === 0) emit('splash', { at: P(x, 0), size: 0.5 + (i % 6) });
      else if (i % 3 === 1) emit('impact', { at: P(x, 2), energy: 10 + (i % 9) * 30, surface: 'stone' });
      else emit('impact', { at: P(x, 0), energy: 20 + (i % 5) * 40, surface: 'ground' });
    }, 150 + Math.pow(i / 300, 0.8) * 4000);
  }
  setTimeout(() => emit('collapse:end', {}), 5200);
});
for (const phase of ['rise', 'peak', 'fall', 'end'] as const) button(water, `flood ${phase}`, () => emit('flood', { phase, level: 3, drama: 0.8 }));
button(water, 'quake start', () => emit('quake', { phase: 'start', pga: 0.25 }));
button(water, 'quake end', () => emit('quake', { phase: 'end', pga: 0.25 }));

const life = section(grid, 'Traffic and seals');
const ACTORS: ActorKind[] = ['villager', 'ox-cart', 'donkey', 'caravan', 'rider', 'army', 'cannon', 'carriage', 'truck', 'cyclist'];
for (const kind of ACTORS) {
  button(life, kind, () => {
    for (let i = 0; i < 8; i++) setTimeout(() => emit('traffic:step', { kind, at: P(-8 + i * 2, 5) }), i * 330);
  });
}
for (const phase of ['enter', 'mid', 'exit'] as const) button(life, `truck ${phase}`, () => emit('traffic:pass', { kind: 'truck', at: P(), phase }));
for (const which of ['standing', 'lean', 'unrepaired', 'masterwork'] as const) button(life, `seal ${which}`, () => emit('seal:stamp', { which }));

/* -- offline analysis --------------------------------------------------------------------------- */

const analysis = el('section');
analysis.append(el('h2', undefined, 'Offline analysis (levels by numbers)'));
const runBtn = el('button', 'primary', 'Run analysis');
analysis.append(runBtn);
const checkList = el('ul', 'checks');
const table = el('table');
analysis.append(checkList, table);
app.append(analysis);

function header(): void {
  const tr = el('tr');
  for (const h of ['case', 'LUFS-M', 'target', 'peak dBFS', 'centroid Hz', 'duration s', 'load', 'note']) tr.append(el('th', undefined, h));
  table.append(tr);
}

function row(r: CaseResult): void {
  const tr = el('tr', r.ok ? 'ok' : 'fail');
  const cells = [r.id, r.lufsM.toFixed(1), `${r.target}±${r.tol}`, r.peakDb.toFixed(1), String(Math.round(r.centroidHz)), r.duration.toFixed(2), `${(r.load * 100).toFixed(1)} %`, r.reasons.join('; ')];
  for (const c of cells) tr.append(el('td', undefined, c));
  table.append(tr);
}

function showChecks(cs: readonly Check[]): void {
  for (const c of cs) checkList.append(el('li', c.ok ? 'pass' : 'fail', `${c.ok ? 'pass' : 'FAIL'} · ${c.name}: ${c.detail}`));
}

async function analyse(resume: boolean): Promise<void> {
  runBtn.disabled = true;
  table.replaceChildren();
  checkList.replaceChildren();
  header();
  const { checks } = await runAll(row, params.get('only') ?? undefined, resume);
  showChecks(checks);
  runBtn.disabled = false;
}
runBtn.addEventListener('click', () => void analyse(false));

/* -- live loop ------------------------------------------------------------------------------- */

const meterData = new Float32Array(2048);
let peakHold = 0;
let last = performance.now();
function frame(t: number): void {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  audio.update(dt);
  const live = audio.inspect();
  const g = meter.getContext('2d');
  if (live && g) {
    live.engine.mixer.meter.getFloatTimeDomainData(meterData);
    let peak = 0;
    let sum = 0;
    for (const v of meterData) {
      peak = Math.max(peak, Math.abs(v));
      sum += v * v;
    }
    const rms = Math.sqrt(sum / meterData.length);
    peakHold = Math.max(peak, peakHold * 0.97);
    const x = (db: number): number => Math.max(0, Math.min(1, (db + 60) / 60)) * meter.width;
    const toDb = (v: number): number => (v > 0 ? 20 * Math.log10(v) : -120);
    g.clearRect(0, 0, meter.width, meter.height);
    g.fillStyle = '#6e8f7a';
    g.fillRect(0, 3, x(toDb(rms)), meter.height - 6);
    g.fillStyle = peakHold > 0.89 ? '#b5482e' : '#1b1815';
    g.fillRect(x(toDb(peakHold)) - 1, 0, 2, meter.height);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function refresh(): void {
  const live = audio.inspect();
  unlockBtn.textContent = audio.unlocked ? 'Unlocked' : 'Unlock audio';
  if (!live) return;
  const s = live.engine.stats();
  status.textContent = `${live.context.state} · ${live.context.sampleRate} Hz · bank ${s.bankReady ? `${s.bankMs} ms` : '…'} · voices ${s.voices} (peak ${s.voicePeak}) · birds ${s.birds} · ${s.mood} in ${s.makam} · notes ${s.notes}`;
}
setInterval(refresh, 250);

// A load with ?analyze resumes an interrupted run (the dev server reloads the page on other edits).
if (params.has('analyze')) void analyse(true);

if (params.has('live')) {
  // Headless check of the real-time path: unlock, play a little of everything, report.
  void (async () => {
    await audio.unlock();
    audio.setAmbience({ river: 0.5, birds: 1, wind: 0.3, season: 0.4 });
    audio.setMood('build', 1);
    const live = audio.inspect();
    await live?.engine.ready;
    for (let i = 0; i < 12; i++) setTimeout(() => emit('stone:land', { at: P(i - 6), mass: 0.8, part: 'voussoir', count: 1 }), 400 + i * 250);
    setTimeout(() => emit('keystone:seat', { at: P(0, 6), span: 0 }), 3800);
    setTimeout(() => audio.play('safe'), 4600);
    setTimeout(() => {
      const l = audio.inspect();
      console.log(`AUDIO_LIVE ${JSON.stringify({ unlocked: audio.unlocked, state: l?.context.state, peakHold: Math.round(peakHold * 1000) / 1000, ...l?.engine.stats() })}`);
    }, 6000);
  })();
}
