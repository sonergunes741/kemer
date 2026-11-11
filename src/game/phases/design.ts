/**
 * Design (DESIGN 2.2): the camera flattens into a true side view, the bridge shows as a pale
 * draft, and every handle move rebuilds the draft, the line of thrust and the gauge. The rules of
 * what a move means live in design/editor.ts; this phase wires them to the interface, the sound
 * and the coach, and starts the build when the player presses Kur.
 */
import type { HandleId, UiIntent } from '../../core/contracts';
import { DesignEditor, type Feedback } from '../design/editor';
import { mainSpan } from '../design/handles';
import { buildDesignModel, floodMarks, type FloodMark } from '../design/model';
import { newTools, toolStep } from '../tutorial';
import { PhaseBase } from './base';

/** Seconds the coach's line about the gold line stays before the next lesson. */
const THRUST_LESSON = 5;

export class DesignPhase extends PhaseBase {
  readonly id = 'design' as const;
  private editor: DesignEditor | null = null;
  private marks: readonly FloodMark[] = [];
  private shownVersion = -1;
  private framedSpan = 0;
  private startRise = 0;
  private thrustShown = 0;

  protected override async run(): Promise<void> {
    const { deps, session, scene, cam } = this.g;
    const level = session.level;
    if (!level) return this.g.go({ to: 'title' });
    const { ui, sim, audio, bridge, world } = deps;
    session.clearAttempt();
    deps.curtain(0, 0.4);
    ui.setBuild(null);
    ui.setTime(null);
    ui.caption(null);
    ui.setVisible(true);
    scene.setLevel(level);
    scene.birds = 1;
    audio.setMood('design', 3);
    await this.keep(this.g.ensureWorld(level));
    const editor = new DesignEditor(sim, level, session.designFor(level), () => this.g.settings.current.units);
    editor.settle();
    this.editor = editor;
    this.marks = floodMarks(sim, level, session.record());
    this.startRise = editor.design.spans[0]?.rise ?? 0;
    ui.setScreen({ id: 'design', level });
    bridge.preview(level, editor.geometry);
    world.setBridge(editor.geometry);
    this.refresh();
    this.framedSpan = editor.geometry.deck.length > 0 ? editor.geometry.deck[editor.geometry.deck.length - 1]!.x - editor.geometry.deck[0]!.x : 0;
    cam.recentre();
    await cam.to(cam.design(editor.geometry), 1.6, 'in-out');
  }

  /** Push the current design everywhere it shows. */
  private refresh(): void {
    const e = this.editor;
    const level = this.g.session.level;
    if (!e || !level) return;
    if (e.version !== this.shownVersion) {
      this.shownVersion = e.version;
      this.g.deps.ui.setDesign(buildDesignModel(e, this.marks));
      this.g.deps.bridge.preview(level, e.geometry);
      this.g.session.keepDesign(level, e.design);
    }
    this.teach();
  }

  /** Sound for a change: the tick rising with the value, the knock at a stop, the warm note into safety. */
  private hear(fb: Feedback): void {
    const sfx = this.g.sfx;
    if (fb.tick !== null) sfx('handle-tick', { pitch: 0.85 + 0.65 * fb.tick, gain: 0.8 });
    if (fb.limit) sfx('handle-limit');
    if (fb.crossed === 'safe') sfx('safe');
    else if (fb.crossed === 'unsafe') sfx('unsafe');
  }

  /** After a change is complete: water around new piers, and a reframe if the bridge grew a lot. */
  private settled(): void {
    const e = this.editor;
    if (!e) return;
    this.g.deps.world.setBridge(e.geometry);
    const d = e.geometry.deck;
    const length = d.length > 0 ? d[d.length - 1]!.x - d[0]!.x : 0;
    if (this.framedSpan > 0 && Math.abs(length - this.framedSpan) / this.framedSpan > 0.25) {
      this.framedSpan = length;
      void this.g.cam.to(this.g.cam.design(e.geometry), 0.8, 'out');
    }
  }

