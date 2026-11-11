/**
 * Balance facts recorded from `npm run balance -- --json` (docs/BALANCE.md) and checked by
 * src/content/balance.test.ts: the starter's fate left alone, a design that passes, a design that
 * earns all three seals, and the cheapest bridge a careful player (at most four repairs) stands in
 * 2026 with. The par is set from the dearer of the last two. Designs are the search vectors of
 * tuning/space.ts.
 */
import type { LevelId } from '../../core/types';
import type { Params } from './space';
import type { RepairPolicy } from './trial';

export interface BalanceFact {
  readonly id: LevelId;
  /** fate() of the starter with no repairs: "1147 strike", or "stands". */
  readonly starter: string;
  readonly pass: Params;
  /** A masterwork at par, run with `masterPolicy`; null where the search found none. */
  readonly master: Params | null;
  readonly masterPolicy: RepairPolicy;
  /** Stones (repairs included) of the masterwork design. */
  readonly masterStones: number | null;
  /** The cheapest design found standing in 2026 with at most four repairs, run with `carefulPolicy`. */
  readonly careful: Params;
  readonly carefulPolicy: RepairPolicy;
  /** Its stones, repairs included. The par is set from the dearer of this and `masterStones`. */
  readonly cheapestStanding: number;
}

type Shape = Pick<Params, 'spring' | 'rise' | 'fullness' | 'thickness' | 'cover'>;
type Extra = Partial<Omit<Params, keyof Shape>>;

/** A vector with no piers and the toggles off, plus what a fact changes. */
function v(shape: Shape, extra: Extra = {}): Params {
  return { piers: 0, pierWidth: 1, edge: 1, foundation: 1, cutwaters: false, reliefs: false, clamps: false, piles: false, ...shape, ...extra };
}

