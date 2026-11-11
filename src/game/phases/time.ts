/**
 * Time (DESIGN 2.5), the director. The sun sits low; the player draws it across the sky and lets
 * go, and the years start to turn, faster and faster. The pace eases down before every beat (a
 * great flood, an earthquake, an exceptional load, a new era) and back up after it; the stops play
 * out at near real time with the camera closer. The chronicle never runs ahead of a stop, so the
 * outcome is only known as it plays. In 2026 time slows to a real spring afternoon.
 */
import type { ChronicleRun, UiIntent } from '../../core/contracts';
import { formatNumber } from '../../core/format';
import { damp, fract, smoothstep } from '../../core/math';
import type { BridgeGeometry, ChronicleEvent, CollapseInfo, LevelDef, RepairQuote, TrafficEra } from '../../core/types';
import { eraCaption, say } from '../text';
import { planBeats, type Beat } from '../time/beats';
import { Director } from '../time/director';
import { Repairs } from '../time/repair';
import { SunHold, sunMark } from '../time/sun';
import { Vignette } from '../time/vignette';
import { WARNING_PACE, WARNING_SECONDS, warningWords } from '../time/warning';
import { Swell, annualWater } from '../time/water';
import { PhaseBase } from './base';

type Stage = 'sun' | 'run' | 'stop' | 'falling' | 'ending';

const START_HOUR = 7.4;
/** Seconds before a player who has learnt the sun is helped on (replays stay quick). */
const SUN_IDLE = 5;
const CAPTION_SECONDS = 3.2;
const LESSON_PACE = 0.8;
const NEAR_MISS = 1.15;

export class TimePhase extends PhaseBase {
  readonly id = 'time' as const;
  private stage: Stage = 'sun';
  private chron: ChronicleRun | null = null;
  private level: LevelDef | null = null;
  private geometry: BridgeGeometry | null = null;
  private director: Director | null = null;
  private repairs: Repairs | null = null;
  private vignette: Vignette | null = null;
  private paused = false;
  private lapse = 0;
  private hour = START_HOUR;
  private readonly sun = new SunHold();
  private idle = 0;
  private caption: string | null = null;
  private captionLeft = 0;
  private swell: Swell | null = null;
  private quote: RepairQuote = { possible: false, stones: 0 };
  private clocks = { hud: 0, apply: 0, quote: 0, speed: 0 };
  private appliedYear = -1;
  private era: TrafficEra | null = null;
  private density = -1;
  private capLeft = 0;
  private outlasted = false;
  private lastSpeed = 0;
  /** Harness: a multiplier on the whole flow of time (vignettes included), and its default. */
  static defaultRate = 1;
  rate = TimePhase.defaultRate;

  protected override async run(): Promise<void> {
    const { deps, session, scene, cam, coach } = this.g;
    const level = session.level;
    const built = session.built;
    if (!level || !built) return this.g.go({ to: 'title' });
    const { sim, ui, audio, bridge } = deps;
    const run = session.run ?? sim.run(level, built.design);
    session.run = run;
    this.chron = run;
    this.level = level;
    this.geometry = built.geometry;
    const greatest = sim.greatestFlood(level);
    this.director = new Director(planBeats(level, run.upcoming(1000), greatest.year), level.year, level.endYear);
    this.director.year = level.year + 0.3;
    this.repairs = new Repairs(deps, built.geometry, greatest.year);
    this.era = level.traffic.find((e) => e.from <= level.year && level.year < e.to) ?? level.traffic[0] ?? null;
    ui.setScreen({ id: 'time', level });
    ui.setBuild(null);
    ui.setDesign(null);
    scene.birds = 1;
    audio.setMood('time', 4);
    void bridge.warmPhysics().catch(() => undefined);
    bridge.apply(run.state);
    this.pushHud(true);
    cam.recentre();
    await cam.to(cam.time(built.geometry), 3, 'in-out');
    if (!this.alive || this.stage !== 'sun') return;
    const { width, height } = deps.viewport();
    const at = sunMark(deps.world, width, height) ?? deps.world.fromScreen(width * 0.2, height * 0.3);
    coach.offer('k1.sun', 'sun', at ? { kind: 'elevation', at } : { kind: 'none' }, 'drag-arc');
  }

  /* -- the flow ---------------------------------------------------------------------------- */

