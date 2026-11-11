import { describe, expect, it } from 'vitest';
import type { LevelStory } from '../core/contracts';
import type { CauseId, CollapseInfo, HazardDef, LevelDef, LocalText } from '../core/types';
import { createSim } from '../sim/index';
import { CAUSES, trLocative } from './epitaph';
import { LEVELS, createContent, makeEpilogue, rank } from './index';
import { MILLENNIUM } from './millennium';

const sim = createSim();
const content = createContent(sim);

function texts(value: unknown, path: string, out: { path: string; text: LocalText }[]): void {
  if (value === null || typeof value !== 'object') return;
  const v = value as Record<string, unknown>;
  if (typeof v.tr === 'string' && typeof v.en === 'string') {
    out.push({ path, text: v as unknown as LocalText });
    return;
  }
  for (const [k, child] of Object.entries(v)) texts(child, `${path}.${k}`, out);
}

function allTexts(): { path: string; text: LocalText }[] {
  const out: { path: string; text: LocalText }[] = [];
  for (const level of [...LEVELS, MILLENNIUM]) {
    texts({ river: level.river, place: level.place, builder: level.builder, hazards: level.hazards }, level.id, out);
  }
  for (const id of [...LEVELS.map((l) => l.id), 'epilogue', 'daily', 'millennium'] as const) texts(content.story(id), `story.${id}`, out);
  for (const n of [0, 6, 14, 24, 33, 36]) texts(rank(n), `rank.${n}`, out);
  return out;
}

