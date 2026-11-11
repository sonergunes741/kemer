/** What every part of the interface shares: the intent outlet, the projector and live settings. */
import type { Projector, UiIntent } from '../core/contracts';
import type { LevelDef, Settings } from '../core/types';

export interface UiContext {
  emit(intent: UiIntent): void;
  readonly projector: Projector;
  /** The interface's own copy, patched as the player changes settings. */
  readonly settings: Settings;
  /** The interface root (positioned over the canvas, same box). */
  readonly root: HTMLElement;
  /** The level of the current screen, when it has one. */
  level(): LevelDef | null;
  /** Pointer position inside the root, CSS pixels (the projector's frame). */
  local(clientX: number, clientY: number): { x: number; y: number };
  reducedMotion(): boolean;
}

/** Copy a projected point out of the projector's (possibly shared) result. */
export function projectTo(ctx: UiContext, x: number, y: number): { x: number; y: number } {
  const p = ctx.projector.toScreen({ x, y });
  return { x: p.x, y: p.y };
}