  private start(): void {
    if (this.stage !== 'sun' || !this.director) return;
    this.stage = 'run';
    this.sun.release();
    this.g.coach.done('k1.sun');
    this.director.launch();
  }

  protected override tick(realDt: number): void {
    const run = this.chron;
    const d = this.director;
    if (!run || !d || !this.level) return;
    const dt = realDt * this.rate;
    if (this.stage === 'sun') {
      this.idle += dt;
      if (!this.sun.holding && this.g.coach.taught('k1.sun') && this.idle > SUN_IDLE) this.start();
    } else if (this.stage === 'run' && !this.paused) {
      if (this.capLeft > 0 && (this.capLeft -= dt) <= 0) d.cap = Infinity;
      this.hour = (this.hour + d.pace * 8760 * dt) % 24;
      const stop = d.step(dt);
      this.advanceTo(stop ? stop.whole - 1e-6 : d.year);
      if (stop && this.stage === 'run') this.beginStop(stop);
    } else if (this.stage === 'stop' && !this.paused && this.vignette) {
      const state = this.vignette.update(dt);
      if (state === 'collapse' && this.vignette.collapse) this.fall(this.vignette.collapse);
      else if (state === 'done') this.endStop();
    }
    this.flowWorld(realDt, dt);
    if (this.captionLeft > 0 && (this.captionLeft -= dt) <= 0) this.caption = null;
    this.feedBridge(realDt);
    this.pushHud(false, realDt);
  }

  /** Run the chronicle up to `year` (never past the next stop) and react to what happened. */
  private advanceTo(year: number): void {
    const run = this.chron;
    const stop = this.director?.nextStop;
    const target = Math.min(year, stop ? stop.whole - 1e-6 : Infinity);
    if (!run || run.ended || target <= run.year) return;
    this.handle(run.advance(target));
  }

  private handle(events: readonly ChronicleEvent[]): void {
    for (const e of events) {
      switch (e.kind) {
        case 'flood':
          if (this.stage === 'run') this.swell = new Swell(e.level);
          break;
        case 'quake':
          if (this.stage === 'run') this.g.deps.bridge.tremor(Math.min(1, e.capacity > 0 ? e.pga / e.capacity : 1));
          break;
        case 'era':
          this.newEra(e.era);
          break;
        case 'century':
          this.g.sfx('century');
          break;
        case 'warning':
          this.warn();
          break;
        case 'collapse':
          if (this.stage === 'run') this.fall(e.info);
          return;
        default:
          break;
      }
    }
    this.appliedYear = -1;
  }

  private beginStop(beat: Beat): void {
    const run = this.chron;
    const level = this.level;
    if (!run || !level) return;
    if (beat.kind === 'end') return this.ending();
    // Only now does the chronicle live through the year: the outcome is decided as it plays.
    const events = run.advance(beat.whole);
    this.handle(events.filter((e) => e.kind !== 'collapse' && e.kind !== 'flood' && e.kind !== 'quake'));
    const v = new Vignette({ deps: this.g.deps, scene: this.g.scene, level, safety: run.state.safety, shake: (a) => this.g.cam.shake(a) }, beat, events);
    if (v.empty) {
      this.director?.release(beat);
      return;
    }
    this.vignette = v;
    this.stage = 'stop';
    this.swell = null;
    this.hour = 13.6;
    this.say(v.caption);
    if (this.geometry) void this.g.cam.to(this.g.cam.event(this.geometry), 1.8, 'in-out');
  }

  private endStop(): void {
    const v = this.vignette;
    this.vignette = null;
    if (!v) return;
    this.stage = 'run';
    this.director?.release(v.beat);
    if (this.geometry) void this.g.cam.to(this.g.cam.time(this.geometry), 2.4, 'in-out');
    if (v.lowest < NEAR_MISS && !v.collapse) this.g.deps.ui.toast(say('nearMiss', { n: formatNumber(v.lowest, 2) }));
    this.captionLeft = Math.min(this.captionLeft, 1.6);
  }

  private fall(info: CollapseInfo): void {
    if (this.stage === 'falling' || !this.level) return;
    this.stage = 'falling';
    const level = this.level;
    this.say(String(Math.floor(info.year)));
    // While the years spin the hour is a blur; when it settles it must not settle on a night.
    if (this.hour < 8.5 || this.hour > 17) this.hour = 15.6;
    this.script(async () => {
      // Time stops where it happened; the light comes back to a real day before it goes.
      await this.wait(this.vignette ? 0.2 : 1.1);
      this.g.go({ to: 'fall', info, years: Math.max(0, Math.floor(info.year) - level.year) });
    });
  }

