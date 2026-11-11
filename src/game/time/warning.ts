/**
 * The warning in plain words (SIM-SPEC section 10). When the service safety first falls under
 * 1.25 since the last repair the plumb bob trembles, and the player is told once, in the mason's
 * voice, what it trembles for: the thing that will bring the bridge down if nothing is done.
 */
import { lt } from '../../core/i18n';
import type { BridgeState, LocalText } from '../../core/types';

type Weakness = NonNullable<BridgeState['weakness']>;

/**
 * Fifteen years of warning are one second at full pace: when the plumb bob starts to tremble the
 * years slow to this many a second for WARNING_SECONDS, so the player can read the words and reach
 * for Onar. A repair lifts it at once.
 */
export const WARNING_PACE = 1.5;
export const WARNING_SECONDS = 5;

const WORDS: Record<Weakness, LocalText> = {
  joints: { tr: 'Derzler yıprandı. Onarmazsan kemer yükü taşıyamayacak.', en: 'The joints are worn. Unrepaired, the arch will not carry its load.' },
  traffic: { tr: 'Kemer gelen arabaları zor taşıyacak. Derzleri onar.', en: 'The arch will barely carry the carts to come. Repoint the joints.' },
  scour: { tr: 'Ayak dibi oyuluyor. Onarım dibine taş döker.', en: 'The river is digging at a pier. A repair lays stone around its foot.' },
  ground: { tr: 'Zemin oynuyor, kemer açılıyor. Derzleri onar.', en: 'The ground is giving and the arch is opening. Repoint the joints.' },
  none: { tr: 'Şakül titriyor.', en: 'The plumb bob trembles.' },
};

/** What the trembling plumb bob means, for the bridge's weakest point. */
export function warningWords(weakness: Weakness | undefined): string {
  return lt(WORDS[weakness ?? 'none']);
}
