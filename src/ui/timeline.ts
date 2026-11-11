/** Pure maths of the time HUD's timeline: positions, century ticks and event ticks. */

/** Position of a year along the line from the build year to the end year, 0..1. */
export function yearFraction(year: number, start: number, end: number): number {
  if (!(end > start)) return 1;
  const f = (year - start) / (end - start);
  return f < 0 ? 0 : f > 1 ? 1 : f;
}

/** The round centuries strictly between the two ends (ticks too close to an end are dropped). */
export function centuryTicks(start: number, end: number, minGapYears = 20): number[] {
  const out: number[] = [];
  if (!(end > start)) return out;
  for (let y = Math.ceil(start / 100) * 100; y < end; y += 100) {
    if (y - start >= minGapYears && end - y >= minGapYears) out.push(y);
  }
  return out;
}

/** Add an event year to a sorted list unless one already sits within `minGap` years. */
export function addTick(ticks: readonly number[], year: number, minGap = 1): number[] {
  if (!Number.isFinite(year)) return [...ticks];
  if (ticks.some((y) => Math.abs(y - year) < minGap)) return [...ticks];
  return [...ticks, year].sort((a, b) => a - b);
}

/** The year the bridge outlasts its builder, if it falls inside the line. */
export function outlastYear(start: number, passYears: number, end: number): number | null {
  const y = start + passYears;
  return passYears > 0 && y < end ? y : null;
}

/** The whole year shown in the corner: never ahead of the simulation, never past the end. */
export function displayYear(year: number, start: number, end: number): number {
  const y = Math.floor(year + 1e-6);
  return Math.max(Math.floor(start), Math.min(Math.floor(end), y));
}

/** Season index 0 winter, 1 spring, 2 summer, 3 autumn, from the 0..1 position in the year. */
export function seasonIndex(season: number): 0 | 1 | 2 | 3 {
  const s = ((season % 1) + 1) % 1;
  // Winter straddles the new year: December to February.
  const shifted = (s + 1 / 12) % 1;
  return Math.min(3, Math.floor(shifted * 4)) as 0 | 1 | 2 | 3;
}