  private ending(): void {
    const run = this.chron;
    const level = this.level;
    if (!run || !level || !this.geometry) return;
    this.stage = 'ending';
    const events = run.advance(level.endYear);
    const fell = events.find((e) => e.kind === 'collapse');
    if (fell && fell.kind === 'collapse') return this.fall(fell.info);
    this.hour = 16.4;
    const { bridge, audio } = this.g.deps;
    bridge.setTraffic(null, 0);
    if (this.g.settings.current.ambientLife) void bridge.cross('cyclist', 3, 11);
    audio.setMood('legacy', 4);
    this.say(`${level.endYear} · ${say('ending')}`, 9);
    void this.g.cam.to(this.g.cam.event(this.geometry), 4, 'in-out');
    this.script(async () => {
      await this.wait(8.5 / this.rate);
      this.g.go({ to: 'result' });
    });
  }

  /* -- what the moment shows ---------------------------------------------------------------- */

  private say(text: string | null, seconds = CAPTION_SECONDS): void {
    this.caption = text;
    this.captionLeft = text ? seconds : 0;
  }

  private newEra(era: TrafficEra): void {
    const before = this.era;
    this.era = era;
    this.density = -1;
    this.say(eraCaption(era, before));
    const fresh = era.actors.find((a) => !before?.actors.includes(a)) ?? era.actors[0];
    if (fresh && this.g.settings.current.ambientLife) void this.g.deps.bridge.cross(fresh, 3, 7);
  }

  private warn(): void {
    const level = this.level;
    const d = this.director;
    if (!level || !d) return;
    // Once per warning: what the plumb bob trembles for, in plain words.
    this.g.deps.ui.toast(warningWords(this.chron?.state.weakness), 'warn');
    if (level.index === 1 && this.g.coach.offer('k1.repair', 'repair', { kind: 'control', id: 'repair' }, 'tap')) {
      d.cap = LESSON_PACE;
      this.capLeft = 9;
    } else {
      d.cap = Math.min(d.cap, WARNING_PACE);
      this.capLeft = Math.max(this.capLeft, WARNING_SECONDS);
    }
  }

  /** The calendar, the sun and the river for the world. */
  private flowWorld(realDt: number, dt: number): void {
    const d = this.director;
    const level = this.level;
    if (!d || !level) return;
    const { scene } = this.g;
    const moving = this.stage === 'run' && !this.paused;
    const want = this.stage === 'sun' || this.stage === 'stop' || this.stage === 'ending' || this.stage === 'falling' || !moving ? 0 : smoothstep(0.004, 0.06, d.pace);
    this.lapse = damp(this.lapse, want, want > this.lapse ? 3 : 1.6, realDt);
    if (this.lapse < 0.002) this.lapse = 0;
    const year = this.stage === 'ending' ? level.endYear + 0.35 : d.year;
    scene.time = { year, season: fract(year), hour: this.hour, lapse: this.lapse };
    if (this.stage === 'stop') return;
    const water = annualWater(level, year, fract(year), this.lapse);
    const swollen = this.swell && this.stage === 'run' ? this.swell.over(water, dt) : null;
    if (!swollen) this.swell = null;
    if (this.stage !== 'falling') scene.setWater(swollen ?? water);
  }

  /** The bridge follows the chronicle; the era's traffic crosses while the pace is low. */
  private feedBridge(realDt: number): void {
    const run = this.chron;
    const d = this.director;
    if (!run || !d || !this.geometry) return;
    const { bridge, world } = this.g.deps;
    this.clocks.apply -= realDt;
    if (this.clocks.apply <= 0 && run.year !== this.appliedYear) {
      this.clocks.apply = 0.12;
      this.appliedYear = run.year;
      bridge.apply(run.state);
      world.setBridge(this.geometry, run.state.piers.map((p) => p.scour));
    }
    const calm = this.stage === 'stop' ? (this.vignette?.beat.kind === 'flood' ? 0 : 0.5) : 1 - smoothstep(0.3, 2.5, d.pace);
    const density = this.g.settings.current.ambientLife && this.stage !== 'ending' ? Math.round(calm * 8) / 10 : 0;
    if (density !== this.density) {
      this.density = density;
      bridge.setTraffic(density > 0 ? this.era : null, density);
    }
    const pace = this.stage === 'run' && !this.paused ? d.pace : 0;
    this.clocks.speed -= realDt;
    if (this.clocks.speed <= 0 && Math.abs(pace - this.lastSpeed) > Math.max(0.05, this.lastSpeed * 0.15)) {
      this.clocks.speed = 0.25;
      this.lastSpeed = pace;
      this.g.deps.bus.emit('time:speed', { yearsPerSecond: pace });
    }
    const level = this.level;
    if (level && !this.outlasted && run.year >= level.year + level.passYears) {
      this.outlasted = true;
      this.g.deps.ui.toast(say('outlast'), 'good');
    }
  }