  override intent(intent: UiIntent): boolean {
    const e = this.editor;
    if (!e) return intent.type === 'primary';
    let fb: Feedback | null = null;
    switch (intent.type) {
      case 'handle':
        if (intent.phase === 'grab') {
          e.grab(intent.id);
          this.g.sfx('handle-grab');
          if (intent.id.kind === 'ring') this.learnt('k1.thrust');
        } else if (intent.phase === 'drag') fb = e.dragTo(intent.id, intent.to);
        else {
          fb = e.release(intent.id, intent.to);
          this.g.sfx('handle-release');
          this.released(intent.id);
          this.settled();
        }
        break;
      case 'nudge':
        fb = e.nudge(intent.id, intent.steps);
        this.released(intent.id);
        this.settled();
        break;
      case 'add-pier':
        fb = e.addPier(intent.x);
        if (fb.changed) this.learnt('tool.piers');
        this.settled();
        break;
      case 'remove-pier':
        fb = e.removePier(intent.index);
        this.settled();
        break;
      case 'toggle':
        fb = e.toggle(intent.key, intent.value);
        if (fb.changed && intent.key !== 'linked') this.learnt(`tool.${intent.key}`);
        this.settled();
        break;
      case 'undo':
        fb = e.undo();
        this.settled();
        break;
      case 'redo':
        fb = e.redo();
        this.settled();
        break;
      case 'reset':
        fb = e.reset();
        this.settled();
        break;
      case 'primary':
        if (intent.phase === 'down' && e.insight.issues.length === 0) {
          this.learnt('k1.build');
          this.g.session.keepDesign(e.level, e.design);
          this.g.go({ to: 'build' });
        }
        return true;
      default:
        return false;
    }
    if (fb) this.hear(fb);
    this.refresh();
    return true;
  }

  /** What a completed handle move teaches. */
  private released(id: HandleId): void {
    const e = this.editor;
    if (!e) return;
    if (id.kind === 'crown' && (e.design.spans[0]?.rise ?? 0) >= this.startRise + 0.3) this.learnt('k1.raise');
    if (id.kind === 'ring' && e.insight.safety >= 1) this.learnt('k1.thicken');
    const tool = id.kind === 'haunch' ? 'fullness' : id.kind === 'pier-side' ? 'pier-width' : id.kind === 'crown' || id.kind === 'ring' || id.kind === 'pier' ? null : id.kind;
    if (tool) this.learnt(`tool.${tool}`);
  }

  private learnt(id: string): void {
    this.g.coach.done(id);
  }

  /** The next lesson this river has for the player, if any (DESIGN 8). */
  private teach(): void {
    const e = this.editor;
    const level = this.g.session.level;
    if (!e || !level) return;
    const coach = this.g.coach;
    const main = mainSpan(e.geometry);
    if (level.index === 1) {
      if (coach.offer('k1.raise', 'raise', { kind: 'handle', id: { kind: 'crown', index: main } }, 'drag-up')) return;
      if (!coach.taught('k1.thrust')) {
        const sp = e.geometry.spans[main];
        coach.offer('k1.thrust', 'thrust', sp ? { kind: 'elevation', at: sp.crown } : { kind: 'none' });
        return;
      }
      if (e.insight.safety < 1 && coach.offer('k1.thicken', 'thicken', { kind: 'handle', id: { kind: 'ring', index: main } }, 'drag-up')) return;
      if (e.insight.safety >= 1 && coach.offer('k1.build', 'build', { kind: 'control', id: 'primary' }, 'tap')) return;
      coach.clear();
      return;
    }
    for (const tool of newTools(this.g.deps.content.levels, level)) {
      const step = toolStep(tool);
      if (!step) continue;
      const target = step.target.kind === 'handle' && step.target.id.kind === 'haunch' ? { kind: 'handle' as const, id: { kind: 'haunch' as const, index: main } } : step.target;
      if (coach.offer(`tool.${tool}`, step.text, target, step.gesture)) return;
    }
    coach.clear();
  }

  protected override tick(dt: number): void {
    // The lesson on the gold line is read, not done: it gives way by itself.
    if (this.g.coach.active === 'k1.thrust') {
      this.thrustShown += dt;
      if (this.thrustShown > THRUST_LESSON) {
        this.learnt('k1.thrust');
        this.teach();
      }
    }
  }

  override exit(): void {
    super.exit();
    this.g.deps.ui.setDesign(null);
  }

  override describe(): Record<string, unknown> {
    const e = this.editor;
    return e ? { safety: e.insight.safety, stones: e.insight.stones.total, issues: e.insight.issues.map((i) => i.code), design: e.design } : {};
  }

  /** Harness: put a whole design on the board. */
  load(design: import('../../core/types').BridgeDesign): void {
    if (!this.editor) return;
    this.editor.load(design);
    this.refresh();
    this.settled();
  }
}