export const FACTS: readonly BalanceFact[] = [
  {
    id: 'koramaz',
    starter: '1147 strike',
    pass: v({ spring: 0.8, rise: 0.25, fullness: 1, thickness: 0.2, cover: 0.4 }),
    master: v({ spring: 0.8, rise: 0.25, fullness: 1, thickness: 0.9, cover: 0.4 }),
    masterPolicy: 'after',
    masterStones: 436,
    careful: v({ spring: 0.8, rise: 0.275, fullness: 1, thickness: 0.35, cover: 0.4 }),
    carefulPolicy: 'warn',
    cheapestStanding: 270,
  },
  {
    id: 'zamanti',
    starter: '1176 strike',
    pass: v({ spring: 0.6, rise: 0.325, fullness: 1, thickness: 0.3, cover: 0.5 }),
    master: v({ spring: 0.6, rise: 0.2, fullness: 1, thickness: 0.5, cover: 0.5 }),
    masterPolicy: 'after',
    masterStones: 635,
    careful: v({ spring: 0.6, rise: 0.25, fullness: 1, thickness: 0.3, cover: 0.5 }),
    carefulPolicy: 'warn',
    cheapestStanding: 502,
  },
  {
    id: 'kizilirmak',
    starter: '1451 weathering',
    pass: v({ spring: 1, rise: 0.25, fullness: 1, thickness: 0.5, cover: 0.3 }),
    master: v({ spring: 1, rise: 0.25, fullness: 1, thickness: 0.5, cover: 0.9 }),
    masterPolicy: 'after',
    masterStones: 1660,
    careful: v({ spring: 1, rise: 0.25, fullness: 1, thickness: 0.5, cover: 0.9 }),
    carefulPolicy: 'after',
    cheapestStanding: 1660,
  },
  {
    id: 'yesilirmak',
    starter: '1388 flood-scour',
    pass: v({ spring: 1, rise: 0.175, fullness: 1, thickness: 0.4, cover: 0.5 }, { piers: 2, pierWidth: 1.5, foundation: 1.5 }),
    master: v({ spring: 1, rise: 0.3, fullness: 1, thickness: 1.25, cover: 0.3 }, { piers: 4, pierWidth: 1.75, foundation: 1.5 }),
    masterPolicy: 'after',
    masterStones: 5288,
    careful: v({ spring: 1, rise: 0.225, fullness: 1, thickness: 1.1, cover: 0.4 }, { piers: 2, pierWidth: 3.75, edge: 0.8, foundation: 1.5 }),
    carefulPolicy: 'warn',
    cheapestStanding: 5113,
  },
  {
    id: 'dicle',
    starter: '1563 flood-scour',
    pass: v({ spring: 1, rise: 0.1, fullness: 0.5, thickness: 0.45, cover: 0.4 }, { piers: 5, pierWidth: 2.75, edge: 0.7, foundation: 4.75 }),
    master: v({ spring: 1, rise: 0.125, fullness: 0.7, thickness: 0.55, cover: 0.4 }, { piers: 6, pierWidth: 3, edge: 0.8, foundation: 4.25 }),
    masterPolicy: 'after',
    masterStones: 15302,
    careful: v({ spring: 1, rise: 0.15, fullness: 1, thickness: 0.4, cover: 0.3 }, { piers: 6, pierWidth: 3, edge: 0.9, foundation: 4.25 }),
    carefulPolicy: 'warn',
    cheapestStanding: 13597,
  },
  {
    id: 'batman',
    starter: '1338 flood-wash',
    pass: v({ spring: 8, rise: 0.225, fullness: 1, thickness: 0.6, cover: 0.3 }, { reliefs: true }),
    master: v({ spring: 8, rise: 0.225, fullness: 1, thickness: 0.6, cover: 0.5 }, { reliefs: true }),
    masterPolicy: 'after',
    masterStones: 2361,
    careful: v({ spring: 8, rise: 0.2, fullness: 1, thickness: 0.75, cover: 0.4 }, { reliefs: true }),
    carefulPolicy: 'after',
    cheapestStanding: 2632,
  },
  {
    id: 'aras',
    starter: '1590 flood-wash',
    pass: v({ spring: 1, rise: 0.275, fullness: 1, thickness: 0.4, cover: 0.4 }, { piers: 4, pierWidth: 3, foundation: 2 }),
    master: v({ spring: 2.3, rise: 0.1, fullness: 1, thickness: 1, cover: 0.3 }, { piers: 3, pierWidth: 3.25, foundation: 2, cutwaters: true }),
    masterPolicy: 'after',
    masterStones: 11798,
    careful: v({ spring: 2.5, rise: 0.1, fullness: 1, thickness: 0.95, cover: 0.6 }, { piers: 3, pierWidth: 3.75 }),
    carefulPolicy: 'warn',
    cheapestStanding: 10669,
  },
  {
    id: 'arpacay',
    starter: '1513 flood-wash',
    pass: v({ spring: 8, rise: 0.3, fullness: 1, thickness: 0.6, cover: 0.7 }),
    master: v({ spring: 8, rise: 0.275, fullness: 1, thickness: 1.05, cover: 0.8 }, { reliefs: true, clamps: true }),
    masterPolicy: 'after',
    masterStones: 3995,
    careful: v({ spring: 8, rise: 0.275, fullness: 1, thickness: 0.9, cover: 0.8 }, { reliefs: true, clamps: true }),
    carefulPolicy: 'warn',
    cheapestStanding: 3712,
  },
  {
    id: 'firtina',
    starter: '1401 flood-wash',
    pass: v({ spring: 4.5, rise: 0.15, fullness: 1, thickness: 0.35, cover: 0.3 }, { reliefs: true }),
    master: v({ spring: 4.5, rise: 0.3, fullness: 0.9, thickness: 0.4, cover: 0.3 }, { reliefs: true }),
    masterPolicy: 'after',
    masterStones: 587,
    careful: v({ spring: 4.5, rise: 0.3, fullness: 0.9, thickness: 0.4, cover: 0.3 }, { reliefs: true }),
    carefulPolicy: 'after',
    cheapestStanding: 587,
  },
  {
    id: 'sakarya',
    starter: '1767 flood-scour',
    pass: v({ spring: 0.75, rise: 0.1, fullness: 0.9, thickness: 0.45, cover: 0.3 }, { piers: 3, pierWidth: 5, foundation: 3.5, piles: true }),
    master: v({ spring: 1.5, rise: 0.1, fullness: 1, thickness: 0.4, cover: 0.3 }, { piers: 4, pierWidth: 2, edge: 0.9, piles: true }),
    masterPolicy: 'after',
    masterStones: 6623,
    careful: v({ spring: 1.5, rise: 0.1, fullness: 1, thickness: 0.45, cover: 0.3 }, { piers: 4, pierWidth: 2.5, edge: 0.9, piles: true }),
    carefulPolicy: 'warn',
    cheapestStanding: 6979,
  },
  {
    id: 'tunca',
    starter: '1621 flood-scour',
    pass: v({ spring: 0.5, rise: 0.15, fullness: 0.6, thickness: 0.4, cover: 0.4 }, { piers: 9, pierWidth: 2.5, edge: 0.9, foundation: 1.5, piles: true }),
    master: v({ spring: 0.75, rise: 0.125, fullness: 0.7, thickness: 0.5, cover: 0.3 }, { piers: 9, pierWidth: 2, edge: 0.9, piles: true }),
    masterPolicy: 'after',
    masterStones: 11783,
    careful: v({ spring: 0.75, rise: 0.125, fullness: 0.7, thickness: 0.5, cover: 0.3 }, { piers: 9, pierWidth: 2, edge: 0.9, piles: true }),
    carefulPolicy: 'warn',
    cheapestStanding: 11782,
  },
  {
    id: 'ergene',
    starter: '1773 flood-wash',
    pass: v({ spring: 0.8, rise: 0.39, fullness: 1, thickness: 0.3, cover: 0.5 }, { piers: 12, pierWidth: 2, piles: true }),
    master: v({ spring: 0.8, rise: 0.375, fullness: 0.9, thickness: 0.75, cover: 0.3 }, { piers: 12, pierWidth: 2.25, edge: 0.9, foundation: 1.75, reliefs: true, clamps: true, piles: true }),
    masterPolicy: 'after',
    masterStones: 12097,
    careful: v({ spring: 0.8, rise: 0.375, fullness: 0.9, thickness: 0.75, cover: 0.3 }, { piers: 12, pierWidth: 2.25, edge: 0.9, foundation: 1.75, reliefs: true, clamps: true, piles: true }),
    carefulPolicy: 'after',
    cheapestStanding: 12097,
  },
  {
    id: 'millennium',
    starter: '1502 flood-scour',
    pass: v({ spring: 3.75, rise: 0.1, fullness: 0, thickness: 0.6, cover: 0.5 }, { piers: 1, pierWidth: 2.75, edge: 0.7, foundation: 1.25, piles: true }),
    master: v({ spring: 3, rise: 0.1, fullness: 1, thickness: 1.15, cover: 0.3 }, { piers: 1, pierWidth: 2, piles: true }),
    masterPolicy: 'after',
    masterStones: 4345,
    careful: v({ spring: 4, rise: 0.1, fullness: 1, thickness: 0.9, cover: 0.3 }, { pierWidth: 2.75, piles: true }),
    carefulPolicy: 'warn',
    cheapestStanding: 3307,
  },
];