  private pushHud(force: boolean, realDt = 0): void {
    const run = this.chron;
    const d = this.director;
    const level = this.level;
    const built = this.g.session.built;
    if (!run || !d || !level || !built) return;
    this.clocks.quote -= realDt;
    if (force || this.clocks.quote <= 0) {
      this.clocks.quote = 0.5;
      this.quote = run.ended || run.state.collapsed ? { possible: false, stones: 0 } : run.quote();
    }
    this.clocks.hud -= realDt;
    if (!force && this.clocks.hud > 0) return;
    this.clocks.hud = 1 / 15;
    const year = this.stage === 'ending' ? level.endYear : Math.min(d.year, level.endYear);
    this.g.deps.ui.setTime({
      year,
      endYear: level.endYear,
      builtYear: level.year,
      safety: this.vignette?.safety ?? run.state.safety,
      speed: d.speed,
      paused: this.paused || this.stage === 'sun',
      repair: this.quote,
      stones: built.geometry.stones.total + run.state.repairStones,
      caption: this.caption,
      season: fract(this.stage === 'ending' ? 0.35 : d.year),
    });
  }

  /* -- the player --------------------------------------------------------------------------- */

  override intent(intent: UiIntent): boolean {
    const d = this.director;
    switch (intent.type) {
      case 'canvas':
        this.sunGesture(intent);
        return true;
      case 'look':
        return this.sun.holding;
      case 'pause':
        if (this.stage === 'sun') {
          if (!intent.on) this.start();
        } else if (this.paused !== intent.on) {
          this.paused = intent.on;
          if (intent.on && this.lapse > 0.9) this.hour = 15.2;
          else if (!intent.on && this.stage === 'run') d?.launch();
          this.pushHud(true);
        }
        return true;
      case 'speed':
        if (d) d.speed = intent.value;
        this.pushHud(true);
        return true;
      case 'repair':
        if (this.chron && this.repairs && (this.stage === 'run' || this.stage === 'stop')) {
          const year = this.chron.year;
          const done = this.repairs.press(this.chron);
          if (done === 'repaired') {
            this.g.session.repairYears.push(year);
            const line = say('repairDone', { n: this.repairs.lastStones });
            if (this.stage === 'run') this.say(line, 2.2);
            else this.g.deps.ui.toast(line, 'good');
            this.g.coach.done('k1.repair');
            if (d) d.cap = Infinity;
            this.appliedYear = -1;
            this.clocks.quote = 0;
          }
        }
        this.pushHud(true);
        return true;
      case 'skip':
        if (this.stage === 'ending') this.g.go({ to: 'result' });
        return true;
      default:
        return false;
    }
  }

  /** Take hold of the sun and draw it across the sky: the hour follows; letting go starts time. */
  private sunGesture(e: Extract<UiIntent, { type: 'canvas' }>): void {
    if (this.stage !== 'sun') return;
    const held = this.sun.gesture(e, Math.max(1, this.g.deps.viewport().width), this.hour);
    this.hour = held.hour;
    if (held.go) this.start();
  }

  override exit(): void {
    super.exit();
    this.g.deps.ui.setTime(null);
    this.g.deps.world.fx.driftwood(0);
  }

  override describe(): Record<string, unknown> {
    const d = this.director;
    return { stage: this.stage, year: d?.year ?? 0, pace: d?.pace ?? 0, paused: this.paused, lapse: this.lapse, safety: this.chron?.state.safety ?? 0, caption: this.caption, beat: this.vignette?.beat.kind ?? null };
  }
}
