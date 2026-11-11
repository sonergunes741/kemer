/**
 * Balance report for the twelve rivers (docs/LEVELS.md, "Balance"). Searches each level's design
 * space with the real simulation and prints the table kept in docs/BALANCE.md.
 *
 *   npm run balance                       all rivers
 *   npm run balance -- koramaz batman     some rivers
 *   npm run balance -- --samples=400      samples per search (default 1500 single arch, 220 with piers)
 *   npm run balance -- --json             also print the designs found (search vectors), as JSON
 *
 * Node runs this file with its types stripped. The sources import each other without file
 * extensions (Vite style), so a resolve hook adds `.ts`; `import.meta.env` is Vite's, so a load
 * hook answers it the way a production build would.
 */
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') && !specifier.endsWith('.ts')) return next(`${specifier}.ts`, context);
      throw error;
    }
  },
  load(url, context, next) {
    const out = next(url, context);
    if (url.endsWith('.ts') && out.source !== undefined && out.source !== null) {
      return { ...out, source: String(out.source).replaceAll('import.meta.env.DEV', 'false') };
    }
    return out;
  },
});

const { createSim } = await import('../src/sim/index.ts');
const { LEVELS } = await import('../src/content/index.ts');
const { MILLENNIUM } = await import('../src/content/millennium.ts');
const { DEFAULT_SEARCH } = await import('../src/content/tuning/search.ts');
const { balanceLevel, details, summaryTable } = await import('../src/content/tuning/report.ts');

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => args.find((a) => a.startsWith(`--${name}`))?.split('=')[1];
const ids = args.filter((a) => !a.startsWith('--'));
const asked = flag('samples');
/**
 * As many samples as a river's runs allow. A narrow search misses good corners (Fırtına's
 * cheapest bridge came out twice the real one at 220 samples), but a run with many piers takes a
 * quarter of a second, so the wide rivers keep the default.
 */
function samplesFor(level: { limits: { maxPiers: number } }): number {
  if (asked) return Number(asked);
  const piers = level.limits.maxPiers;
  return piers === 0 ? 1500 : piers <= 5 ? 600 : DEFAULT_SEARCH.samples;
}
const json = args.includes('--json');

const sim = createSim();
const all = [...LEVELS, MILLENNIUM];
const chosen = ids.length > 0 ? all.filter((l) => ids.includes(l.id)) : all;
const reports = [];
// Each river's details as soon as it is done (the wide rivers take minutes); the table at the end.
for (const level of chosen) {
  const report = balanceLevel(sim, level, { ...DEFAULT_SEARCH, samples: samplesFor(level) });
  reports.push(report);
  console.error(`${level.id}: ${report.runs} runs in ${(report.ms / 1000).toFixed(1)} s`);
  console.log(details(report));
  console.log('');
}

console.log(summaryTable(reports));
if (json) {
  // Search vectors, not designs: src/content/tuning/facts.ts records these and rebuilds the designs.
  const found = Object.fromEntries(
    reports.map((r) => [
      r.level.id,
      {
        pass: r.pass?.params ?? null,
        stand: r.cheapestStand?.params ?? null,
        standPolicy: r.cheapestStand?.outcome.policy ?? null,
        standStones: r.cheapestStand?.outcome.stones ?? null,
        master: r.master?.params ?? null,
        masterPolicy: r.master?.outcome.policy ?? null,
        masterStones: r.master?.outcome.stones ?? null,
      },
    ]),
  );
  console.log(JSON.stringify(found, null, 1));
}
