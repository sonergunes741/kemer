/**
 * Drawing for what the player shares (DESIGN 3): the picture of the scene cover-fitted onto a
 * 1280 x 720 canvas, a quiet caption strip under it (years stood, river, the years, stones, the
 * family mark) and the turning year and closing line of the time-lapse. Type in the game's own
 * faces, paper on a soft veil, nothing boxed: the same restraint as the interface.
 */
import type { FamilyMark } from '../../core/types';

export const SHARE_W = 1280;
export const SHARE_H = 720;

const PAPER = '#F2ECE0';
const PAPER_DIM = 'rgba(242, 236, 224, 0.72)';
const DISPLAY = "'Cormorant Garamond', Georgia, serif";
const TEXT = "'Inter Variable', 'Inter', system-ui, sans-serif";

export interface Caption {
  /** "879 yıl" */
  readonly years: string;
  /** "Koramaz Deresi" */
  readonly river: string;
  /** "1147 · 2026 · 2 140 taş" */
  readonly line: string;
  readonly mark: FamilyMark | null;
}

/** The scene's canvas, cover-fitted (cropped, never stretched) onto the share canvas. */
export function drawScene(ctx: CanvasRenderingContext2D, src: CanvasImageSource & { width: number; height: number }): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  if (src.width <= 0 || src.height <= 0) return;
  const scale = Math.max(w / src.width, h / src.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, w, h);
}

/** A veil rising from the bottom edge, so paper-coloured type reads over any picture. */
function veil(ctx: CanvasRenderingContext2D, height: number, strength: number): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const g = ctx.createLinearGradient(0, h - height, 0, h);
  g.addColorStop(0, 'rgba(27, 24, 21, 0)');
  g.addColorStop(1, `rgba(27, 24, 21, ${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, h - height, w, height);
}

/** The family mark: chiselled lines between the points of a 3 x 3 grid. */
export function drawMark(ctx: CanvasRenderingContext2D, mark: FamilyMark, x: number, y: number, size: number): void {
  const step = size / 2;
  const point = (n: number): [number, number] => [x + (n % 3) * step, y + Math.floor(n / 3) * step];
  ctx.save();
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = Math.max(1.5, size * 0.07);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [a, b] of mark.strokes) {
    const [ax, ay] = point(a);
    const [bx, by] = point(b);
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
  }
  ctx.stroke();
  ctx.restore();
}

/** The still's caption strip along the bottom. */
export function drawCaption(ctx: CanvasRenderingContext2D, c: Caption): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  veil(ctx, 200, 0.78);
  const left = 56;
  const base = h - 52;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = PAPER;
  ctx.font = `500 76px ${DISPLAY}`;
  ctx.fillText(c.years, left, base);
  const yearsWidth = ctx.measureText(c.years).width;
  ctx.font = `500 15px ${TEXT}`;
  ctx.fillStyle = PAPER;
  spaced(ctx, c.river.toLocaleUpperCase(), left + yearsWidth + 36, base - 30, 2.4);
  ctx.fillStyle = PAPER_DIM;
  ctx.font = `400 22px ${DISPLAY}`;
  ctx.fillText(c.line, left + yearsWidth + 36, base - 2);
  if (c.mark) drawMark(ctx, c.mark, w - 56 - 44, base - 52, 44);
  ctx.font = `500 12px ${TEXT}`;
  ctx.fillStyle = PAPER_DIM;
  spaced(ctx, 'KEMER', w - 56 - 44, base + 26, 3);
}

/** The turning year of the time-lapse, low on the left; `fade` 0..1. */
export function drawYear(ctx: CanvasRenderingContext2D, year: number, river: string, fade: number): void {
  if (fade <= 0) return;
  const h = ctx.canvas.height;
  ctx.save();
  ctx.globalAlpha = fade;
  veil(ctx, 170, 0.5);
  ctx.fillStyle = PAPER;
  ctx.font = `500 84px ${DISPLAY}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(String(Math.floor(year)), 56, h - 60);
  ctx.font = `500 14px ${TEXT}`;
  ctx.fillStyle = PAPER_DIM;
  spaced(ctx, river.toLocaleUpperCase(), 60, h - 36, 2.4);
  ctx.restore();
}

/** The closing line in the middle, over a soft darkening of the whole picture; `fade` 0..1. */
export function drawClosing(ctx: CanvasRenderingContext2D, line: string, sub: string, mark: FamilyMark | null, fade: number): void {
  if (fade <= 0) return;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.fillStyle = 'rgba(27, 24, 21, 0.55)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = PAPER;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `500 58px ${DISPLAY}`;
  ctx.fillText(line, w / 2, h / 2 - 12);
  ctx.font = `500 14px ${TEXT}`;
  ctx.fillStyle = PAPER_DIM;
  ctx.textAlign = 'left';
  const subWidth = spacedWidth(ctx, sub.toLocaleUpperCase(), 2.4);
  spaced(ctx, sub.toLocaleUpperCase(), w / 2 - subWidth / 2, h / 2 + 46, 2.4);
  if (mark) drawMark(ctx, mark, w / 2 - 16, h / 2 + 84, 32);
  ctx.restore();
}

/** Small capitals with open tracking, the interface's label style, drawn letter by letter. */
function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number): void {
  let at = x;
  for (const ch of text) {
    ctx.fillText(ch, at, y);
    at += ctx.measureText(ch).width + tracking;
  }
}

function spacedWidth(ctx: CanvasRenderingContext2D, text: string, tracking: number): number {
  let wsum = 0;
  for (const ch of text) wsum += ctx.measureText(ch).width + tracking;
  return Math.max(0, wsum - tracking);
}
