/**
 * Where to show the hand that takes hold of the sun: towards the sun, kept in the upper middle of the
 * frame when the sun itself is off to the side or behind a hill. The world lights the
 * scene with one directional light that follows the sun, so its direction is the sun's.
 */
import { DirectionalLight, Vector3 } from 'three';
import type { UiIntent, WorldApi } from '../../core/contracts';
import { clamp } from '../../core/math';
import type { Vec2 } from '../../core/types';

/** Far enough that the camera's own offset from the scene centre does not matter. */
const SKY_DISTANCE = 2000;
/** Hours of sun one screen-width of drag moves. */
const SUN_HOURS = 10;

export function sunMark(world: WorldApi, width: number, height: number): Vec2 | null {
  const light = world.scene.getObjectsByProperty('isDirectionalLight', true).find((o): o is DirectionalLight => o instanceof DirectionalLight);
  if (!light || width <= 0 || height <= 0) return null;
  const dir = new Vector3().subVectors(light.position, light.target.position).normalize();
  if (dir.y < 0.02) return null;
  const cam = world.rig.camera;
  const p = cam.position.clone().addScaledVector(dir, SKY_DISTANCE);
  // Behind the camera: there is no good place on screen to point at.
  if (p.clone().applyMatrix4(cam.matrixWorldInverse).z > 0) return null;
  p.project(cam);
  // Clear of the year in the top left and the gauge in the top right, and of the screen's edge
  // (the hand's arc reaches above its target).
  const x = clamp((p.x * 0.5 + 0.5) * width, width * 0.3, width * 0.7);
  const y = clamp((0.5 - p.y * 0.5) * height, height * 0.18, height * 0.34);
  return world.fromScreen(x, y);
}

/** The player's hold on the sun: a drag sets the hour, and one long enough lets time go. */
export class SunHold {
  private held: { x: number; id: number; hour: number } | null = null;

  get holding(): boolean {
    return this.held !== null;
  }

  release(): void {
    this.held = null;
  }

  gesture(e: Extract<UiIntent, { type: 'canvas' }>, width: number, hour: number): { hour: number; go: boolean } {
    const held = this.held;
    if (e.phase === 'down' && !held) this.held = { x: e.x, id: e.id, hour };
    if (!held || e.id !== held.id) return { hour, go: false };
    const dx = e.x - held.x;
    if (e.phase === 'move') return { hour: clamp(held.hour + (dx / width) * SUN_HOURS, 5.5, 19.5), go: false };
    const go = e.phase === 'up' && Math.abs(dx) > width * 0.05;
    if (!go && (e.phase === 'up' || e.phase === 'cancel')) this.held = null;
    return { hour, go };
  }
}