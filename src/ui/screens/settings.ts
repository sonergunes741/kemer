/**
 * Settings: every field of Settings in one small card. Changes are reported as 'settings'
 * patches at once and also applied to the interface's own copy, so the card answers immediately.
 */
import type { UiScreen } from '../../core/contracts';
import type { Settings } from '../../core/types';
import { formatPercent } from '../../core/format';
import { t, type UiKey } from '../../i18n';
import type { UiContext } from '../context';
import { button, h, label, setText } from '../dom';
import { cardShell, type ScreenView } from './common';

type SettingsScreen = Extract<UiScreen, { id: 'settings' }>;

export const TEXT_SCALES: readonly number[] = [0.9, 1, 1.15, 1.3];

function row(name: string, control: HTMLElement, id?: string): HTMLElement {
  const r = h('div', 'k-set__row');
  const l = label(name, 'k-set__name');
  if (id) {
    l.id = `${id}-label`;
    control.setAttribute('aria-labelledby', l.id);
  }
  r.append(l, control);
  return r;
}

function segmented<T extends string | number>(options: readonly { value: T; text: string; cls?: string }[], current: T, onPick: (v: T) => void): HTMLElement {
  const g = h('div', 'k-seg');
  g.setAttribute('role', 'group');
  const btns = options.map((o) => {
    const b = button(`k-seg__btn${o.cls ? ` ${o.cls}` : ''}`, o.text, () => {
      for (const x of btns) x.setAttribute('aria-pressed', String(x === b));
      onPick(o.value);
    });
    b.setAttribute('aria-pressed', String(o.value === current));
    g.appendChild(b);
    return b;
  });
  return g;
}

function toggle(on: boolean, onChange: (v: boolean) => void): HTMLButtonElement {
  const b = button('k-switch', '');
  b.setAttribute('role', 'switch');
  const knob = h('span', 'k-switch__track');
  knob.appendChild(h('span', 'k-switch__knob'));
  const text = h('span', 'k-switch__text');
  b.append(knob, text);
  const sync = (v: boolean): void => {
    b.setAttribute('aria-checked', String(v));
    setText(text, v ? t('ui.on') : t('ui.off'));
  };
  sync(on);
  b.addEventListener('click', () => {
    const next = b.getAttribute('aria-checked') !== 'true';
    sync(next);
    onChange(next);
  });
  return b;
}

function slider(value: number, onInput: (v: number) => void): HTMLElement {
  const wrap = h('div', 'k-range');
  const input = h('input', 'k-range__input');
  input.type = 'range';
  input.min = '0';
  input.max = '1';
  input.step = '0.05';
  input.value = String(value);
  const out = h('span', 'k-range__value k-num', formatPercent(value));
  const paint = (v: number): void => {
    wrap.style.setProperty('--k-range', `${(v * 100).toFixed(1)}%`);
    setText(out, formatPercent(v));
    input.setAttribute('aria-valuetext', formatPercent(v));
  };
  paint(value);
  input.addEventListener('input', () => {
    const v = Number(input.value);
    paint(v);
    onInput(v);
  });
  wrap.append(input, out);
  return wrap;
}

export function renderSettings(screen: SettingsScreen, ctx: UiContext, apply: (patch: Partial<Settings>) => void): ScreenView {
  const st = screen.settings;
  const { el, body } = cardShell('k-settings', t('settings.heading'), ctx);
  const patch = (p: Partial<Settings>): void => {
    apply(p);
    ctx.emit({ type: 'settings', patch: p });
  };

  body.appendChild(
    row(
      t('settings.lang'),
      segmented(
        [
          { value: 'tr', text: t('settings.lang.tr') },
          { value: 'en', text: t('settings.lang.en') },
        ],
        st.lang,
        (v) => patch({ lang: v }),
      ),
      'k-set-lang',
    ),
  );
  body.appendChild(h('div', 'k-set__rule'));
  for (const key of ['master', 'music', 'effects'] as const) {
    body.appendChild(row(t(`settings.${key}`), slider(st[key], (v) => patch({ [key]: v })), `k-set-${key}`));
  }
  body.appendChild(h('div', 'k-set__rule'));
  body.appendChild(
    row(
      t('settings.quality'),
      segmented(
        (['auto', 'low', 'medium', 'high'] as const).map((q) => ({ value: q, text: t(`settings.quality.${q}` as UiKey) })),
        st.quality,
        (v) => patch({ quality: v }),
      ),
      'k-set-quality',
    ),
  );
  body.appendChild(
    row(
      t('settings.units'),
      segmented(
        [
          { value: 'metre', text: t('settings.units.metre') },
          { value: 'arsin', text: t('settings.units.arsin') },
        ],
        st.units,
        (v) => patch({ units: v }),
      ),
      'k-set-units',
    ),
  );
  body.appendChild(
    row(
      t('settings.textScale'),
      segmented(
        TEXT_SCALES.map((v, i) => ({ value: v, text: 'A', cls: `k-seg__btn--a${i}` })),
        TEXT_SCALES.reduce((best, v) => (Math.abs(v - st.textScale) < Math.abs(best - st.textScale) ? v : best), 1),
        (v) => patch({ textScale: v }),
      ),
      'k-set-text',
    ),
  );
  body.appendChild(h('div', 'k-set__rule'));
  body.appendChild(row(t('settings.reducedMotion'), toggle(st.reducedMotion, (v) => patch({ reducedMotion: v })), 'k-set-rm'));
  body.appendChild(row(t('settings.ambientLife'), toggle(st.ambientLife, (v) => patch({ ambientLife: v })), 'k-set-life'));
  body.appendChild(row(t('settings.highContrast'), toggle(st.highContrast, (v) => patch({ highContrast: v })), 'k-set-hc'));
  body.appendChild(h('div', 'k-set__rule'));

  // Erasing asks twice: the first press arms it for a few seconds.
  let armed = 0;
  const erase = button('k-action k-action--small k-erase', t('settings.erase'), () => {
    if (armed) {
      window.clearTimeout(armed);
      armed = 0;
      erase.textContent = t('settings.erase');
      erase.classList.remove('is-armed');
      ctx.emit({ type: 'erase-save' });
      return;
    }
    erase.textContent = t('settings.eraseConfirm');
    erase.classList.add('is-armed');
    armed = window.setTimeout(() => {
      armed = 0;
      erase.textContent = t('settings.erase');
      erase.classList.remove('is-armed');
    }, 4000);
  });
  const foot = h('div', 'k-set__foot');
  foot.appendChild(erase);
  body.appendChild(foot);
  return {
    el,
    dispose() {
      if (armed) window.clearTimeout(armed);
    },
  };
}
