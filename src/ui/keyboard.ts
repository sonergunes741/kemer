/**
 * Global keys. Each moment has its handful: Escape for the menu or to close a card, Space for the
 * primary control (held to lay stones) or to pause time, Z and Y for undo and redo, 1 2 4, P and
 * R in the centuries, Enter or Space to move past a story card. Keys that a focused control
 * understands itself (a button, a slider, a handle) are left to it.
 */
import type { TimeHud, UiIntent, UiScreen } from '../core/contracts';
import type { PrimaryControl } from './hud/primary';

export interface KeyboardDeps {
  screen(): UiScreen;
  overlay(): UiScreen | null;
  enabled(): boolean;
  /** The interface is faded out for a cinematic: Escape, Space and Enter skip it. */
  hidden(): boolean;
  time(): TimeHud | null;
  emit(intent: UiIntent): void;
  readonly primary: PrimaryControl;
}

/**
 * Elements that own Space, Enter and arrows while focused. A slider (a design handle) only reads
 * arrows, so Space stays the primary control: arrows shape the arch, Space builds it.
 */
function ownsKeys(el: Element | null, key: string): boolean {
  if (!el || !(el instanceof Element)) return false;
  if (el.closest('input, select, textarea, button')) return true;
  const role = el.getAttribute('role');
  if (role === 'slider') return key !== ' ' && key !== 'Enter';
  return role === 'button' || role === 'switch' || role === 'radio';
}

const CLOSABLE = new Set<UiScreen['id']>(['ledger', 'settings', 'keys', 'credits']);

export function attachKeyboard(target: Document, deps: KeyboardDeps): () => void {
  let spaceHeld = false;

  const onDown = (ev: KeyboardEvent): void => {
    if (!deps.enabled() || ev.defaultPrevented) return;
    const screen = deps.screen();
    const overlay = deps.overlay();
    const focused = target.activeElement;
    const key = ev.key;
    const isSpace = key === ' ' || ev.code === 'Space';

    if (deps.hidden()) {
      if ((key === 'Escape' || key === 'Enter' || isSpace) && !ev.repeat) {
        ev.preventDefault();
        deps.emit({ type: 'skip' });
      }
      return;
    }

    if (key === 'Escape') {
      if (overlay) deps.emit(overlay.id === 'pause' ? { type: 'pause', on: false } : { type: 'close' });
      else if (CLOSABLE.has(screen.id)) deps.emit({ type: 'close' });
      else if (screen.id === 'design' || screen.id === 'build' || screen.id === 'time') deps.emit({ type: 'menu' });
      else if (screen.id === 'vignette' || screen.id === 'survey') deps.emit({ type: 'skip' });
      else return;
      ev.preventDefault();
      return;
    }
    if (overlay || ev.altKey || ev.metaKey) return;
    const lower = key.length === 1 ? key.toLowerCase() : key;
    const owned = ownsKeys(focused, isSpace ? ' ' : key);

    if (screen.id === 'title') {
      // Nothing chosen yet (focus rests on the screen itself): Enter means the main choice.
      if ((isSpace || key === 'Enter') && !owned && !ev.repeat) {
        const main: UiIntent | null = screen.firstRun ? { type: 'begin' } : screen.canContinue ? { type: 'continue' } : null;
        if (main) {
          ev.preventDefault();
          deps.emit(main);
        }
      }
      return;
    }
    if (screen.id === 'vignette' || screen.id === 'survey') {
      if ((isSpace || key === 'Enter') && !owned) {
        ev.preventDefault();
        deps.emit({ type: 'skip' });
      }
      return;
    }
    if (screen.id === 'design') {
      if (lower === 'z' && !ev.shiftKey) {
        ev.preventDefault();
        deps.emit({ type: 'undo' });
        return;
      }
      if (lower === 'y' || (lower === 'z' && ev.shiftKey)) {
        ev.preventDefault();
        deps.emit({ type: 'redo' });
        return;
      }
    }
    if ((screen.id === 'design' || screen.id === 'build') && isSpace && !owned) {
      ev.preventDefault();
      if (ev.repeat) return;
      if (deps.primary.press(true)) spaceHeld = true;
      else if (screen.id === 'build') {
        // Build steps without a visible control (keystone, mark, wedges): Space is the gesture's
        // keyboard twin, so the game reads it as one press of the moment's action.
        deps.emit({ type: 'primary', phase: 'down' });
        deps.emit({ type: 'primary', phase: 'up' });
      }
      return;
    }
    if (screen.id === 'time' && !ev.ctrlKey) {
      const hud = deps.time();
      if (!hud) return;
      if ((isSpace && !owned) || lower === 'p') {
        ev.preventDefault();
        if (!ev.repeat) deps.emit({ type: 'pause', on: !hud.paused });
      } else if (key === '1' || key === '2' || key === '4') {
        deps.emit({ type: 'speed', value: Number(key) as 1 | 2 | 4 });
      } else if (lower === 'r' && hud.repair.possible && !ev.repeat) {
        deps.emit({ type: 'repair' });
      }
    }
  };

  const onUp = (ev: KeyboardEvent): void => {
    if ((ev.key === ' ' || ev.code === 'Space') && spaceHeld) {
      spaceHeld = false;
      deps.primary.press(false);
    }
  };

  // Letting go of everything when the window loses focus keeps a held stone-laying from sticking.
  const onBlur = (): void => {
    if (spaceHeld) {
      spaceHeld = false;
      deps.primary.press(false);
    }
  };

  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);
  target.defaultView?.addEventListener('blur', onBlur);
  return () => {
    target.removeEventListener('keydown', onDown);
    target.removeEventListener('keyup', onUp);
    target.defaultView?.removeEventListener('blur', onBlur);
  };
}
