/** The small cards: the keys reminder, the pause menu and the credits. */
import { t, type UiKey } from '../../i18n';
import type { UiContext } from '../context';
import { h } from '../dom';
import { action, cardShell, type ScreenView } from './common';

/** A key is literal glyphs (split on spaces, one box each), a localised key name, or a pointer gesture. */
type KeyName = { readonly glyphs: string; readonly label?: UiKey } | { readonly key: UiKey } | { readonly gesture: UiKey };

const KEYS: readonly (readonly [KeyName, UiKey])[] = [
  [{ key: 'keys.space' }, 'keys.spaceAction'],
  [{ glyphs: '← → ↑ ↓', label: 'keys.arrows' }, 'keys.arrowsAction'],
  [{ key: 'keys.tab' }, 'keys.tabAction'],
  [{ glyphs: 'Z' }, 'keys.undoAction'],
  [{ glyphs: 'Y' }, 'keys.redoAction'],
  [{ glyphs: '1 2 4' }, 'keys.speedAction'],
  [{ glyphs: 'P' }, 'keys.pauseAction'],
  [{ glyphs: 'R' }, 'keys.repairAction'],
  [{ glyphs: 'Esc' }, 'keys.escAction'],
  [{ gesture: 'keys.drag' }, 'keys.dragAction'],
  [{ gesture: 'keys.wheel' }, 'keys.wheelAction'],
];

export function renderKeys(ctx: UiContext): ScreenView {
  const { el, body } = cardShell('k-keys', t('keys.heading'), ctx);
  const list = h('dl', 'k-keys__list');
  for (const [name, act] of KEYS) {
    const dt = h('dt', 'k-keys__key');
    if ('glyphs' in name) {
      for (const part of name.glyphs.split(' ')) dt.appendChild(h('kbd', 'k-kbd', part));
      if (name.label) dt.setAttribute('aria-label', t(name.label));
    } else if ('key' in name) {
      dt.appendChild(h('kbd', 'k-kbd', t(name.key)));
    } else {
      // Not a key: a mouse gesture, set as a plain word rather than a keycap.
      dt.appendChild(h('span', 'k-keys__gesture', t(name.gesture)));
    }
    list.append(dt, h('dd', 'k-keys__act', t(act)));
  }
  body.appendChild(list);
  return { el };
}

export function renderPause(ctx: UiContext): ScreenView {
  const { el, body } = cardShell('k-pause', t('pause.heading'), ctx, false);
  const list = h('div', 'k-pause__list');
  list.append(
    action(t('pause.resume'), () => ctx.emit({ type: 'pause', on: false }), true),
    action(t('title.ledger'), () => ctx.emit({ type: 'open', screen: 'ledger' })),
    action(t('title.settings'), () => ctx.emit({ type: 'open', screen: 'settings' })),
    action(t('keys.heading'), () => ctx.emit({ type: 'open', screen: 'keys' })),
    action(t('pause.title'), () => ctx.emit({ type: 'open', screen: 'title' })),
  );
  body.appendChild(list);
  return { el };
}

export function renderCredits(ctx: UiContext): ScreenView {
  const { el, body } = cardShell('k-credits', t('credits.heading'), ctx);
  const name = h('div', 'k-credits__name');
  name.append(h('span', 'k-credits__title', t('title.name')), h('span', 'k-credits__tag', t('title.tagline')));
  body.appendChild(name);
  const list = h('dl', 'k-credits__list');
  for (const [k, v] of [
    ['credits.made', 'credits.madeBy'],
    ['credits.type', 'credits.typeBy'],
    ['credits.code', 'credits.codeBy'],
    ['credits.art', 'credits.artBy'],
  ] as const) {
    list.append(h('dt', 'k-label', t(k)), h('dd', '', t(v)));
  }
  body.appendChild(list);
  body.appendChild(h('p', 'k-credits__thanks', t('credits.thanks')));
  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
  if (version) body.appendChild(h('p', 'k-credits__version k-num', version));
  return { el };
}
