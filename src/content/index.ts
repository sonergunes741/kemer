/**
 * The content module (docs/LEVELS.md): the twelve rivers and their ledger entries, the epilogue,
 * the generated rivers, ranks and the words on a fallen bridge. Pure data and text; the only
 * computation is the daily river’s par, which asks the simulation.
 */
import type { ContentApi, LevelStory, SimApi } from '../core/contracts';
import type { BridgeDesign, CollapseInfo, LevelDef, LevelId, LocalText } from '../core/types';
import { FAMILY_HINTS, epitaph, explain } from './epitaph';
import { makeDaily } from './generated';
import { koramaz, kizilirmak, yesilirmak, zamanti } from './levels/central';
import { aras, arpacay, batman, dicle } from './levels/east';
import { ergene, firtina, sakarya, tunca } from './levels/west';
import { MILLENNIUM } from './millennium';
import * as first from './stories/first';
import * as last from './stories/last';
import * as second from './stories/second';

export const LEVELS: readonly LevelDef[] = [koramaz, zamanti, kizilirmak, yesilirmak, dicle, batman, aras, arpacay, firtina, sakarya, tunca, ergene];

const STORIES: Partial<Record<LevelId, LevelStory>> = {
  koramaz: first.koramaz,
  zamanti: first.zamanti,
  kizilirmak: first.kizilirmak,
  yesilirmak: first.yesilirmak,
  dicle: first.dicle,
  batman: first.batman,
  aras: second.aras,
  arpacay: second.arpacay,
  firtina: second.firtina,
  sakarya: second.sakarya,
  tunca: second.tunca,
  ergene: second.ergene,
  epilogue: last.epilogue,
  daily: last.daily,
  millennium: last.millennium,
};

/** Every cause gets a hint: the river’s own where it has one, the family’s otherwise. */
function withFamilyHints(story: LevelStory): LevelStory {
  return { ...story, hints: { ...FAMILY_HINTS, ...story.hints } };
}

const RANKS: readonly { readonly from: number; readonly title: LocalText }[] = [
  { from: 33, title: { tr: 'Mimar', en: 'Architect' } },
  { from: 24, title: { tr: 'Başusta', en: 'Chief Master' } },
  { from: 14, title: { tr: 'Usta', en: 'Master' } },
  { from: 6, title: { tr: 'Kalfa', en: 'Journeyman' } },
  { from: 0, title: { tr: 'Çırak', en: 'Apprentice' } },
];

export function rank(seals: number): LocalText {
  const n = Number.isFinite(seals) ? seals : 0;
  for (const r of RANKS) if (n >= r.from) return r.title;
  return RANKS[RANKS.length - 1]!.title;
}

/** Elif comes to the player’s own bridge in 2026: the same river, the same years, her hand. */
export function makeEpilogue(source: LevelDef, design: BridgeDesign): LevelDef {
  return {
    ...source,
    id: 'epilogue',
    index: 13,
    builder: { tr: 'Elif Taşçı', en: 'Elif Taşçı' },
    passYears: Math.max(0, source.endYear - source.year),
    tools: [],
    starter: design,
  };
}

export function createContent(sim: SimApi): ContentApi {
  const dailies = new Map<string, LevelDef>();
  const stories = new Map<LevelId, LevelStory>();
  const byId = new Map<LevelId, LevelDef>(LEVELS.map((l) => [l.id, l]));
  return {
    levels: LEVELS,
    level(id: LevelId): LevelDef | null {
      if (id === 'millennium') return MILLENNIUM;
      return byId.get(id) ?? null;
    },
    story(id: LevelId): LevelStory | null {
      const cached = stories.get(id);
      if (cached) return cached;
      const story = STORIES[id];
      if (!story) return null;
      const full = withFamilyHints(story);
      stories.set(id, full);
      return full;
    },
    epilogue(source: LevelDef, design: BridgeDesign): LevelDef {
      return makeEpilogue(source, sim.normalize(source, design));
    },
    daily(date: string): LevelDef {
      const hit = dailies.get(date);
      if (hit) return hit;
      const level = makeDaily(sim, date);
      if (dailies.size > 8) dailies.clear();
      dailies.set(date, level);
      return level;
    },
    millennium(): LevelDef {
      return MILLENNIUM;
    },
    rank,
    epitaph(info: CollapseInfo): LocalText {
      return epitaph(info);
    },
    explain(info: CollapseInfo): LocalText {
      return explain(info);
    },
  };
}

export { CAUSES } from './epitaph';
export { LAST_OLD_ENTRY } from './stories/last';
