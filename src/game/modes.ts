/**
 * The modes beside the family's rivers. The river of the day (DESIGN 3) and the thousand years are
 * ordinary levels that run through the same arrive, design, build, strike and time phases; only
 * their record differs (attempt.ts). Both open once the story's first river is passed. The
 * epilogue (DESIGN 4) has a phase of its own.
 */
import type { LevelDef } from '../core/types';
import { isoDate, staleDaily } from './endless';
import type { GameContext } from './phases/base';
import { epilogueState, modesOpen } from './progress';
import { say } from './text';
import type { Mode } from './types';

export type ModeId = Exclude<Mode, 'story'>;

export function startMode(ctx: GameContext, mode: ModeId): void {
  const { deps, session } = ctx;
  if (mode === 'epilogue') {
    if (epilogueState(session.save) === 'locked') return;
    ctx.go({ to: 'epilogue' });
    return;
  }
  if (!modesOpen(deps.content.levels, session.save)) {
    deps.ui.toast(say('modesLocked'));
    return;
  }
  let level: LevelDef;
  if (mode === 'daily') {
    const date = isoDate();
    // Yesterday's river is not today's: its best design and seals must not carry over.
    if (staleDaily(session.save, date)) delete session.save.levels.daily;
    session.date = date;
    level = deps.content.daily(date);
  } else {
    session.date = null;
    level = deps.content.millennium();
  }
  session.adopt(level);
  ctx.go({ to: 'arrive', level: level.id });
}
