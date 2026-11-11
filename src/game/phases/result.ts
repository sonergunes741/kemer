/**
 * The result (DESIGN 2.7): the years in large type, the build year and 2026 beneath, the three
 * seals stamped one after another (each with its thump on the bus), a line of story, and the way
 * on: the next river, build again, share. A river is passed once its bridge outlasts its builder;
 * the next one opens and the ledger says so.
 */
import type { UiIntent } from '../../core/contracts';
import { lt } from '../../core/i18n';
import { closeAttempt } from '../attempt';
import { prefetchLevel } from '../preload';
import { nextLevel } from '../progress';
import { say } from '../text';
import { PhaseBase } from './base';

/** The interface stamps the first seal after this long and the next ones this far apart. */
const FIRST_STAMP = 0.7;
const STAMP_GAP = 0.5;

export class ResultPhase extends PhaseBase {
  readonly id = 'result' as const;

  protected override async run(): Promise<void> {
    const { deps, session, cam, scene } = this.g;
    const level = session.level;
    const built = session.built;
    const run = session.run;
    if (!level || !built || !run) return this.g.go({ to: 'title' });
    const { ui, audio, content, bus } = deps;
    const summary = run.summary();
    const outcome = closeAttempt(this.g, summary);
    if (!outcome) return this.g.go({ to: 'title' });
    const story = session.story;
    const lines = (summary.passed ? story?.passed : story?.failed)?.map((l) => lt(l)) ?? [];
    if (session.modeLine) lines.push(session.modeLine);
    const next = nextLevel(content.levels, level);
    // The next river's stone and banks start downloading while the seals are stamped.
    if (next && outcome.record.passed) prefetchLevel(next);
    ui.setTime(null);
    ui.caption(null);
    ui.setVisible(true);
    ui.setScreen({ id: 'result', level, summary, record: outcome.record, newSeals: outcome.newSeals, hasNext: !!next && outcome.record.passed, lines });
    audio.setMood('relief', 3);
    scene.birds = 1;
    void cam.to(cam.title(built.geometry), 9, 'in-out');

    let at = FIRST_STAMP;
    for (const name of ['standing', 'lean', 'unrepaired'] as const) {
      if (!summary.seals[name]) continue;
      await this.wait(at);
      bus.emit('seal:stamp', { which: name });
      at = STAMP_GAP;
    }
    if (summary.masterwork) {
      await this.wait(at + 0.15);
      bus.emit('seal:stamp', { which: 'masterwork' });
    }
    if (outcome.newlyPassed && next) {
      await this.wait(1.8);
      ui.toast(say('unlocked', { river: lt(next.river) }), 'good');
    }
  }

  override intent(intent: UiIntent): boolean {
    const level = this.g.session.level;
    switch (intent.type) {
      case 'retry':
        this.g.go({ to: 'design' });
        return true;
      case 'next': {
        const next = level ? nextLevel(this.g.deps.content.levels, level) : null;
        if (next) this.g.go({ to: 'arrive', level: next.id });
        return true;
      }
      default:
        return false;
    }
  }

  override describe(): Record<string, unknown> {
    const s = this.g.session.run?.summary();
    return s ? { years: s.years, passed: s.passed, seals: s.seals, stones: s.stones } : {};
  }
}
