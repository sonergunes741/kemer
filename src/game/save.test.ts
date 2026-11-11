import { describe, expect, it } from 'vitest';
import { SAVE_KEY, emptySave } from '../core/config';
import { createSaveStore, memoryStorage, prefixedStorage, sanitizeSave } from './save';

describe('save', () => {
  it('round-trips a save', () => {
    const storage = memoryStorage();
    const store = createSaveStore(storage, 'tr');
    const data = emptySave('tr');
    data.mark = { strokes: [[1, 7], [3, 5]] };
    data.taught = ['k1.raise', 'k1.build'];
    data.levels.koramaz = { bestYears: 879, bestStones: 696, seals: { standing: true, lean: true, unrepaired: false }, masterwork: false, passed: true, attempts: 2, design: null, markStone: { span: 0, stone: 4 }, witnessed: [1683] };
    store.save(data);
    expect(store.load()).toEqual(data);
  });

  it('starts fresh on damaged data and keeps a copy aside', () => {
    const storage = memoryStorage();
    storage.set(SAVE_KEY, '{not json');
    const store = createSaveStore(storage, 'en');
    expect(store.load()).toEqual(emptySave('en'));
    expect(storage.get(`${SAVE_KEY}.damaged`)).toBe('{not json');
  });

  it('keeps a save from a newer version aside instead of overwriting it', () => {
    const storage = memoryStorage();
    storage.set(SAVE_KEY, JSON.stringify({ v: 2, levels: {} }));
    expect(createSaveStore(storage, 'tr').load()).toEqual(emptySave('tr'));
    expect(storage.get(`${SAVE_KEY}.v2`)).not.toBeNull();
  });

  it('repairs bad fields one by one', () => {
    const out = sanitizeSave({ mark: { strokes: [[0, 9], [2, 2], [4, 8]] }, taught: ['a', 'a', 3], levels: { koramaz: { bestYears: -5, attempts: 'x', passed: true }, nowhere: {} }, settings: { master: 7, quality: 'ultra', lang: 'en' } }, 'tr');
    expect(out.mark).toEqual({ strokes: [[4, 8]] });
    expect(out.taught).toEqual(['a']);
    expect(out.levels.koramaz?.bestYears).toBe(0);
    expect(out.levels.koramaz?.attempts).toBe(0);
    expect(out.levels.koramaz?.passed).toBe(true);
    expect(Object.keys(out.levels)).toEqual(['koramaz']);
    expect(out.settings.master).toBe(1);
    expect(out.settings.quality).toBe(emptySave('tr').settings.quality);
    expect(out.settings.lang).toBe('en');
  });

  it('lets a harness keep its own save beside the player', () => {
    const inner = memoryStorage();
    const store = createSaveStore(prefixedStorage(inner, 'hx.'), 'tr');
    store.save(emptySave('tr'));
    expect(inner.get(SAVE_KEY)).toBeNull();
    expect(inner.get(`hx.${SAVE_KEY}`)).not.toBeNull();
    store.erase();
    expect(inner.get(`hx.${SAVE_KEY}`)).toBeNull();
  });
});
