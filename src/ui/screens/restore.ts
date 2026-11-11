/**
 * The epilogue's repair card: the ways to mend the bridge, smallest first, as quiet pills in the
 * corner where the stone count sits while designing. One is picked at a time; the primary control
 * (set by the interface root from the same card) carries out the pick. A new pick or a spent
 * option updates the pills in place, so keyboard focus stays where the player left it.
 */
import type { RestoreCard, UiScreen } from '../../core/contracts';
import { t } from '../../i18n';
import type { UiContext } from '../context';
import { button, h, label } from '../dom';
import type { ScreenView } from './common';

export function renderRestore(card: RestoreCard, ctx: UiContext): ScreenView {
  const el = h('section', 'k-restore');
  el.setAttribute('aria-label', t('restore.heading'));
  const group = h('div', 'k-restore__options');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', t('restore.heading'));
  group.appendChild(label(t('restore.heading'), 'k-restore__label'));
  const pills = card.options.map((option, i) => {
    const pill = button('k-chip k-restore__option', '', () => ctx.emit({ type: 'choose', index: i }));
    pill.setAttribute('role', 'radio');
    pill.append(h('span', 'k-restore__name', option.label), h('span', 'k-restore__cost', option.detail));
    group.appendChild(pill);
    return pill;
  });
  const show = (c: RestoreCard): void => {
    pills.forEach((pill, i) => {
      const on = c.selected === i;
      pill.setAttribute('aria-checked', String(on));
      pill.setAttribute('aria-pressed', String(on));
      pill.disabled = !!c.options[i]?.spent;
    });
  };
  show(card);
  el.appendChild(group);
  return {
    el,
    update(screen: UiScreen) {
      if (screen.id === 'design' && screen.restore) show(screen.restore);
    },
  };
}
