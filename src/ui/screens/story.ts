/**
 * The quiet text screens of arriving: the vignette (a ledger card, lines appearing one at a time)
 * and the survey title (year and place set large over the river).
 */
import type { UiScreen } from '../../core/contracts';
import { lt } from '../../core/i18n';
import { t } from '../../i18n';
import type { UiContext } from '../context';
import { button, h } from '../dom';
import { formatYear } from '../units';
import { screenShell, type ScreenView } from './common';

type Vignette = Extract<UiScreen, { id: 'vignette' }>;
type Survey = Extract<UiScreen, { id: 'survey' }>;

/** Seconds between ledger lines appearing. */
const LINE_GAP = 1.1;

function skipButton(ctx: UiContext): HTMLButtonElement {
  const b = button('k-skip', t('ui.skip'), () => ctx.emit({ type: 'skip' }));
  return b;
}

export function renderVignette(screen: Vignette, ctx: UiContext): ScreenView {
  const el = screenShell('k-vignette', screen.heading);
  const card = h('div', 'k-vignette__card');
  card.appendChild(h('div', 'k-vignette__year k-num', formatYear(screen.year)));
  card.appendChild(h('h2', 'k-vignette__heading k-label', screen.heading));
  const lines = h('div', 'k-vignette__lines');
  screen.lines.forEach((text, i) => {
    const p = h('p', 'k-vignette__line', text);
    p.style.animationDelay = `${(0.6 + i * LINE_GAP).toFixed(2)}s`;
    lines.appendChild(p);
  });
  card.appendChild(lines);
  el.append(card, skipButton(ctx));
  return { el };
}

export function renderSurvey(screen: Survey, ctx: UiContext): ScreenView {
  const { level } = screen;
  const el = screenShell('k-survey', lt(level.river));
  const inner = h('div', 'k-survey__inner');
  inner.appendChild(h('div', 'k-survey__year k-num', formatYear(level.year)));
  inner.appendChild(h('h2', 'k-survey__river', lt(level.river)));
  inner.appendChild(h('div', 'k-survey__place k-label', lt(level.place)));
  el.append(inner, skipButton(ctx));
  return { el };
}
