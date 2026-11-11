/**
 * Repair in the centuries (DESIGN 2.5): Onar repoints the joints, clears the growth and protects
 * the pier feet, at a cost in stones that counts towards the lean seal. If the river's greatest
 * flood is still to come, the first repair also forfeits the unrepaired seal; that is said plainly
 * once, and the next press repairs.
 */
import type { ChronicleRun } from '../../core/contracts';
import type { BridgeGeometry } from '../../core/types';
import { mainSpan } from '../design/handles';
import { say } from '../text';
import type { GameDeps } from '../types';

export type RepairOutcome = 'nothing' | 'warned' | 'repaired';

export class Repairs {
  private warned = false;
  /** Stones the last repair used. */
  lastStones = 0;

  constructor(
    private readonly deps: GameDeps,
    private readonly geometry: BridgeGeometry,
    private readonly greatestYear: number,
  ) {}

  press(run: ChronicleRun): RepairOutcome {
    const { ui, bus, world } = this.deps;
    const quote = run.quote();
    if (!quote.possible) {
      ui.toast(say('repairNothing'));
      return 'nothing';
    }
    const forfeits = run.state.repairs === 0 && this.greatestYear > run.year;
    if (forfeits && !this.warned) {
      this.warned = true;
      ui.toast(say('repairSeal', { n: quote.stones }), 'warn');
      return 'warned';
    }
    if (!run.repair()) {
      ui.toast(say('repairNothing'));
      return 'nothing';
    }
    // Fresh stones are set in the work: the masons' thuds and a breath of mortar dust.
    const sp = this.geometry.spans[mainSpan(this.geometry)];
    const at = { x: sp?.crown.x ?? 0, y: (sp?.crown.y ?? 2) - 0.4, z: this.geometry.width / 2 };
    bus.emit('stone:land', { at, mass: 0.4, part: 'voussoir', count: Math.min(12, Math.max(3, Math.round(quote.stones / 20))) });
    world.fx.dust('puff', at, 1.2);
    // Said by the caller as the moment's caption: a toast per repair piles up when they are close.
    this.lastStones = quote.stones;
    return 'repaired';
  }
}
