/** Entry point: boot the app; in development, hand the running game to the console as window.kemer. */
import './styles/base.css';
import { boot } from './app/App';
import { showFatal } from './app/fatal';
import { log } from './core/log';

boot()
  .then(async (handle) => {
    if (!handle || !import.meta.env.DEV) return;
    // Dev only: the harness driver is loaded on demand so it never ships.
    const { createHarness } = await import('./game/harness');
    (window as unknown as { kemer: unknown }).kemer = { game: handle.game, bus: handle.bus, hx: createHarness(handle.game) };
  })
  .catch((err: unknown) => {
    log.error('app', 'boot failed', err);
    showFatal('crash', err instanceof Error ? err.message : String(err));
  });
