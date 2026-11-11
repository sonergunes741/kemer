/**
 * The result: years stood in large type, the span of years beneath, the three seals stamped one
 * after another, the masterwork line, a breath of story and the way on (next river, build again,
 * share as video, image or text from a small card beside the button).
 */
import type { UiScreen } from '../../core/contracts';
import { formatNumber } from '../../core/format';
import { t } from '../../i18n';
import type { UiContext } from '../context';
import { h, s, toggleClass } from '../dom';
import { formatYear, formatYears } from '../units';
import { action, screenShell, splitAround, type ScreenView } from './common';

type ResultScreen = Extract<UiScreen, { id: 'result' }>;
type SealName = 'standing' | 'lean' | 'unrepaired';

/** First stamp after the years have settled, then one every so often. */
const FIRST_STAMP = 0.7;
const STAMP_GAP = 0.5;

const GLYPHS: Record<SealName, readonly string[]> = {
  // An arch on its two piers, standing on the line of the ground.
  standing: ['M-17 11H17', 'M-11 11V1A11 11 0 0 1 11 1V11'],
  // A single keystone: fewer stones.
  lean: ['M-8 -9H8L4.5 9H-4.5Z'],
  // Water passing: the flood came and went.
  unrepaired: ['M-15 -3q3.75 -4 7.5 0t7.5 0t7.5 0t7.5 0', 'M-15 5q3.75 -4 7.5 0t7.5 0t7.5 0t7.5 0'],
};

export function sealSvg(name: SealName, earned: boolean): SVGSVGElement {
  const svg = s('svg', { viewBox: '-40 -40 80 80', width: 80, height: 80, 'aria-hidden': 'true' }, `k-seal__svg${earned ? ' is-earned' : ''}`);
  svg.append(s('circle', { r: 34 }, 'k-seal__outer'), s('circle', { r: 28.5 }, 'k-seal__inner'));
  const g = s('g', {}, 'k-seal__glyph');
  for (const d of GLYPHS[name]) g.appendChild(s('path', { d }));
  svg.appendChild(g);
  return svg;
}

export function renderResult(screen: ResultScreen, ctx: UiContext): ScreenView {
  const { summary } = screen;
  const el = screenShell('k-result', formatYears(summary.years));
  const inner = h('div', 'k-result__inner');

  const years = h('div', 'k-result__years');
  const [pre, post] = splitAround(t('unit.years', { n: '\u0001' }));
  if (pre.trim()) years.appendChild(h('span', 'k-result__unit', pre.trim()));
  years.appendChild(h('span', 'k-result__num k-num', formatNumber(summary.years, 0)));
  if (post.trim()) years.appendChild(h('span', 'k-result__unit', post.trim()));
  years.setAttribute('aria-label', formatYears(summary.years));
  const span = h('div', 'k-result__span k-num', `${formatYear(summary.builtYear)} · ${formatYear(summary.lastYear)}`);

  const seals = h('div', 'k-seals');
  seals.setAttribute('aria-label', t('result.seals'));
  let delay = FIRST_STAMP;
  for (const name of ['standing', 'lean', 'unrepaired'] as const) {
    const earned = summary.seals[name];
    const seal = h('div', `k-seal${earned ? ' is-earned' : ''}${screen.newSeals.includes(name) ? ' is-new' : ''}`);
    seal.append(sealSvg(name, earned), h('span', 'k-seal__label k-label', t(`seal.${name}`)));
    seal.setAttribute('role', 'img');
    seal.setAttribute('aria-label', `${t(`seal.${name}`)}${earned ? '' : ' —'}`);
    if (earned) {
      seal.style.animationDelay = `${delay.toFixed(2)}s`;
      delay += STAMP_GAP;
    }
    seals.appendChild(seal);
  }
  inner.append(years, span, seals);

  if (summary.masterwork) {
    const master = h('div', 'k-result__master');
    master.appendChild(h('span', 'k-label', t('seal.masterwork')));
    master.style.animationDelay = `${(delay + 0.15).toFixed(2)}s`;
    inner.appendChild(master);
    delay += STAMP_GAP;
  }

  if (screen.lines.length > 0) {
    const lines = h('div', 'k-result__lines');
    screen.lines.forEach((text, i) => {
      const p = h('p', 'k-result__line', text);
      p.style.animationDelay = `${(delay + 0.3 + i * 0.6).toFixed(2)}s`;
      lines.appendChild(p);
    });
    inner.appendChild(lines);
  }

  const actions = h('div', 'k-result__actions');
  if (screen.hasNext) actions.appendChild(action(t('result.next'), () => ctx.emit({ type: 'next' }), true));
  actions.appendChild(action(t('result.retry'), () => ctx.emit({ type: 'retry' }), !screen.hasNext));

  const shareWrap = h('div', 'k-share');
  const shareCard = h('div', 'k-share__card');
  shareCard.hidden = true;
  const shareBtn = action(t('result.share'), () => {
    shareCard.hidden = !shareCard.hidden;
    shareBtn.setAttribute('aria-expanded', String(!shareCard.hidden));
    toggleClass(shareWrap, 'is-open', !shareCard.hidden);
    if (!shareCard.hidden) (shareCard.firstElementChild as HTMLElement | null)?.focus();
  });
  shareBtn.setAttribute('aria-expanded', 'false');
  shareBtn.setAttribute('aria-haspopup', 'true');
  for (const what of ['video', 'image', 'text'] as const) {
    const key = what === 'video' ? 'result.shareVideo' : what === 'image' ? 'result.shareImage' : 'result.shareText';
    shareCard.appendChild(
      action(t(key), () => {
        shareCard.hidden = true;
        shareWrap.classList.remove('is-open');
        shareBtn.setAttribute('aria-expanded', 'false');
        ctx.emit({ type: 'share', what });
      }),
    );
  }
  shareWrap.append(shareCard, shareBtn);
  actions.appendChild(shareWrap);
  // The ledger is the level select: from here the player may travel to any open river.
  actions.appendChild(action(t('result.ledger'), () => ctx.emit({ type: 'open', screen: 'ledger' })));
  // With no river after this one (the last river, the endless modes) the way home is offered.
  if (!screen.hasNext) actions.appendChild(action(t('result.title'), () => ctx.emit({ type: 'open', screen: 'title' })));
  actions.style.animationDelay = `${(delay + 0.2).toFixed(2)}s`;
  inner.appendChild(actions);
  el.appendChild(inner);
  return { el };
}
