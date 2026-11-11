/**
 * The fall (DESIGN 2.6): slow motion as the arch opens at its hinges and the stones drop into the
 * foam; real time returns as the last ones sink. Silence, then the river. Then the epitaph, the
 * years it stood and "Neden?": the drawing of the player's own bridge with the hinges it opened
 * at, why, and the family's advice. "Yeniden kur" goes back to the same design.
 */
import type { UiIntent, WaterState } from '../../core/contracts';
import { lt } from '../../core/i18n';
import { damp, lerp } from '../../core/math';
import type { CollapseInfo } from '../../core/types';
import { closeAttempt, strikeSummary } from '../attempt';
import { fallenModel, floodMarks } from '../design/model';
import { prefetchLevel } from '../preload';
import { nextLevel } from '../progress';
import { calmWater } from '../scene';
import { say } from '../text';
import { PhaseBase, type GameContext } from './base';

/** Longest the fall may take before the screen comes anyway (a stuck stone must not hold the game). */
const LONGEST = 20;
const DRAIN = 3.5;

export class FallPhase extends PhaseBase {
  readonly id = 'fall' as const;
  private stage: 'falling' | 'silence' | 'screen' = 'falling';
  private fallen = false;
  private skipped = false;
  private elapsed = 0;
  private drain: { t: number; from: WaterState } | null = null;

  constructor(
    g: GameContext,
    private readonly info: CollapseInfo,
    private readonly years: number | null,
  ) {
    super(g);
  }

  protected override async run(): Promise<void> {
    const { deps, session, scene, cam } = this.g;
    const level = session.level;
    const built = session.built;
    if (!level || !built) return this.g.go({ to: 'title' });
    const { ui, bridge, audio, content, sim } = deps;
    ui.setTime(null);
    ui.setBuild(null);
    ui.caption(null);
    ui.setScreen({ id: 'none' });
    ui.setVisible(false);
    cam.recentre();
    void cam.to(cam.fall(built.geometry), 1.6, 'in-out');
    bridge.setTraffic(null, 0);
    bridge.collapse(this.info).then(
      () => (this.fallen = true),
      () => (this.fallen = true),
    );
    await this.until(() => this.fallen || this.skipped || this.elapsed > LONGEST);

    this.stage = 'silence';
    scene.birds = 0;
    if (scene.water.level > 0.3) {
      this.drain = { t: 0, from: scene.water };
      deps.bus.emit('flood', { phase: 'end', level: 0, drama: 0.5 });
      deps.world.fx.driftwood(0);
    }
    await this.wait(this.skipped ? 0.3 : 1.6);

    const summary = session.run?.summary() ?? strikeSummary(level, built.geometry, this.info);
    const outcome = closeAttempt(this.g, summary);
    // The interface draws "Neden?" from the last design it saw: give it the bridge as it fell.
    ui.setDesign(fallenModel(sim, level, built.design, this.info, floodMarks(sim, level, outcome?.record ?? session.record())));
    ui.setDesign(null);
    const story = session.story;
    const hint = story?.hints[this.info.cause];
    const next = nextLevel(content.levels, level);
    this.stage = 'screen';
    ui.setVisible(true);
    audio.setMood('elegy', 3);
    ui.setScreen({
      id: 'collapse',
      level,
      epitaph: lt(content.epitaph(this.info)),
      why: lt(content.explain(this.info)),
      hint: hint ? lt(hint) : '',
      hasNext: !!next && !!outcome?.record.passed,
    });
    if (session.modeLine) {
      await this.wait(1.6);
      ui.toast(session.modeLine);
    }
    if (outcome?.newlyPassed && next) {
      prefetchLevel(next);
      await this.wait(2.5);
      ui.toast(say('unlocked', { river: lt(next.river) }), 'good');
    }
    await this.wait(4);
    scene.birds = 0.6;
  }

  protected override tick(dt: number): void {
    const { scene } = this.g;
    this.elapsed += dt;
    // The light comes back to a real day and a flood drains away after the fall.
    if (scene.time.lapse > 0) scene.time = { ...scene.time, lapse: Math.max(0, damp(scene.time.lapse, 0, 2.5, dt) - 0.001) };
    const d = this.drain;
    if (d) {
      d.t += dt;
      const k = Math.min(1, d.t / DRAIN);
      const calm = calmWater(this.g.session.level);
      scene.setWater({
        level: lerp(d.from.level, calm.level, k),
        speed: lerp(d.from.speed, calm.speed, k),
        turbidity: lerp(d.from.turbidity, calm.turbidity + 0.2, k),
        rough: lerp(d.from.rough, calm.rough, k),
        heap: lerp(d.from.heap, 0, k),
      });
      if (k >= 1) this.drain = null;
    }
  }

  override intent(intent: UiIntent): boolean {
    const level = this.g.session.level;
    switch (intent.type) {
      case 'skip':
        if (this.stage === 'falling') this.skipped = true;
        return true;
      case 'retry':
        if (this.stage !== 'screen') return true;
        this.g.go({ to: 'design' });
        return true;
      case 'next': {
        const next = level ? nextLevel(this.g.deps.content.levels, level) : null;
        if (this.stage === 'screen' && next) this.g.go({ to: 'arrive', level: next.id });
        return true;
      }
      default:
        return false;
    }
  }

  override exit(): void {
    super.exit();
    this.g.deps.ui.setVisible(true);
  }

  override describe(): Record<string, unknown> {
    return { stage: this.stage, cause: this.info.cause, year: this.info.year, years: this.years };
  }
}
