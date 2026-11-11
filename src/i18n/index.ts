/** Registers the interface dictionaries with core/i18n. Idempotent, so every createUi may call it. */
import { registerStrings, t as coreT } from '../core/i18n';
import { en } from './en';
import { tr, type UiKey } from './tr';

let registered = false;

export function registerUiStrings(): void {
  if (registered) return;
  registered = true;
  registerStrings('tr', tr);
  registerStrings('en', en);
}

/** Typed lookup: a misspelt key is a compile error rather than a key shown to the player. */
export function t(key: UiKey, vars?: Readonly<Record<string, string | number>>): string {
  return coreT(key, vars);
}

export type { UiKey };
export { tr, en };
