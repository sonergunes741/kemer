/**
 * Offline analysis: renders every case through the real engine on an OfflineAudioContext, measures
 * it (peak, loudness, spectral centroid, duration) and checks the balance rules. Results go to the
 * console as `AUDIO_METRIC {json}` lines, then `AUDIO_CHECK` lines and one `AUDIO_SUMMARY`, so
 * scripts/shot.mjs can read them from a headless run.
 */
import { buildBankSync, type Bank } from '../src/audio/bank';
import { Engine, type EngineStats } from '../src/audio/engine';
import { analyze, type Metrics } from '../src/audio/metrics';
import { Bus } from '../src/core/bus';
import { CASES, type Case } from './audio-cases';

export const SAMPLE_RATE = 48000;

export interface CaseResult extends Metrics {
  readonly id: string;
  readonly group: Case['group'];
  readonly target: number;
  readonly tol: number;
  readonly ok: boolean;
  readonly reasons: readonly string[];
  /** Offline render time over audio time: a proxy for the audio thread's load. */
  readonly load: number;
  /** Mean main-thread cost of one engine.update, ms. */
  readonly updateMs: number;
  readonly stats: EngineStats;
}

export interface Check {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

let shared: Bank | null = null;

/** Switches for cost experiments (?noreverb). */
export const offlineOptions = { reverb: true };

export function sharedBank(): Bank {
  shared ??= buildBankSync(SAMPLE_RATE, 20260101);
  return shared;
}

export async function renderCase(c: Case, bank: Bank): Promise<{ result: CaseResult; buffer: AudioBuffer }> {
  const ctx = new OfflineAudioContext(2, Math.round(SAMPLE_RATE * c.seconds), SAMPLE_RATE);
  let now = 0;
  const engine = new Engine(ctx, { seed: 7, bank, clock: () => now, reverb: offlineOptions.reverb });
  engine.mixer.setVolumes({ master: 1, music: 1, effects: 1 }, 0);
  if (!c.ambience) engine.ambience.set({ river: 0, wind: 0, birds: 0, rain: 0, night: 0, lapse: 0 });
  const bus = new Bus();
  engine.attach(bus);
  const timeline: { t: number; fn: () => void }[] = [];
  c.setup({ engine, bus, at: (t, fn) => timeline.push({ t, fn }) });
  timeline.sort((a, b) => a.t - b.t);
  const step = 1 / 60;
  let k = 0;
  let i = 0;
  let updateMs = 0;
  let updates = 0;
  let jsMs = 0;
  const runUntil = (end: number): void => {
    const j0 = performance.now();
    for (; i * step < Math.min(end, c.seconds); i++) {
      now = i * step;
      while (k < timeline.length && (timeline[k] as { t: number }).t <= now + 1e-9) {
        (timeline[k] as { fn: () => void }).fn();
        k++;
      }
      const u0 = performance.now();
      engine.update(step);
      // The first update builds the ambience layers once; measure the steady state.
      if (i > 0) {
        updateMs += performance.now() - u0;
        updates++;
      }
    }
    jsMs += performance.now() - j0;
  };
  // Drive the engine block by block while the context renders, as the game loop would: scheduling
  // everything up front would leave hundreds of idle nodes in the graph and overstate the cost.
  const BLOCK = 0.1;
  for (let b = 1; b * BLOCK < c.seconds - 0.01; b++) {
    const t = b * BLOCK;
    void ctx.suspend(t).then(() => {
      runUntil(t + BLOCK);
      void ctx.resume();
    });
  }
  runUntil(BLOCK);
  jsMs = 0;
  const r0 = performance.now();
  const buffer = await ctx.startRendering();
  // Audio-thread time only: the engine's own JS ran on this thread while the context waited.
  const renderMs = performance.now() - r0 - jsMs;
  const stats = engine.stats();
  const m = analyze([buffer.getChannelData(0), buffer.getChannelData(1)], SAMPLE_RATE, c.from ?? 0);
  const tol = c.tol ?? 3;
  const maxPeak = c.maxPeak ?? -1;
  const reasons: string[] = [];
  if (m.peakDb > maxPeak) reasons.push(`peak ${m.peakDb.toFixed(1)} dBFS > ${maxPeak}`);
  if (Math.abs(m.lufsM - c.target) > tol) reasons.push(`loudness ${m.lufsM.toFixed(1)} vs ${c.target}±${tol}`);
  return {
    buffer,
    result: {
      ...m,
      id: c.id,
      group: c.group,
      target: c.target,
      tol,
      ok: reasons.length === 0,
      reasons,
      load: renderMs / (c.seconds * 1000),
      updateMs: updateMs / Math.max(1, updates),
      stats,
    },
  };
}

const r1 = (x: number): number => Math.round(x * 10) / 10;

export function printResult(r: CaseResult): void {
  console.log(
    `AUDIO_METRIC ${JSON.stringify({
      id: r.id,
      ok: r.ok,
      lufsM: r1(r.lufsM),
      target: r.target,
      peak: r1(r.peakDb),
      centroid: Math.round(r.centroidHz),
      dur: Math.round(r.duration * 100) / 100,
      load: Math.round(r.load * 1000) / 1000,
      upd: Math.round(r.updateMs * 1000) / 1000,
      ...(r.reasons.length > 0 ? { why: r.reasons.join('; ') } : {}),
    })}`,
  );
}

/** The balance rules that matter more than any single number. */
export function checks(results: readonly CaseResult[]): Check[] {
  const get = (id: string): CaseResult | undefined => results.find((r) => r.id === id);
  const out: Check[] = [];
  const rule = (name: string, ok: boolean, detail: string): void => {
    out.push({ name, ok, detail });
  };
  const thud = get('stone 1 t voussoir');
  const boom = get('keystone boom');
  if (thud) rule('thud is low and short', thud.centroidHz < 1100 && thud.duration < 0.8, `centroid ${Math.round(thud.centroidHz)} Hz, ${thud.duration.toFixed(2)} s`);
  if (thud && boom) {
    rule('boom is lower and longer than a thud', boom.centroidHz < thud.centroidHz && boom.duration > 2 && boom.duration > thud.duration * 3, `boom ${Math.round(boom.centroidHz)} Hz ${boom.duration.toFixed(2)} s`);
  }
  const murmur = get('ambience river 0.25 murmur');
  const mid = get('ambience river 0.6');
  const roar = get('ambience river 1 roar');
  if (thud && murmur && mid) rule('river sits well below the effects', murmur.lufsM <= thud.lufsM - 10 && mid.lufsM <= thud.lufsM - 5, `murmur ${r1(murmur.lufsM)}, river 0.6 ${r1(mid.lufsM)}, thud ${r1(thud.lufsM)}`);
  if (roar && boom) rule('flood roar stays under the keystone', roar.lufsM <= boom.lufsM - 5, `roar ${r1(roar.lufsM)}, boom ${r1(boom.lufsM)}`);
  if (murmur && roar) rule('river weight and brightness follow the flow', roar.lufsM > murmur.lufsM + 8, `murmur ${r1(murmur.lufsM)} / roar ${r1(roar.lufsM)}`);
  const w = ['wedge left 2', 'wedge left 1', 'wedge left 0'].map(get);
  if (w.every(Boolean)) {
    const [a, b, c] = w as CaseResult[];
    rule('each wedge blow is lower', (a as CaseResult).centroidHz > (b as CaseResult).centroidHz && (b as CaseResult).centroidHz > (c as CaseResult).centroidHz, w.map((x) => Math.round((x as CaseResult).centroidHz)).join(' > '));
  }
  const s = ['splash 0.3 m', 'splash 1.5 m', 'splash 5 m'].map(get);
  if (s.every(Boolean)) rule('splashes scale with size', (s[0] as CaseResult).lufsM < (s[1] as CaseResult).lufsM && (s[1] as CaseResult).lufsM < (s[2] as CaseResult).lufsM, s.map((x) => r1((x as CaseResult).lufsM)).join(' < '));
  const stress = get('collapse stress (420 events)');
  if (stress) {
    rule('collapse never clips', stress.peakDb <= 0, `peak ${r1(stress.peakDb)} dBFS`);
    rule('collapse is limited, not choked', stress.stats.voicePeak <= 40 && stress.stats.rateLimited > 0 && stress.lufsM > -16, `voices peak ${stress.stats.voicePeak}, rate-limited ${stress.stats.rateLimited}, stolen ${stress.stats.stolen}`);
  }
  const ui = results.filter((r) => r.id.startsWith('sfx ui-') || r.id.startsWith('sfx handle-') || r.id === 'sfx year-tick');
  if (thud) rule('interface sounds stay under the stones', ui.every((r) => r.lufsM < thud.lufsM - 3), `loudest ui ${r1(Math.max(...ui.map((r) => r.lufsM)))}`);
  const moods = results.filter((r) => r.group === 'music');
  const hush = get('music hush');
  if (moods.length > 0) rule('every mood but hush plays notes', moods.filter((r) => r.id !== 'music hush').every((r) => r.stats.notes > 0), moods.map((r) => `${r.id.slice(6)}:${r.stats.notes}`).join(' '));
  if (hush) rule('hush is near silence', hush.lufsM < -40, `${r1(hush.lufsM)} LUFS`);
  const birds = get('ambience birds spring day');
  if (birds) rule('birds return one at a time and sing', birds.stats.birds >= 2 && birds.stats.songs >= 3, `${birds.stats.birds} birds, ${birds.stats.songs} songs`);
  const scene = get('scene: river, birds, rain, music, stones');
  if (scene) rule('cost stays well under 20 % of a core', scene.load < 0.12 && scene.updateMs < 0.5, `audio thread ~${Math.round(scene.load * 100)} %, update ${scene.updateMs.toFixed(3)} ms`);
  rule('nothing clips', results.every((r) => r.peakDb <= (r.id.startsWith('collapse') ? 0 : -1)), `max peak ${r1(Math.max(...results.map((r) => r.peakDb)))} dBFS`);
  return out;
}

/** A full scene for the cost estimate. */
export const SCENE: Case = {
  id: 'scene: river, birds, rain, music, stones',
  group: 'scene',
  seconds: 20,
  target: -24,
  tol: 8,
  from: 3,
  ambience: true,
  setup: (c) => {
    c.engine.ambience.set({ river: 0.6, wind: 0.4, rain: 0.3, birds: 1, night: 0, season: 0.4, lapse: 0 });
    c.engine.music.setMood('time', 1, 0);
    for (let i = 0; i < 30; i++) c.at(2 + i * 0.5, () => c.bus.emit('stone:land', { at: { x: i - 15, y: 3, z: 0 }, mass: 0.6 + (i % 3), part: 'voussoir', count: 1 }));
  },
};

/**
 * Progress kept in sessionStorage so a run survives the dev server reloading the page (it does so
 * whenever another module of the project changes); a resumed run re-prints what it already has.
 */
const PROGRESS_KEY = 'kemer-audio-analysis';

function loadProgress(key: string): CaseResult[] {
  try {
    const raw = sessionStorage.getItem(PROGRESS_KEY);
    const saved = raw ? (JSON.parse(raw) as { key: string; results: CaseResult[] }) : null;
    return saved && saved.key === key && Array.isArray(saved.results) ? saved.results : [];
  } catch {
    return [];
  }
}

function saveProgress(key: string, results: readonly CaseResult[] | null): void {
  try {
    if (results) sessionStorage.setItem(PROGRESS_KEY, JSON.stringify({ key, results }));
    else sessionStorage.removeItem(PROGRESS_KEY);
  } catch {
    // Storage is a convenience; without it a reload simply starts over.
  }
}

export async function runAll(onResult?: (r: CaseResult) => void, only?: string, resume = false): Promise<{ results: CaseResult[]; checks: Check[] }> {
  const t0 = performance.now();
  const bank = sharedBank();
  console.log(`AUDIO_BANK ${JSON.stringify({ ms: Math.round(bank.buildMs), totalMs: Math.round(performance.now() - t0) })}`);
  const list = [...CASES, SCENE].filter((c) => !only || c.id.includes(only));
  const key = `${only ?? ''}|${offlineOptions.reverb}`;
  const results: CaseResult[] = resume ? loadProgress(key) : [];
  for (const r of results) {
    printResult(r);
    onResult?.(r);
  }
  for (const c of list) {
    if (results.some((r) => r.id === c.id)) continue;
    try {
      const { result } = await renderCase(c, bank);
      results.push(result);
      saveProgress(key, results);
      printResult(result);
      onResult?.(result);
    } catch (err) {
      console.error(`AUDIO_ERROR ${c.id}: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    }
  }
  saveProgress(key, null);
  const cs = checks(results);
  for (const c of cs) console.log(`AUDIO_CHECK ${c.ok ? 'PASS' : 'FAIL'} ${c.name}: ${c.detail}`);
  const failed = results.filter((r) => !r.ok).length + cs.filter((c) => !c.ok).length;
  console.log(`AUDIO_SUMMARY cases=${results.length} failedCases=${results.filter((r) => !r.ok).length} checks=${cs.length} failedChecks=${cs.filter((c) => !c.ok).length} total=${failed === 0 ? 'PASS' : 'FAIL'}`);
  return { results, checks: cs };
}
