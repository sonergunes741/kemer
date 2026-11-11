/**
 * The title, and the ledger reached from it. The first time there is only the name and "Başla"
 * on black; "Başla" goes straight to the first river (DESIGN 2.1). Later the title sits over the
 * river the player will continue on, with their best bridge there standing in the evening light.
 */
import type { UiIntent, UiScreen } from '../../core/contracts';
import { lt } from '../../core/i18n';
import { log } from '../../core/log';
import { continueLevel, epilogueState, isFirstRun, ledgerEntries, modesOpen, totalSeals } from '../progress';
import { PhaseBase, type GameContext } from './base';

/** The ledger as the interface shows it, built from the save. */
export function ledgerScreen(g: GameContext): UiScreen {
  const { content, sim } = g.deps;
  const save = g.session.save;
  const entries = ledgerEntries(content.levels, save, (level, design) => {
    try {
      return sim.geometry(level, design);
    } catch (err) {
      log.once(`ledger:${level.id}`, 'game', 'could not draw a ledger bridge', err);
      return null;
    }
  });
  return { id: 'ledger', entries, rank: lt(content.rank(totalSeals(save))), mark: save.mark, epilogue: epilogueState(save) };
}

export class TitlePhase extends PhaseBase {
  readonly id = 'title' as const;
  private view: 'title' | 'ledger' = 'title';

  constructor(g: GameContext, private readonly boot: boolean) {
    super(g);
  }

  private titleScreen(): UiScreen {
    const save = this.g.session.save;
    const levels = this.g.deps.content.levels;
    const first = isFirstRun(save);
    const last = levels[levels.length - 1];
    return { id: 'title', firstRun: first, canContinue: !first, postgame: !!last && !!save.levels[last.id]?.passed, modes: modesOpen(levels, save) };
  }

  private show(): void {
    this.g.deps.ui.setScreen(this.view === 'title' ? this.titleScreen() : ledgerScreen(this.g));
  }

  protected override async run(): Promise<void> {
    const { deps, session, scene, cam } = this.g;
    const { ui, sim, bridge, world } = deps;
    ui.setDesign(null);
    ui.setBuild(null);
    ui.setTime(null);
    ui.caption(null);
    ui.setVisible(true);
    this.show();
    deps.audio.setMood('title', 3);
    const first = isFirstRun(session.save);
    // The very first time: black, and only the river behind the name once the sound starts.
    deps.curtain(first ? 1 : this.boot ? 1 : 0, 0);
    const level = continueLevel(deps.content.levels, session.save);
    scene.setLevel(level);
    scene.time.hour = 17.2;
    await this.keep(this.g.ensureWorld(level));
    const record = session.record(level.id);
    const design = record?.design ?? null;
    if (design) {
      const geometry = sim.geometry(level, design);
      const mark = session.save.mark && record?.markStone ? { stone: record.markStone, mark: session.save.mark } : null;
      await this.keep(bridge.showBuilt(level, geometry, mark));
      world.setBridge(geometry);
    } else {
      bridge.clear();
      world.setBridge(null);
    }
    cam.set(cam.title(sim.geometry(level, design ?? level.starter)));
    if (!first) deps.curtain(0, 1.6);
  }

  override intent(intent: UiIntent): boolean {
    const levels = this.g.deps.content.levels;
    switch (intent.type) {
      case 'begin':
        this.g.go({ to: 'arrive', level: levels[0]!.id });
        return true;
      case 'continue':
        this.g.go({ to: 'arrive', level: continueLevel(levels, this.g.session.save).id });
        return true;
      case 'open':
        if (intent.screen !== 'ledger') return false;
        this.view = 'ledger';
        this.show();
        return true;
      case 'close':
        if (this.view !== 'ledger') return false;
        this.view = 'title';
        this.show();
        return true;
      default:
        return false;
    }
  }

  override describe(): Record<string, unknown> {
    return { view: this.view };
  }
}
