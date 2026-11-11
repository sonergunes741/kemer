// @vitest-environment happy-dom
/**
 * The save's storage when the browser's is blocked or full: the game must keep running and keep
 * what it wrote this session, whatever localStorage does.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStorage } from './platform';

const real = Object.getOwnPropertyDescriptor(window, 'localStorage');

function stubStorage(storage: unknown): void {
  Object.defineProperty(window, 'localStorage', { configurable: true, get: () => storage });
}

afterEach(() => {
  if (real) Object.defineProperty(window, 'localStorage', real);
  vi.restoreAllMocks();
});

describe('createStorage', () => {
  it('keeps working in memory when localStorage is blocked', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    const s = createStorage();
    expect(s.get('kemer.save')).toBeNull();
    s.set('kemer.save', '{"v":1}');
    expect(s.get('kemer.save')).toBe('{"v":1}');
    s.remove('kemer.save');
    expect(s.get('kemer.save')).toBeNull();
  });

  it('reads the old save from a full storage and keeps the new one in memory', () => {
    const disk = new Map<string, string>([['kemer.save', '{"v":"old"}']]);
    stubStorage({
      getItem: (k: string) => disk.get(k) ?? null,
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
      removeItem: (k: string) => void disk.delete(k),
    });
    const s = createStorage();
    expect(s.get('kemer.save')).toBe('{"v":"old"}');
    s.set('kemer.save', '{"v":"new"}');
    // The write failed on disk, but this session reads back what it wrote.
    expect(s.get('kemer.save')).toBe('{"v":"new"}');
  });
});
