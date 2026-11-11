/**
 * The one low-end hardware test. The game's first-run settings read it (GameEnv.lowEndHardware),
 * and the App builds the renderer on the settings the game will start with (startingSettings), so
 * a first run on such hardware starts on the low preset without switching (and re-baking every
 * texture) at boot.
 */

/** At or below this many logical cores, or this much memory (GB), a device starts on low. */
const LOW_END_CORES = 4;
const LOW_END_MEMORY_GB = 4;

/** The navigator fields the test reads (only Chromium reports deviceMemory). */
export interface HardwareInfo {
  readonly hardwareConcurrency?: number;
  readonly deviceMemory?: number;
}

/** Few cores or little memory. An unreported core count counts as 4, unreported memory as 8 GB. */
export function isLowEndHardware(info: HardwareInfo | null = typeof navigator !== 'undefined' ? navigator : null): boolean {
  const cores = info?.hardwareConcurrency || LOW_END_CORES;
  const memory = info?.deviceMemory ?? 8;
  return cores <= LOW_END_CORES || memory <= LOW_END_MEMORY_GB;
}
