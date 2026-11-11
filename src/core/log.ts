/**
 * Tiny logger. Hot paths must never throw: catch, report once with `log.once`, and degrade.
 * Keeps a short ring of recent problems for the error screen.
 */

const MAX_RECENT = 20;
const recent: string[] = [];
const seen = new Set<string>();

function describe(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function remember(level: string, tag: string, parts: readonly unknown[]): void {
  const line = `[${level}] ${tag}: ${parts.map(describe).join(' ')}`;
  recent.push(line.length > 400 ? `${line.slice(0, 400)}…` : line);
  if (recent.length > MAX_RECENT) recent.shift();
}

export const log = {
  info(tag: string, ...parts: unknown[]): void {
    if (import.meta.env.DEV) console.info(`[${tag}]`, ...parts);
  },
  warn(tag: string, ...parts: unknown[]): void {
    remember('warn', tag, parts);
    console.warn(`[${tag}]`, ...parts);
  },
  error(tag: string, ...parts: unknown[]): void {
    remember('error', tag, parts);
    console.error(`[${tag}]`, ...parts);
  },
  /** Warn only the first time a given key is seen (for per-frame failure paths). */
  once(key: string, tag: string, ...parts: unknown[]): void {
    if (seen.has(key)) return;
    seen.add(key);
    remember('warn', tag, parts);
    console.warn(`[${tag}]`, ...parts);
  },
  recent(): readonly string[] {
    return recent;
  },
};
