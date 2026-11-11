/**
 * Strike (DESIGN 2.4): low by the water, music gone, three wedges glowing under the centering.
 * Each tap is one mallet blow; on the third the centering drops into the river and the arch takes
 * its own weight, sinking by the computed amount. Then a second and a half of nothing: if it
 * stands, the river comes back first, then one bird, then the rest and a warm chord; if it
 * cannot stand, it falls here.
 */
import type { UiIntent } from '../../core/contracts';
import { log } from '../../core/log';
import { smallLength, say } from '../text';
import { PhaseBase } from './base';

/** Screen distance (CSS px) within which a tap picks a particular wedge. */
const WEDGE_REACH = 90;

export class StrikePhase extends PhaseBase {
  readonly id = 'strike' as const;
  private stage: 'approach' | 'wedges' | 'falling' | 'settle' | 'listen' = 'approach';
  private struck = 0;
  private busy = false;
  private freed = false;

  protected override async run(): Promise<void> {
    const { deps, session, cam, coach, scene } = this.g;
    const level = session.level;
    const built = session.built;
    if (!level || !built) return this.g.go({ to: 'title' });
    const { ui, audio, bridge } = deps;
    ui.setScreen({ id: 'build', level, step: 'wedges' });
    const p = bridge.progress;
    ui.setBuild({ laid: p.laid, total: p.total, action: '', hold: false });
    audio.setMood('hush', 1.6);
    scene.birds = 0.35;
    await cam.to(cam.strike(built.geometry), 2.4, 'in-out');
    if (!this.alive) return;
    this.stage = 'wedges';
    const first = bridge.wedges()[0];
    if (level.index === 1 && first) coach.offer('k1.wedges', 'wedges', { kind: 'elevation', at: { x: first.x, y: first.y } }, 'tap');
    await this.until(() => this.freed);

    coach.done('k1.wedges');
    scene.birds = 0;
    const verdict = built.strike;
    if (!verdict.stands && verdict.collapse) {
      this.stage = 'falling';
      this.g.go({ to: 'fall', info: verdict.collapse, years: null });
      return;
    }
    this.stage = 'settle';
    ui.setScreen({ id: 'build', level, step: 'settle' });
    await this.keep(bridge.settle(verdict.settle));
    const drop = Math.max(0, ...verdict.settle);
    ui.caption(smallLength(drop, this.g.settings.current.units), say('settled'));
    this.g.cam.shake(0.05);

    // The quiet after: the run is prepared now, while nothing moves.
    this.stage = 'listen';
    this.prepareRun();
    await this.wait(1.5);
    scene.birds = 0.15;
    await this.wait(1.1);
    scene.birds = 1;
    audio.setMood('relief', 0.4);
    await this.wait(2.2);
    ui.caption(null);
    this.g.go({ to: 'time' });
  }

  /** Capacities once, then the chronicle: the first ten-year check must not stall a frame. */
  private prepareRun(): void {
    const { session, deps } = this.g;
    const level = session.level;
    const built = session.built;
    if (!level || !built || session.run) return;
    try {
      deps.sim.capacities(level, built.design);
      session.run = deps.sim.run(level, built.design);
    } catch (err) {
      log.error('game', 'could not start the chronicle', err);
    }
  }

  override intent(intent: UiIntent): boolean {
    if (intent.type === 'canvas') {
      if (intent.phase === 'up') this.script(() => this.blow(intent.x, intent.y));
      return true;
    }
    if (intent.type === 'primary') {
      if (intent.phase === 'down') this.script(() => this.blow(null, null));
      return true;
    }
    return intent.type === 'look' && this.stage === 'wedges';
  }

  /** One mallet blow on the wedge nearest the tap (or the next one), each heavier than the last. */
  private async blow(x: number | null, y: number | null): Promise<void> {
    if (this.stage !== 'wedges' || this.busy || this.freed) return;
    const { bridge, world } = this.g.deps;
    const wedges = bridge.wedges();
    if (wedges.length === 0) return;
    let index = 0;
    if (x !== null && y !== null) {
      let best = WEDGE_REACH;
      wedges.forEach((w, i) => {
        const s = world.toScreen({ x: w.x, y: w.y });
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < best) {
          best = d;
          index = i;
        }
      });
    }
    this.busy = true;
    this.struck++;
    this.g.cam.shake(0.05 + 0.05 * this.struck);
    const last = wedges.length === 1;
    await this.keep(bridge.strikeWedge(index));
    this.busy = false;
    if (last) this.freed = true;
  }

  override describe(): Record<string, unknown> {
    return { stage: this.stage, struck: this.struck, wedges: this.g.deps.bridge.wedges().length };
  }
}
