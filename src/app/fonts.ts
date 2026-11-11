/**
 * Loads exactly the font faces the game uses (Latin + Latin Extended, enough for Turkish) through
 * the FontFace API. Bundled files only, so it works offline and under the strict CSP.
 */
import cormorant400 from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-normal.woff2?url';
import cormorant400Ext from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-ext-400-normal.woff2?url';
import cormorant400Italic from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-italic.woff2?url';
import cormorant400ItalicExt from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-ext-400-italic.woff2?url';
import cormorant500 from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-normal.woff2?url';
import cormorant500Ext from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-ext-500-normal.woff2?url';
import inter from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import interExt from '@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2?url';
import { log } from '../core/log';

const LATIN =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const LATIN_EXT =
  'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';

interface FaceSpec {
  family: string;
  url: string;
  weight: string;
  style: 'normal' | 'italic';
  range: string;
  format: 'woff2' | 'woff2-variations';
}

const FACES: readonly FaceSpec[] = [
  { family: 'Inter Variable', url: inter, weight: '100 900', style: 'normal', range: LATIN, format: 'woff2-variations' },
  { family: 'Inter Variable', url: interExt, weight: '100 900', style: 'normal', range: LATIN_EXT, format: 'woff2-variations' },
  { family: 'Cormorant Garamond', url: cormorant400, weight: '400', style: 'normal', range: LATIN, format: 'woff2' },
  { family: 'Cormorant Garamond', url: cormorant400Ext, weight: '400', style: 'normal', range: LATIN_EXT, format: 'woff2' },
  { family: 'Cormorant Garamond', url: cormorant400Italic, weight: '400', style: 'italic', range: LATIN, format: 'woff2' },
  { family: 'Cormorant Garamond', url: cormorant400ItalicExt, weight: '400', style: 'italic', range: LATIN_EXT, format: 'woff2' },
  { family: 'Cormorant Garamond', url: cormorant500, weight: '500', style: 'normal', range: LATIN, format: 'woff2' },
  { family: 'Cormorant Garamond', url: cormorant500Ext, weight: '500', style: 'normal', range: LATIN_EXT, format: 'woff2' },
];

/**
 * Register all faces and wait (at most `timeoutMs`) for the first-screen ones. Never rejects:
 * fonts are cosmetic and the system fallbacks in base.css are acceptable.
 */
export async function loadFonts(timeoutMs = 2500): Promise<void> {
  if (typeof FontFace === 'undefined' || !document.fonts) return;
  const loads: Promise<unknown>[] = [];
  for (const f of FACES) {
    try {
      const face = new FontFace(f.family, `url("${f.url}") format("${f.format}")`, {
        weight: f.weight,
        style: f.style,
        unicodeRange: f.range,
        display: 'swap',
      });
      document.fonts.add(face);
      loads.push(face.load().catch((err: unknown) => log.once(`font:${f.url}`, 'fonts', 'failed to load', f.family, err)));
    } catch (err) {
      log.once(`font:${f.url}`, 'fonts', 'bad face', f.family, err);
    }
  }
  await Promise.race([Promise.all(loads), new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}
