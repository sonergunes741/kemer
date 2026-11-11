/**
 * Title. The first time: only the name and one quiet "Başla". Later: continue, the ledger, the
 * river of the day, the thousand years and settings, with the credits small at the foot.
 */
import type { UiScreen } from '../../core/contracts';
import { t } from '../../i18n';
import type { UiContext } from '../context';
import { button, h } from '../dom';
import { action, screenShell, type ScreenView } from './common';

type TitleScreen = Extract<UiScreen, { id: 'title' }>;

export function renderTitle(screen: TitleScreen, ctx: UiContext): ScreenView {
  const el = screenShell(screen.firstRun ? 'k-title is-first' : 'k-title', t('title.name'));
  const inner = h('div', 'k-title__inner');
  const name = h('h1', 'k-title__name', t('title.name'));
  inner.appendChild(name);

  if (screen.firstRun) {
    inner.appendChild(action(t('title.begin'), () => ctx.emit({ type: 'begin' }), true));
    el.appendChild(inner);
    return { el };
  }

  inner.appendChild(h('p', 'k-title__tag', t('title.tagline')));
  const menu = h('nav', 'k-title__menu');
  menu.setAttribute('aria-label', t('ui.menu'));
  const items: HTMLButtonElement[] = [];
  if (screen.canContinue) items.push(action(t('title.continue'), () => ctx.emit({ type: 'continue' }), true));
  const daily = action(t('title.daily'), () => ctx.emit({ type: 'open', screen: 'daily' }));
  const thousand = action(t('title.millennium'), () => ctx.emit({ type: 'open', screen: 'millennium' }));
  const ledger = action(t('title.ledger'), () => ctx.emit({ type: 'open', screen: 'ledger' }));
  // After the last river the endless modes are the reason to come back, so they lead; before the
  // first river is passed they are not offered at all.
  if (screen.modes === false) items.push(ledger);
  else if (screen.postgame) items.push(daily, thousand, ledger);
  else items.push(ledger, daily, thousand);
  items.push(action(t('title.settings'), () => ctx.emit({ type: 'open', screen: 'settings' })));
  menu.append(...items);
  inner.appendChild(menu);
  el.appendChild(inner);

  const credits = button('k-title__credits', t('title.credits'), () => ctx.emit({ type: 'open', screen: 'credits' }));
  el.appendChild(credits);
  return { el };
}
