/**
 * Handing a shared thing to the player: the Web Share API where the browser has it, the clipboard
 * for text, a download for files. Every path resolves to what actually happened, so the caller can
 * say it quietly; nothing here throws.
 */
import { log } from '../../core/log';

export type Delivery = 'shared' | 'copied' | 'saved' | 'cancelled' | 'needs-gesture' | 'failed';

interface ShareNavigator {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
  clipboard?: { writeText(text: string): Promise<void> };
}

const nav = (): ShareNavigator | null => (typeof navigator === 'undefined' ? null : (navigator as unknown as ShareNavigator));

function shareError(err: unknown): Delivery {
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  if (name === 'AbortError') return 'cancelled';
  // The page's moment of user activation had passed (a recording takes longer than it lasts).
  if (name === 'NotAllowedError') return 'needs-gesture';
  return 'failed';
}

export async function deliverText(text: string): Promise<Delivery> {
  const n = nav();
  if (n?.share) {
    try {
      await n.share({ text });
      return 'shared';
    } catch (err) {
      const d = shareError(err);
      if (d === 'cancelled') return d;
      log.info('share', 'text share unavailable; trying the clipboard', err);
    }
  }
  if (n?.clipboard) {
    try {
      await n.clipboard.writeText(text);
      return 'copied';
    } catch (err) {
      log.info('share', 'clipboard refused', err);
    }
  }
  return 'failed';
}

export function canShareFile(file: File): boolean {
  const n = nav();
  try {
    return !!n?.share && !!n.canShare && n.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Share a file if the browser can, else save it as a download. */
export async function deliverFile(file: File, text: string, allowDownload = true): Promise<Delivery> {
  const n = nav();
  if (n?.share && canShareFile(file)) {
    try {
      await n.share({ files: [file], text });
      return 'shared';
    } catch (err) {
      const d = shareError(err);
      if (d === 'cancelled' || (d === 'needs-gesture' && !allowDownload)) return d;
      log.info('share', 'file share failed; saving instead', err);
    }
  }
  return allowDownload ? download(file) : 'failed';
}

export function download(file: File): Delivery {
  try {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.rel = 'noopener';
    a.hidden = true;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Long enough for the browser to have taken the file.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return 'saved';
  } catch (err) {
    log.warn('share', 'download failed', err);
    return 'failed';
  }
}
