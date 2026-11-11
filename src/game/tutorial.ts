/**
 * Teaching (DESIGN 8): one short line and a ghost hand on the real control, completed by the
 * player's own action and remembered in the save so nothing is explained twice. River 1 teaches
 * the whole craft in order; every later river teaches the tools it unlocks, one step per tool.
 */
import type { CoachStep, UiApi } from '../core/contracts';
import type { LevelDef, SaveData, ToolId } from '../core/types';
import { say, type TextKey } from './text';

type Target = CoachStep['target'];
type Gesture = CoachStep['gesture'];

interface Shown {
  readonly id: string;
  readonly text: TextKey;
  readonly target: Target;
  readonly gesture: Gesture;
}

/** Tools each later river brings that the one before did not have. */
export function newTools(levels: readonly LevelDef[], level: LevelDef): ToolId[] {
  const i = levels.findIndex((l) => l.id === level.id);
  if (i <= 0) return [];
  const before = new Set(levels[i - 1]!.tools);
  return level.tools.filter((t) => !before.has(t) && t !== 'rise' && t !== 'thickness');
}

export class Coach {
  private shown: Shown | null = null;

  constructor(
    private readonly ui: UiApi,
    private readonly save: () => SaveData,
    private readonly persist: () => void,
  ) {}

  taught(id: string): boolean {
    return this.save().taught.includes(id);
  }

  get active(): string | null {
    return this.shown?.id ?? null;
  }

  /** Show a step unless it was already learnt. Returns true when it is on screen. */
  offer(id: string, text: TextKey, target: Target, gesture?: Gesture): boolean {
    if (this.taught(id)) return false;
    // Targets are rebuilt on every design change; re-sending an unchanged step would restart the ghost hand.
    if (this.shown?.id === id && JSON.stringify(this.shown.target) === JSON.stringify(target)) return true;
    this.shown = { id, text, target, gesture };
    this.send();
    return true;
  }

  /** The player did the thing: never show it again. */
  done(id: string): void {
    const save = this.save();
    if (!save.taught.includes(id)) {
      save.taught.push(id);
      this.persist();
    }
    if (this.shown?.id === id) this.clear();
  }

  /** Take the current step off the screen without counting it as learnt. */
  clear(): void {
    if (!this.shown) return;
    this.shown = null;
    this.ui.coach(null);
  }

  /** Re-send in a new language. */
  refresh(): void {
    if (this.shown) this.send();
  }

  private send(): void {
    const s = this.shown;
    if (!s) return;
    const step: CoachStep = s.gesture ? { text: say(s.text), target: s.target, gesture: s.gesture } : { text: say(s.text), target: s.target };
    this.ui.coach(step);
  }
}

/** The coach line and control for a newly unlocked tool. */
export function toolStep(tool: ToolId): { text: TextKey; target: Target; gesture: Gesture } | null {
  switch (tool) {
    case 'fullness':
      return { text: 'tool.fullness', target: { kind: 'handle', id: { kind: 'haunch', index: 0 } }, gesture: 'drag-out' };
    case 'cover':
      return { text: 'tool.cover', target: { kind: 'handle', id: { kind: 'cover', index: 0 } }, gesture: 'drag-up' };
    case 'piers':
      return { text: 'tool.piers', target: { kind: 'control', id: 'add-pier' }, gesture: 'tap' };
    case 'pier-width':
      return { text: 'tool.pier-width', target: { kind: 'handle', id: { kind: 'pier-side', index: 0 } }, gesture: 'drag-side' };
    case 'cutwaters':
      return { text: 'tool.cutwaters', target: { kind: 'control', id: 'toggle-cutwaters' }, gesture: 'tap' };
    case 'foundation':
      return { text: 'tool.foundation', target: { kind: 'handle', id: { kind: 'foundation', index: 0 } }, gesture: 'drag-down' };
    case 'reliefs':
      return { text: 'tool.reliefs', target: { kind: 'control', id: 'toggle-reliefs' }, gesture: 'tap' };
    case 'spring':
      return { text: 'tool.spring', target: { kind: 'handle', id: { kind: 'spring', index: 0 } }, gesture: 'drag-up' };
    case 'clamps':
      return { text: 'tool.clamps', target: { kind: 'control', id: 'toggle-clamps' }, gesture: 'tap' };
    case 'piles':
      return { text: 'tool.piles', target: { kind: 'control', id: 'toggle-piles' }, gesture: 'tap' };
    default:
      return null;
  }
}
