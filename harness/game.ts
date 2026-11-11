/**
 * Game harness: the whole game, booted exactly as the real page does, with its own save and
 * window.hx to drive it (see src/game/harness.ts).
 *
 *   /harness/game.html                      a fresh, in-memory save every load
 *   /harness/game.html?keep=1               a save kept in localStorage under its own prefix
 *   &level=zamanti&to=design|build|arrive   jump straight to a river once booted
 *   &pace=8                                 run the centuries eight times faster
 */
import '../src/styles/base.css';
import { boot } from '../src/app/App';
import { createStorage } from '../src/app/platform';
import type { LevelId } from '../src/core/types';
import { createHarness } from '../src/game/harness';
import { memoryStorage, prefixedStorage } from '../src/game/save';

const q = new URLSearchParams(location.search);
const storage = q.get('keep') === '1' ? prefixedStorage(createStorage(), 'hx.') : memoryStorage();

async function main(): Promise<void> {
  const handle = await boot({ storage });
  if (!handle) return;
  const hx = createHarness(handle.game);
  Object.assign(window, { hx, kemer: { game: handle.game, bus: handle.bus, hx } });
  const pace = Number(q.get('pace'));
  if (Number.isFinite(pace) && pace > 0) hx.pace(pace);
  const level = q.get('level') as LevelId | null;
  const to = q.get('to');
  if (level) await hx.jump(level, to === 'arrive' || to === 'build' ? to : 'design');
}

main().catch((err: unknown) => console.error('[game harness]', err));
