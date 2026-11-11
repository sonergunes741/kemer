/**
 * Build (DESIGN 2.3): the centering goes up by itself; the player holds to lay the stones, brings
 * the keystone over the gap and lets go, watches the bridge complete, and cuts the family mark
 * (choosing it the first time). The verdict of the strike is decided here, silently, and kept in
 * the session: the strike phase only reveals it.
 */
import type { StoneRef, UiIntent } from '../../core/contracts';
import type { Vec2, Vec3 } from '../../core/types';
import { mainSpan } from '../design/handles';
import { PhaseBase } from './base';

type Step = 'centering' | 'stones' | 'keystone' | 'finish' | 'choose' | 'mark';

/** Stones laid before the hold lesson counts as learnt. */
const LAY_LESSON = 10;
/** A press on the picture that moves less than this (CSS px) is a tap. */
const TAP_SLOP = 12;

export class BuildPhase extends PhaseBase {
  readonly id = 'build' as const;
  private step: Step = 'centering';
  private holding = false;
  private laidShown = -1;
  private seat: Vec3 | null = null;
  private seated = false;
  private dropping = false;
  private marked = false;
  private carving = false;
  private press: { x: number; y: number; id: number } | null = null;
  private chosen: (() => void) | null = null;

  private get level() {
    return this.g.session.level;
  }

  private show(step: Exclude<Step, 'choose'>): void {
    const level = this.level;
    if (!level) return;
    this.step = step;
    const p = this.g.deps.bridge.progress;
    this.g.deps.ui.setScreen({ id: 'build', level, step });
    this.g.deps.ui.setBuild({ laid: p.laid, total: p.total, action: '', hold: step === 'stones' });
  }

  protected override async run(): Promise<void> {
    const { deps, session, cam, coach } = this.g;
    const level = this.level;
    if (!level) return this.g.go({ to: 'title' });
    const { sim, bridge, world, ui, audio } = deps;
    const design = session.designFor(level);
    const geometry = sim.geometry(level, design);
    // The fate is decided now and never shown: the strike reveals it.
    session.clearAttempt();
    session.built = { design, geometry, strike: sim.strike(level, design) };
    ui.setDesign(null);
    ui.setTime(null);
    ui.caption(null);
    ui.setVisible(true);
    this.show('centering');
    audio.setMood('build', 3);
    await this.keep(bridge.beginBuild(level, geometry));
    world.setBridge(geometry);
    cam.recentre();
    void cam.to(cam.build(geometry), 2.4, 'in-out');
    await this.keep(bridge.raiseCentering());

    this.show('stones');
    if (level.index === 1) coach.offer('k1.lay', 'lay', { kind: 'control', id: 'primary' }, 'hold');
    await this.until(() => bridge.progress.awaitingKeystone || bridge.progress.complete);

    if (!bridge.progress.complete) {
      this.holding = false;
      this.show('keystone');
      audio.setMood('hush', 1.5);
      const hang = bridge.hangKeystone();
      this.seat = hang.seat;
      void cam.to(cam.keystone(geometry, hang.seat), 1.6, 'in-out');
      if (level.index === 1) coach.offer('k1.keystone', 'keystone', { kind: 'elevation', at: { x: hang.seat.x, y: hang.seat.y + 0.9 } }, 'tap');
      await this.until(() => this.seated);
      await this.wait(0.9);
    }

    this.show('finish');
    audio.setMood('build', 2);
    void cam.to(cam.build(geometry), 2, 'in-out');
    await this.keep(bridge.finish());
    await this.wait(0.4);

    if (!session.save.mark) {
      this.step = 'choose';
      ui.setBuild(null);
      ui.setScreen({ id: 'mark', current: null });
      await new Promise<void>((done) => (this.chosen = done));
    }
    this.show('mark');
    void cam.to(cam.mark(geometry), 1.6, 'in-out');
    if (level.index === 1) {
      const stone = this.suggestedStone();
      const at = stone ? this.centroid(stone) : null;
      coach.offer('k1.mark', 'mark', at ? { kind: 'elevation', at } : { kind: 'none' }, 'tap');
    }
    await this.until(() => this.marked);
    this.g.persist();
    await this.wait(0.9);
    this.g.go({ to: 'strike' });
  }

  protected override tick(dt: number): void {
    if (this.step !== 'stones') return;
    const p = this.g.deps.bridge.lay(dt, this.holding);
    if (p.laid !== this.laidShown) {
      this.laidShown = p.laid;
      this.g.deps.ui.setBuild({ laid: p.laid, total: p.total, action: '', hold: true });
      if (p.laid >= LAY_LESSON) this.g.coach.done('k1.lay');
    }
  }

