/**
 * Arrive (DESIGN 2.1): black, the river first; the year and the place in large type; the camera
 * glides in from high upstream to the working view; the ledger's lines for this river appear one
 * at a time. About fifteen seconds, and any skip goes straight to the drawing board.
 */
import type { UiIntent } from '../../core/contracts';
import { lt } from '../../core/i18n';
import { PhaseBase } from './base';

/** Seconds between ledger lines (the interface's own pace) and the reading time after the last. */
const LINE_GAP = 1.1;
const READ_AFTER = 3.2;

export class ArrivePhase extends PhaseBase {
  readonly id = 'arrive' as const;
  private stage: 'loading' | 'survey' | 'story' = 'loading';

  protected override async run(): Promise<void> {
    const { deps, session, scene, cam } = this.g;
    const level = session.level;
    if (!level) return this.g.go({ to: 'title' });
    const { ui, sim, audio, bridge, world } = deps;
    deps.curtain(1, 0.5);
    ui.setScreen({ id: 'none' });
    ui.setDesign(null);
    ui.setBuild(null);
    ui.setTime(null);
    ui.caption(null);
    ui.setVisible(true);
    audio.setMood('survey', 4);
    scene.setLevel(level);
    scene.birds = 1;
    await this.wait(0.5);
    await this.keep(this.g.ensureWorld(level));
    bridge.clear();
    world.setBridge(null);
    const framing = sim.geometry(level, level.starter);
    cam.set(cam.arrival(framing));
    // The river is heard before anything is seen.
    await this.wait(0.8);
    this.stage = 'survey';
    ui.setScreen({ id: 'survey', level });
    deps.curtain(0, 2.4);
    void cam.to(cam.working(framing), 8, 'in-out');
    await this.wait(3.8);
    const story = session.story;
    if (story) {
      this.stage = 'story';
      const lines = story.intro.lines.map((l) => lt(l));
      ui.setScreen({ id: 'vignette', heading: lt(story.intro.heading), lines, year: level.year });
      await this.wait(0.6 + lines.length * LINE_GAP + READ_AFTER);
    }
    this.g.go({ to: 'design' });
  }

  override intent(intent: UiIntent): boolean {
    if (intent.type === 'skip' && this.stage !== 'loading') {
      this.g.deps.curtain(0, 0.4);
      this.g.go({ to: 'design' });
      return true;
    }
    return false;
  }

  override describe(): Record<string, unknown> {
    return { stage: this.stage };
  }
}
