/** Picks the view for a UiScreen. Gameplay screens (design, build, time, none) have no view: their HUD does the work. */
import type { DesignModel, UiScreen } from '../../core/contracts';
import type { Settings } from '../../core/types';
import type { UiContext } from '../context';
import { renderCredits, renderKeys, renderPause } from './cards';
import { renderCollapse } from './collapse';
import type { ScreenView } from './common';
import { renderLedger } from './ledger';
import { renderMarkPicker } from './mark';
import { renderRestore } from './restore';
import { renderResult } from './result';
import { renderSettings } from './settings';
import { renderSurvey, renderVignette } from './story';
import { renderTitle } from './title';

export interface ScreenExtras {
  /** The last design the player drew, for the collapse diagram. */
  readonly lastDesign: DesignModel | null;
  /** Years the bridge stood before it fell, when the time-lapse ran. */
  readonly yearsStood: number | null;
  applySettings(patch: Partial<Settings>): void;
}

export function renderScreen(screen: UiScreen, ctx: UiContext, extras: ScreenExtras): ScreenView | null {
  switch (screen.id) {
    case 'design':
      return screen.restore ? renderRestore(screen.restore, ctx) : null;
    case 'none':
    case 'build':
    case 'time':
      return null;
    case 'title':
      return renderTitle(screen, ctx);
    case 'mark':
      return renderMarkPicker(screen, ctx);
    case 'vignette':
      return renderVignette(screen, ctx);
    case 'survey':
      return renderSurvey(screen, ctx);
    case 'ledger':
      return renderLedger(screen, ctx);
    case 'result':
      return renderResult(screen, ctx);
    case 'collapse':
      return renderCollapse(screen, ctx, extras.lastDesign, extras.yearsStood);
    case 'settings':
      return renderSettings(screen, ctx, extras.applySettings);
    case 'keys':
      return renderKeys(ctx);
    case 'pause':
      return renderPause(ctx);
    case 'credits':
      return renderCredits(ctx);
  }
}

/**
 * Whether a newly set screen can keep the current view. The game may re-send a screen after every
 * change (settings after each patch); rebuilding would drop focus and a slider mid-drag.
 */
export function sameScreen(a: UiScreen | null, b: UiScreen): boolean {
  if (!a) return false;
  if (a === b) return true;
  if (a.id !== b.id) return false;
  switch (b.id) {
    case 'none':
    case 'settings':
    case 'keys':
    case 'credits':
    case 'pause':
      return true;
    case 'design':
      // A repair card with the same options is updated in place (the view's update).
      return a.id === 'design' && a.level === b.level && (a.restore?.options.length ?? -1) === (b.restore?.options.length ?? -1);
    case 'time':
    case 'survey':
      return 'level' in a && a.level === b.level;
    case 'build':
      return a.id === 'build' && a.level === b.level && a.step === b.step;
    default:
      return false;
  }
}

/** Screens that sit on the picture as gameplay (the HUD is live and the background takes input). */
export function isGameplay(screen: UiScreen): screen is Extract<UiScreen, { id: 'design' | 'build' | 'time' }> {
  return screen.id === 'design' || screen.id === 'build' || screen.id === 'time';
}
