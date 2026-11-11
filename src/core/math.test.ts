import { describe, expect, it } from 'vitest';
import { approach, cents, clamp, damp, easeInOutCubic, fract, invLerp, remap, smoothstep, wrapAngle } from './math';
import { Rng, hashString, mulberry32 } from './rng';
import { formatCents, formatDate, formatNote, formatNumber, formatPercent, formatSeconds, isoDate, noteOf } from './format';
import { interpolate, lt, registerStrings, setLang, t } from './i18n';

describe('math', () => {
  it('clamps and interpolates', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(invLerp(2, 2, 3)).toBe(0);
    expect(remap(5, 0, 10, 100, 200)).toBe(150);
    expect(remap(20, 0, 10, 100, 200)).toBe(200);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5);
    expect(fract(-0.25)).toBeCloseTo(0.75);
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });

  it('damps frame-rate independently', () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = damp(a, 1, 5, 1 / 60);
    const b = damp(0, 1, 5, 1);
    expect(a).toBeCloseTo(b, 6);
  });

  it('wraps angles and approaches', () => {
    expect(wrapAngle(3 * Math.PI - 0.1)).toBeCloseTo(Math.PI - 0.1);
    expect(wrapAngle(-3 * Math.PI + 0.1)).toBeCloseTo(-Math.PI + 0.1);
    expect(wrapAngle(0.5)).toBeCloseTo(0.5);
    expect(approach(0, 10, 3)).toBe(3);
    expect(approach(9, 10, 3)).toBe(10);
    expect(cents(440, 880)).toBeCloseTo(1200);
  });
});

describe('rng', () => {
  it('is deterministic', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
    expect(hashString('2026-11-09')).toBe(hashString('2026-11-09'));
    expect(hashString('a')).not.toBe(hashString('b'));
  });

  it('stays in range', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const n = r.int(1, 3);
      expect([1, 2, 3]).toContain(n);
      expect(Number.isFinite(r.gauss())).toBe(true);
    }
  });
});

describe('format', () => {
  it('formats numbers per locale', () => {
    expect(formatNumber(4.25, 1, 'tr')).toBe('4,3');
    expect(formatSeconds(4.2, 1, 'tr')).toBe('4,2 sn');
    expect(formatSeconds(4.2, 1, 'en')).toBe('4.2 s');
    expect(formatPercent(0.82, 'tr')).toBe('%82');
    expect(formatPercent(0.82, 'en')).toBe('82%');
    expect(formatNumber(Number.NaN, 1, 'en')).toBe('—');
    expect(formatCents(12.4, 'en')).toBe('+12 cents');
  });

  it('names notes', () => {
    expect(formatNote(440, 'en')).toBe('A4');
    expect(formatNote(440, 'tr')).toBe('La4');
    expect(formatNote(261.63, 'tr')).toBe('Do4');
    expect(noteOf(0)).toBeNull();
    expect(noteOf(446)?.cents).toBeGreaterThan(20);
  });

  it('formats dates', () => {
    expect(isoDate(new Date(2026, 10, 9))).toBe('2026-11-09');
    expect(formatDate('2026-11-09', 'tr')).toBe('9 Kasım 2026');
    expect(formatDate('2026-11-09', 'en')).toBe('9 November 2026');
    expect(formatDate('garbage', 'en')).toBe('garbage');
  });
});

describe('i18n', () => {
  it('looks up, falls back and interpolates', () => {
    registerStrings('tr', { 'test.hello': 'Merhaba {name}' });
    registerStrings('en', { 'test.hello': 'Hello {name}', 'test.only.en': 'Only' });
    setLang('tr');
    expect(t('test.hello', { name: 'Usta' })).toBe('Merhaba Usta');
    expect(t('test.only.en')).toBe('Only');
    expect(t('missing.key')).toBe('missing.key');
    expect(lt({ tr: 'Cam', en: 'Glass' })).toBe('Cam');
    setLang('en');
    expect(lt({ tr: 'Cam', en: 'Glass' })).toBe('Glass');
    expect(interpolate('{a}-{b}-{c}', { a: 1, b: 'x' })).toBe('1-x-{c}');
    setLang('tr');
  });
});
