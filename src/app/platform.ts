/** Browser capabilities wrapped so the rest of the game never touches them directly. */
import type { KeyValueStorage } from '../core/contracts';
import { log } from '../core/log';

const PROBE_KEY = '__kemer_probe__';

/**
 * localStorage with an in-memory fallback (private browsing, disabled storage). Storage that can
 * still be read is kept even when it cannot be written (quota used up): the existing save then
 * loads as usual, and what cannot be written is logged once and lives on in memory for the session.
 */
export function createStorage(): KeyValueStorage {
  const memory = new Map<string, string>();
  let persistent: Storage | null = null;
  try {
    const local = window.localStorage;
    local.getItem(PROBE_KEY);
    persistent = local;
  } catch (err) {
    log.warn('storage', 'localStorage unavailable; progress will not persist', err);
  }
  if (persistent) {
    try {
      persistent.setItem(PROBE_KEY, '1');
      persistent.removeItem(PROBE_KEY);
    } catch (err) {
      log.warn('storage', 'localStorage cannot be written (full?); new progress may not persist', err);
    }
  }
  return {
    get(key) {
      // What this session wrote is the truth, even when the disk refused it (quota used up).
      if (memory.has(key)) return memory.get(key) ?? null;
      try {
        return persistent ? persistent.getItem(key) : null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      memory.set(key, value);
      try {
        persistent?.setItem(key, value);
      } catch (err) {
        log.once('storage:set', 'storage', 'write failed', err);
      }
    },
    remove(key) {
      memory.delete(key);
      try {
        persistent?.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

/** Vibration where supported; silently does nothing elsewhere. */
export function createHaptics(): (pattern: number | number[]) => void {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  if (!nav || typeof nav.vibrate !== 'function') return () => undefined;
  return (pattern) => {
    try {
      nav.vibrate(pattern);
    } catch {
      /* ignore */
    }
  };
}

/** True when a WebGL2 context can be created. The probe context is released immediately. */
export function hasWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
