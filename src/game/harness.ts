/**
 * window.hx: drives the real game for automated playtests (harness/game.html, and the main page in
 * dev). Everything goes through the same intents the interface sends, so a playtest exercises the
 * game's own rules; only jumps and the time multiplier reach past them.
 */
import type { UiIntent } from '../core/contracts';
import type { BridgeDesign, FamilyMark, LevelId } from '../core/types';
import type { Game } from './index';
import type { ShareReport } from './share';
import { DesignPhase } from './phases/design';
import { TimePhase } from './phases/time';
import type { PhaseId } from './types';

/** A mason's arrow over a bar: the mark a playtest cuts. */
export const TEST_MARK: FamilyMark = { strokes: [[1, 7], [3, 1], [1, 5], [6, 8]] };

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface Hx {
  state(): Record<string, unknown>;
  dispatch(intent: UiIntent): void;
  jump(level: LevelId, to?: 'arrive' | 'design' | 'build'): Promise<void>;
  /** Change the design on the board (design phase only): a patch of the whole design or of every span. */
  design(patch: Partial<Omit<BridgeDesign, 'spans'>> & { span?: Partial<BridgeDesign['spans'][number]> }): Record<string, unknown>;
  /** The ring at its thinnest: a bridge that falls when the centering is struck. */
  thin(): Record<string, unknown>;
  hold(on: boolean): void;
  /** Hold the build control until the keystone hangs (or `ms` passes). */
  layAll(ms?: number): Promise<Record<string, unknown>>;
  keystone(): void;
  mark(): void;
  wedges(): Promise<void>;
  /** Run the centuries this many times faster (vignettes included). */
  pace(multiplier: number): void;
  /** Mend like the balance tables' careful player (content/tuning/trial.ts): every `gap` years or more while safety is under `below`; 0 stops. */
  autoRepair(below: number, gap?: number): void;
  /** Resolve when the flow reaches a phase (or after `ms`); returns the state then. */
  until(phase: PhaseId | readonly PhaseId[], ms?: number): Promise<Record<string, unknown>>;
  save(): unknown;
  /**
   * A save as if these rivers had been passed with their starter bridges standing in 2026 (and
   * the whole first-river lesson learnt), then back to the title: later rivers, the epilogue and
   * the endless modes without playing everything before them.
   */
  seed(ids: readonly LevelId[]): Record<string, unknown>;
  /** The epilogue: drag the rag back and forth over the family mark, as a finger would, until it shows. */
  wipe(ms?: number): Promise<Record<string, unknown>>;
  /** The epilogue's card: pick a repair (-1: the smallest that is enough) and press Onar. */
  mend(index?: number): Record<string, unknown>;
  /** Share from the result and resolve with what was handed over (a video waits for its recording). */
  share(what: 'video' | 'image' | 'text', ms?: number): Promise<ShareReport | null>;
  /** Lose the WebGL context for `ms`, then get it back (WEBGL_lose_context). */
  loseContext(ms?: number): Promise<boolean>;
}

const RIVER_ONE_LESSONS = ['k1.raise', 'k1.thrust', 'k1.thicken', 'k1.build', 'k1.lay', 'k1.keystone', 'k1.mark', 'k1.wedges', 'k1.sun', 'k1.repair'];
/** Dead-load safety a seeded ledger bridge is thickened to. */
const SOUND = 1.8;

