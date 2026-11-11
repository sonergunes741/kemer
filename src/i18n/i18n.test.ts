import { describe, expect, it } from 'vitest';
import { en, tr } from './index';

/** Placeholders like {n} in a template, sorted. */
const vars = (s: string): string[] => (s.match(/\{\w+\}/g) ?? []).sort();

describe('ui strings', () => {
  it('has the same keys in Turkish and English', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(tr).sort());
  });

  it('has no empty strings', () => {
    for (const [k, v] of Object.entries(tr)) expect(v.trim(), k).not.toBe('');
    for (const [k, v] of Object.entries(en)) expect(v.trim(), k).not.toBe('');
  });

  it('uses the same placeholders in both languages', () => {
    for (const key of Object.keys(tr) as (keyof typeof tr)[]) expect(vars(en[key]), key).toEqual(vars(tr[key]));
  });
});