describe('the twelve rivers', () => {
  it('are twelve, in order, a generation apart', () => {
    expect(LEVELS.map((l) => l.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(12);
    for (let i = 1; i < LEVELS.length; i++) expect(LEVELS[i]!.year).toBeGreaterThan(LEVELS[i - 1]!.year);
    for (const l of LEVELS) {
      expect(l.endYear).toBe(2026);
      expect(l.passYears).toBe(30);
      expect(content.level(l.id)).toBe(l);
    }
  });

  it.each(LEVELS.map((l) => [l.id, l] as const))('%s: the starter normalizes to itself and validates clean', (_id, level) => {
    expect(sim.normalize(level, level.starter)).toEqual(level.starter);
    expect(sim.validate(level, level.starter)).toEqual([]);
  });

  it.each([...LEVELS, MILLENNIUM].map((l) => [l.id, l] as const))('%s: named hazards fall after the build year and by 2026', (_id, level) => {
    for (const h of level.hazards) {
      expect(h.year).toBeGreaterThan(level.year);
      expect(h.year).toBeLessThanOrEqual(2026);
    }
  });

  it.each(LEVELS.map((l) => [l.id, l] as const))('%s: the ground reaches 1.5 bridge lengths past each abutment and dips under the water', (_id, level) => {
    const { ground, left, right } = level.site;
    const length = right - left;
    for (let i = 1; i < ground.length; i++) expect(ground[i]!.x).toBeGreaterThan(ground[i - 1]!.x);
    expect(ground[0]!.x).toBeLessThanOrEqual(left - 1.5 * length);
    expect(ground[ground.length - 1]!.x).toBeGreaterThanOrEqual(right + 1.5 * length);
    expect(Math.min(...ground.filter((p) => p.x > left && p.x < right).map((p) => p.y))).toBeLessThan(0);
  });

  it.each(LEVELS.map((l) => [l.id, l] as const))('%s: traffic runs without a gap from the build year past 2026', (_id, level) => {
    expect(level.traffic[0]!.from).toBe(level.year);
    for (let i = 1; i < level.traffic.length; i++) expect(level.traffic[i]!.from).toBe(level.traffic[i - 1]!.to);
    expect(level.traffic[level.traffic.length - 1]!.to).toBeGreaterThan(2026);
  });

  it('Uzunköprü has 174 arches with its arcade', () => {
    const ergene = content.level('ergene')!;
    const [a, b] = ergene.site.arcade!;
    expect(ergene.starter.spans.length + a + b).toBe(174);
  });
});

describe('the ledger', () => {
  it('every authored text has both languages', () => {
    const all = allTexts();
    expect(all.length).toBeGreaterThan(150);
    for (const { path, text } of all) {
      expect(text.tr.trim(), path).not.toBe('');
      expect(text.en.trim(), path).not.toBe('');
    }
  });

  it('never raises its voice', () => {
    for (const { path, text } of allTexts()) {
      expect(text.tr, path).not.toContain('!');
      expect(text.en, path).not.toContain('!');
    }
  });

  it.each([...LEVELS.map((l) => l.id), 'epilogue', 'daily', 'millennium'] as const)('%s: a story with a hint for every cause', (id) => {
    const story = content.story(id) as LevelStory;
    expect(story).not.toBeNull();
    expect(story.intro.lines.length).toBeGreaterThanOrEqual(1);
    expect(story.intro.lines.length).toBeLessThanOrEqual(3);
    expect(story.passed.length).toBeGreaterThanOrEqual(1);
    expect(story.failed.length).toBeGreaterThanOrEqual(1);
    for (const cause of CAUSES) expect(story.hints[cause], cause).toBeDefined();
  });

  it('ranks rise with the seals', () => {
    expect([0, 5, 6, 13, 14, 23, 24, 32, 33, 36].map((n) => rank(n).tr)).toEqual(['Çırak', 'Çırak', 'Kalfa', 'Kalfa', 'Usta', 'Usta', 'Başusta', 'Başusta', 'Mimar', 'Mimar']);
    expect(rank(Number.NaN).tr).toBe('Çırak');
  });
});

describe('epitaphs', () => {
  const koramaz = content.level('koramaz')!;
  const flood1683 = koramaz.hazards.find((h) => h.year === 1683)!;
  const info = (cause: CauseId, year: number, hazard?: HazardDef): CollapseInfo => ({
    year,
    cause,
    spans: [{ span: 0, delay: 0, hinges: [], sense: 1 }],
    piers: [],
    ...(hazard ? { hazard } : {}),
  });

  it('read like the ledger', () => {
    expect(content.epitaph(info('flood-wash', 1683, flood1683))).toEqual({ tr: '1683 bahar selinde yıkıldı.', en: 'Fell in the spring flood of 1683.' });
    expect(content.epitaph(info('strike', 1147)).tr).toBe('1147’de, kalıp sökülünce yıkıldı.');
    expect(content.epitaph(info('weathering', 1683)).tr).toBe('1683’te, derzleri boşalınca yıkıldı.');
    const quake = content.level('yesilirmak')!.hazards.find((h) => h.kind === 'quake' && h.year === 1668)!;
    expect(content.epitaph(info('quake', 1668, quake)).tr).toBe('1668 yaz depreminde yıkıldı.');
    const guns = content.level('tunca')!.hazards.find((h) => h.kind === 'load' && h.year === 1526)!;
    expect(content.epitaph(info('load', 1526, guns)).tr).toBe('1526 baharında, sefer topları geçerken yıkıldı.');
  });

  it('keep the season when a saved run brings a copy of the hazard', () => {
    expect(content.epitaph(info('flood-wash', 1683, { ...flood1683 })).tr).toBe('1683 bahar selinde yıkıldı.');
  });

  it.each(CAUSES)('cover %s, with and without a hazard', (cause) => {
    for (const hazard of [undefined, flood1683]) {
      const e = content.epitaph(info(cause, 1712, hazard));
      const x = content.explain(info(cause, 1712, hazard));
      for (const t of [e, x]) {
        expect(t.tr.length).toBeGreaterThan(8);
        expect(t.en.length).toBeGreaterThan(8);
      }
      expect(e.tr.endsWith('yıkıldı.')).toBe(true);
      expect(e.en.startsWith('Fell ')).toBe(true);
      expect(x.tr.split('. ').length).toBeLessThanOrEqual(3);
    }
  });

  it('put the right ending on a year', () => {
    const cases: [number, string][] = [
      [1147, 'de'],
      [1683, 'te'],
      [1930, 'da'],
      [1940, 'ta'],
      [1960, 'ta'],
      [1970, 'te'],
      [1990, 'da'],
      [1800, 'de'],
      [2000, 'de'],
      [2026, 'da'],
      [1505, 'te'],
      [1999, 'da'],
    ];
    for (const [year, ending] of cases) expect(trLocative(year), String(year)).toBe(ending);
  });
});

describe('generated rivers', () => {
  it('the river of the day is the same for everyone and differs from day to day', () => {
    const a = createContent(sim).daily('2026-11-11');
    const b = createContent(sim).daily('2026-11-11');
    const c = content.daily('2026-11-12');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a.site.ground)).not.toBe(JSON.stringify(c.site.ground));
    for (const level of [a, c]) checkGenerated(level);
  });

  it('the thousand years start in 1026 and grow', () => {
    const m = content.millennium();
    expect(m.year).toBe(1026);
    checkGenerated(m);
    const quakes = m.hazards.filter((h) => h.kind === 'quake').map((h) => (h.kind === 'quake' ? h.pga : 0));
    for (let i = 1; i < quakes.length; i++) expect(quakes[i]!).toBeGreaterThan(quakes[i - 1]!);
  });

  it('the epilogue is the player’s own bridge on its own river', () => {
    const source = content.level('koramaz')!;
    const e = content.epilogue(source, source.starter);
    expect(e.id).toBe('epilogue');
    expect(e.index).toBe(13);
    expect(e.site).toBe(source.site);
    expect(e.starter).toEqual(source.starter);
    expect(makeEpilogue(source, source.starter).builder.tr).toBe('Elif Taşçı');
  });
});

function checkGenerated(level: LevelDef): void {
  expect(sim.validate(level, level.starter)).toEqual([]);
  expect(sim.insight(level, level.starter).safety).toBeGreaterThanOrEqual(1);
  expect(level.parStones).toBeGreaterThan(0);
  for (const h of level.hazards) {
    expect(h.year).toBeGreaterThan(level.year);
    expect(h.year).toBeLessThanOrEqual(2026);
  }
}