export function createHarness(game: Game): Hx {
  const ctx = game.context;
  const state = (): Record<string, unknown> => {
    const save = ctx.session.save;
    return {
      phase: game.phase.id,
      ...game.phase.describe(),
      level: ctx.session.level?.id ?? null,
      overlay: game.overlay,
      coach: ctx.coach.active,
      mode: ctx.session.mode,
      paused: game.paused,
      recording: game.recording,
      shared: game.shared,
      mark: save.mark !== null,
      taught: [...save.taught],
      records: Object.fromEntries(Object.entries(save.levels).map(([k, r]) => [k, r ? { attempts: r.attempts, bestYears: r.bestYears, passed: r.passed, seals: r.seals, witnessed: r.witnessed } : null])),
    };
  };
  let mending: ReturnType<typeof setInterval> | null = null;
  const hx: Hx = {
    state,
    dispatch: (intent) => game.dispatch(intent),
    jump: (level, to = 'design') => game.jump(level, to),
    design(patch) {
      const phase = game.phase;
      const level = ctx.session.level;
      if (!(phase instanceof DesignPhase) || !level) return { error: 'not designing' };
      const current = ctx.session.designFor(level);
      const { span, ...rest } = patch;
      const next: BridgeDesign = { ...current, ...rest, spans: current.spans.map((s) => ({ ...s, ...span })) };
      phase.load(next);
      return state();
    },
    thin() {
      const level = ctx.session.level;
      return level ? hx.design({ span: { thickness: level.limits.thickness[0] } }) : { error: 'no level' };
    },
    hold(on) {
      game.dispatch({ type: 'primary', phase: on ? 'down' : 'up' });
    },
    async layAll(ms = 60000) {
      const t0 = performance.now();
      while (game.phase.id === 'build' && performance.now() - t0 < ms) {
        const s = game.phase.describe();
        if (s.step === 'stones' && !s.holding) hx.hold(true);
        if (s.step !== 'stones' && s.step !== 'centering') break;
        await sleep(200);
      }
      hx.hold(false);
      return state();
    },
    keystone() {
      game.dispatch({ type: 'primary', phase: 'down' });
      game.dispatch({ type: 'primary', phase: 'up' });
    },
    mark() {
      if (game.phase.describe().step === 'choose') game.dispatch({ type: 'mark', mark: TEST_MARK });
      else hx.keystone();
    },
    async wedges() {
      for (let i = 0; i < 3 && game.phase.id === 'strike'; i++) {
        game.dispatch({ type: 'primary', phase: 'down' });
        game.dispatch({ type: 'primary', phase: 'up' });
        await sleep(900);
      }
    },
    pace(multiplier) {
      const rate = Math.max(0.1, multiplier);
      TimePhase.defaultRate = rate;
      const phase = game.phase;
      if (phase instanceof TimePhase) phase.rate = rate;
    },
    autoRepair(below, gap = 20) {
      if (mending !== null) clearInterval(mending);
      mending = null;
      if (below <= 0) return;
      let last = -Infinity;
      // The gauge reads the service safety, which trembles well before anything slow brings the
      // bridge down: mend when it is under `below`, at most every `gap` years. A press may only
      // bring the seal warning; the next mends.
      mending = setInterval(() => {
        const s = game.phase.id === 'time' ? game.phase.describe() : null;
        if (!s || s.stage !== 'run' || typeof s.safety !== 'number' || typeof s.year !== 'number') return;
        if (s.year < last) last = -Infinity; // a new run
        if (s.year - last < gap || s.safety >= below) return;
        const before = ctx.session.run?.state.repairs ?? 0;
        game.dispatch({ type: 'repair' });
        if ((ctx.session.run?.state.repairs ?? 0) > before) last = s.year;
      }, 150);
    },
    async until(phase, ms = 120000) {
      const t0 = performance.now();
      const wanted: readonly PhaseId[] = typeof phase === 'string' ? [phase] : phase;
      while (!wanted.includes(game.phase.id) && performance.now() - t0 < ms) await sleep(100);
      return state();
    },
    save: () => JSON.parse(JSON.stringify(ctx.session.save)) as unknown,
    seed(ids) {
      const save = ctx.session.save;
      const { content, sim } = ctx.deps;
      save.mark ??= TEST_MARK;
      for (const lesson of RIVER_ONE_LESSONS) if (!save.taught.includes(lesson)) save.taught.push(lesson);
      for (const id of ids) {
        const level = content.level(id);
        if (!level) continue;
        // A starter may be deliberately thin (Koramaz falls at the strike): thicken the ring
        // until it would really stand, as a passed river's ledger bridge did.
        let design = sim.normalize(level, level.starter);
        for (let i = 0; i < 40 && sim.insight(level, design).safety < SOUND; i++) {
          const thicker = sim.normalize(level, { ...design, spans: design.spans.map((s) => ({ ...s, thickness: s.thickness + 0.05 })) });
          if (thicker.spans.every((s, k) => s.thickness <= (design.spans[k]?.thickness ?? 0))) break;
          design = thicker;
        }
        const g = sim.geometry(level, design);
        const span = g.spans.reduce((best, sp, i) => (sp.span > (g.spans[best]?.span ?? 0) ? i : best), 0);
        const n = g.spans[span]?.voussoirs.length ?? 0;
        save.levels[id] = {
          bestYears: level.endYear - level.year,
          bestStones: g.stones.total,
          seals: { standing: true, lean: false, unrepaired: false },
          masterwork: false,
          passed: true,
          attempts: 1,
          design,
          markStone: { span, stone: Math.max(0, Math.floor(n / 2) - 2) },
          witnessed: [],
        };
      }
      ctx.persist();
      game.go({ to: 'title' });
      return state();
    },
    async wipe(ms = 20000) {
      const t0 = performance.now();
      const { world } = ctx.deps;
      let row = 0;
      while (game.phase.id === 'epilogue' && performance.now() - t0 < ms) {
        const s = game.phase.describe();
        const probe = s.probe as { x: number; y: number } | null;
        if (s.stage !== 'wipe' || s.found || !probe) break;
        const c = world.toScreen(probe);
        const y = c.y + ((row % 5) - 2) * 9;
        const id = 90 + row;
        game.dispatch({ type: 'canvas', phase: 'down', x: c.x - 70, y, id });
        for (let i = 1; i <= 8; i++) {
          game.dispatch({ type: 'canvas', phase: 'move', x: c.x - 70 + i * 17.5, y, id });
          await sleep(30);
        }
        game.dispatch({ type: 'canvas', phase: 'up', x: c.x + 70, y, id });
        row++;
        await sleep(60);
      }
      return state();
    },
    mend(index = -1) {
      const s = game.phase.describe();
      if (game.phase.id !== 'epilogue' || s.stage !== 'read') return { error: 'not reading', ...state() };
      const pick = index >= 0 ? index : (s.least as number);
      game.dispatch({ type: 'choose', index: pick });
      game.dispatch({ type: 'primary', phase: 'down' });
      game.dispatch({ type: 'primary', phase: 'up' });
      return state();
    },
    async share(what, ms = 40000) {
      const before = game.shared;
      game.dispatch({ type: 'share', what });
      const t0 = performance.now();
      while (performance.now() - t0 < ms && (game.recording || game.shared === before)) await sleep(150);
      return game.shared;
    },
    async loseContext(ms = 1500) {
      const canvas = ctx.deps.canvas;
      const gl = canvas?.getContext('webgl2') ?? null;
      const ext = gl?.getExtension('WEBGL_lose_context') ?? null;
      if (!ext) return false;
      ext.loseContext();
      await sleep(ms);
      ext.restoreContext();
      await sleep(500);
      return true;
    },
  };
  return hx;
}
