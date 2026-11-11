/**
 * The build HUD: the place heading, and for the steps that are not a press of the primary
 * control (keystone, mark, wedges) one quiet instruction line where the control would be.
 * The primary control itself is configured by the interface root from the same BuildHud.
 */
import type { BuildHud, UiScreen } from '../../core/contracts';
import { lt } from '../../core/i18n';
import { t, type UiKey } from '../../i18n';
import type { UiContext } from '../context';
import { h, label, setText, toggleClass } from '../dom';
import { formatYear } from '../units';

export type BuildStep = Extract<UiScreen, { id: 'build' }>['step'];

/** Steps whose action is the primary control (a press or a hold); the others are gestures in the scene. */
export function stepUsesPrimary(step: BuildStep): boolean {
  return step === 'stones';
}

export interface BuildHudView {
  readonly el: HTMLElement;
  set(hud: BuildHud | null, step: BuildStep | null): void;
  render(): void;
  /** Hide the instruction while the coach speaks in the same place. */
  quiet(on: boolean): void;
}

export function createBuildHud(ctx: UiContext): BuildHudView {
  const el = h('div', 'k-build');
  const heading = h('div', 'k-heading');
  const headYear = h('span', 'k-heading__year k-num');
  const headRiver = label('', 'k-heading__river');
  heading.append(headYear, headRiver);
  const line = h('div', 'k-build__line');
  line.setAttribute('aria-live', 'polite');
  el.append(heading, line);

  let hud: BuildHud | null = null;
  let step: BuildStep | null = null;

  function render(): void {
    const level = ctx.level();
    setText(headYear, level ? formatYear(level.year) : '');
    setText(headRiver, level ? lt(level.river) : '');
    let text = '';
    if (step && !stepUsesPrimary(step)) text = hud?.action || t(`build.${step}` as UiKey);
    setText(line, text);
    toggleClass(line, 'is-on', text !== '');
  }

  return {
    el,
    set(nextHud, nextStep) {
      hud = nextHud;
      step = nextStep;
      toggleClass(el, 'is-on', nextStep !== null);
      render();
    },
    render,
    quiet(on) {
      toggleClass(line, 'is-quiet', on);
    },
  };
}
