import { describe, expect, it } from 'vitest';
import { createContent } from '../../content';
import { createSim } from '../../sim';
import { ageBridge, restoreChoices, smallestEnough, TARGET, wornModel } from './restore';

const sim = createSim();
const content = createContent(sim);

describe('the epilogue bridge', () => {
  const source = content.level('koramaz')!;
  // The starter ring is too thin on purpose (the first lesson); the player's bridge was thickened
  // until the line ran inside it, as this one is.
  let sound = source.starter;
  for (let t = sound.spans[0]!.thickness; t <= source.limits.thickness[1] && sim.insight(source, sound).safety < 1.8; t += 0.05) {
    sound = sim.normalize(source, { ...sound, spans: sound.spans.map((s) => ({ ...s, thickness: t })) });
  }
  const level = content.epilogue(source, sound);
  const design = level.starter;

  it('lives its centuries kept by the family and is found worn but standing in 2026', () => {
    const t0 = performance.now();
    const run = ageBridge(sim, level, design);
    const ms = performance.now() - t0;
    expect(run).not.toBeNull();
    expect(run!.state.collapsed).toBe(false);
    expect(run!.year).toBeGreaterThan(2025.9);
    // Still open to a repair: the chronicle has not reached its end.
    expect(run!.ended).toBe(false);
    // Fast enough to run behind the arrival's black.
    expect(ms).toBeLessThan(4000);
  });

  it('offers repairs smallest first, each judged by the simulation', () => {
    const worn = ageBridge(sim, level, design)!;
    const twin = ageBridge(sim, level, design);
    const choices = restoreChoices(sim, level, design, worn, twin);
    expect(choices[0]!.kind).toBe('clean');
    expect(choices[0]!.safety).toBeCloseTo(worn.state.safety, 6);
    for (let i = 1; i < choices.length; i++) expect(choices[i]!.stones).toBeGreaterThanOrEqual(choices[i - 1]!.stones);
    const pick = choices[smallestEnough(choices)]!;
    // Some repair always reaches the target on the starter bridge, and none cheaper does.
    expect(pick.safety).toBeGreaterThanOrEqual(TARGET);
    for (const c of choices) if (c.stones < pick.stones) expect(c.safety).toBeLessThan(TARGET);
  });

  it('draws the worn ring inside the stone and shows the gauge it is given', () => {
    const worn = ageBridge(sim, level, design)!;
    const model = wornModel(sim, level, design, worn.state, worn.state.safety);
    expect(model.handles).toHaveLength(0);
    expect(model.safety).toBe(worn.state.safety);
    const sp = model.spans[0]!;
    expect(sp.intrados.length).toBeGreaterThan(2);
    expect(sp.thrustLine.length).toBeGreaterThan(2);
  });
});