  override intent(intent: UiIntent): boolean {
    switch (intent.type) {
      case 'primary':
        if (this.step === 'stones') this.holding = intent.phase === 'down';
        else if (intent.phase === 'down' && this.step === 'keystone') this.script(() => this.lowerByKey());
        else if (intent.phase === 'down' && this.step === 'mark') {
          const stone = this.suggestedStone();
          if (stone) this.script(() => this.carve(stone));
        }
        return true;
      case 'canvas':
        this.canvas(intent);
        return true;
      case 'mark':
        if (this.step !== 'choose') return false;
        this.g.session.save.mark = intent.mark;
        this.g.persist();
        this.chosen?.();
        this.chosen = null;
        return true;
      case 'look':
        // The keystone and the mark take the pointer; the view holds still for them.
        return this.step === 'keystone' || this.step === 'mark';
      default:
        return false;
    }
  }

  private canvas(e: Extract<UiIntent, { type: 'canvas' }>): void {
    const { bridge } = this.g.deps;
    if (this.step === 'keystone') {
      if (e.phase === 'down' || e.phase === 'move') this.follow(e.x, e.y);
      else if (e.phase === 'up') {
        this.follow(e.x, e.y);
        this.script(() => this.drop());
      }
      return;
    }
    if (this.step !== 'mark' || this.carving) return;
    if (e.phase === 'move' && !this.press) bridge.hover(bridge.pick(e.x, e.y));
    else if (e.phase === 'down') this.press = { x: e.x, y: e.y, id: e.id };
    else if (e.phase === 'cancel') this.press = null;
    else if (e.phase === 'up' && this.press && this.press.id === e.id) {
      const tap = Math.hypot(e.x - this.press.x, e.y - this.press.y) < TAP_SLOP;
      this.press = null;
      const stone = tap ? bridge.pick(e.x, e.y) : null;
      if (stone) this.script(() => this.carve(stone));
    }
  }

  /** The hanging keystone follows the pointer, never below the gap it is meant for. */
  private follow(x: number, y: number): void {
    const seat = this.seat;
    const p = this.g.deps.world.fromScreen(x, y);
    if (!seat || !p || this.seated) return;
    this.g.deps.bridge.moveKeystone(p.x, Math.max(p.y, seat.y + 0.15));
  }

  private async drop(): Promise<void> {
    if (this.dropping || this.seated || this.step !== 'keystone') return;
    this.dropping = true;
    const ok = await this.keep(this.g.deps.bridge.dropKeystone());
    this.dropping = false;
    if (!ok) return;
    this.seated = true;
    this.g.coach.done('k1.keystone');
    this.g.cam.push(0.07, 0.45);
    this.g.cam.shake(0.16);
  }

  /** Keyboard twin of the gesture: the hoist brings the stone over the gap, then lets go. */
  private async lowerByKey(): Promise<void> {
    const seat = this.seat;
    if (!seat || this.dropping || this.seated) return;
    for (let attempt = 0; attempt < 4 && !this.seated; attempt++) {
      this.g.deps.bridge.moveKeystone(seat.x, seat.y + 0.5);
      await this.wait(attempt === 0 ? 1.1 : 0.8);
      await this.drop();
    }
  }

  private async carve(stone: StoneRef): Promise<void> {
    const mark = this.g.session.save.mark;
    if (this.carving || this.marked || !mark) return;
    this.carving = true;
    this.g.deps.bridge.hover(null);
    this.g.session.markStone = stone;
    await this.keep(this.g.deps.bridge.carve(stone, mark));
    this.g.coach.done('k1.mark');
    this.marked = true;
  }

  /** A good stone for the mark: on the main span, a little down from the crown. */
  private suggestedStone(): StoneRef | null {
    const g = this.g.session.built?.geometry;
    if (!g) return null;
    const span = mainSpan(g);
    const n = g.spans[span]?.voussoirs.length ?? 0;
    return n > 0 ? { span, stone: Math.max(0, Math.floor(n / 2) - 2) } : null;
  }

  private centroid(stone: StoneRef): Vec2 | null {
    return this.g.session.built?.geometry.spans[stone.span]?.voussoirs[stone.stone]?.centroid ?? null;
  }

  override exit(): void {
    super.exit();
    this.chosen = null;
    this.g.deps.bridge.hover(null);
  }

  override describe(): Record<string, unknown> {
    const p = this.g.deps.bridge.progress;
    return { step: this.step, laid: p.laid, total: p.total, holding: this.holding, seated: this.seated, marked: this.marked, seat: this.seat };
  }
}
