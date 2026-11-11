/**
 * Last-resort error card, independent of the UI module (it must work even when that module or
 * WebGL failed). Built with DOM APIs only (strict CSP: no innerHTML, no inline styles).
 */
import { detectLang } from '../core/i18n';

const TEXT = {
  tr: {
    webglTitle: 'Bu tarayıcı Kemer\'u çalıştıramıyor',
    webglDetail:
      'Kemer için WebGL 2 gerekiyor. Tarayıcınızı güncelleyin, donanım hızlandırmayı açın ya da başka bir tarayıcı deneyin.',
    crashTitle: 'Atölyede bir şey ters gitti',
    crashDetail: 'Beklenmedik bir hata oldu. İlerlemeniz kayıtlı; sayfayı yeniden yükleyebilirsiniz.',
    reload: 'Yeniden yükle',
  },
  en: {
    webglTitle: 'This browser cannot run Kemer',
    webglDetail:
      'Kemer needs WebGL 2. Update your browser, turn on hardware acceleration, or try another browser.',
    crashTitle: 'Something went wrong in the workshop',
    crashDetail: 'An unexpected error happened. Your progress is saved; you can reload the page.',
    reload: 'Reload',
  },
} as const;

export type FatalKind = 'webgl' | 'crash';

export function showFatal(kind: FatalKind, technical?: string): void {
  const lang = document.documentElement.lang === 'en' || document.documentElement.lang === 'tr'
    ? (document.documentElement.lang as 'tr' | 'en')
    : detectLang();
  const s = TEXT[lang];
  document.querySelector('.fatal')?.remove();

  const wrap = document.createElement('div');
  wrap.className = 'fatal';
  wrap.setAttribute('role', 'alertdialog');
  wrap.setAttribute('aria-modal', 'true');

  const card = document.createElement('div');
  card.className = 'fatal__card';

  const title = document.createElement('h1');
  title.className = 'fatal__title';
  title.textContent = kind === 'webgl' ? s.webglTitle : s.crashTitle;

  const detail = document.createElement('p');
  detail.className = 'fatal__detail';
  detail.textContent = kind === 'webgl' ? s.webglDetail : s.crashDetail;
  if (technical) detail.title = technical.slice(0, 500);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'fatal__button';
  button.textContent = s.reload;
  button.addEventListener('click', () => window.location.reload());

  card.append(title, detail, button);
  wrap.append(card);
  document.body.append(wrap);
  button.focus();
}
