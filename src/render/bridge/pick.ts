/** Choosing a ring stone under the pointer, and lighting it while hovered. */
import { Vector3 } from 'three';
import type { StoneRef, WorldApi } from '../../core/contracts';
import type { BridgeModel } from './model';

/** The laid, standing ring stone under screen point (x, y), if any. */
export function pickStone(world: WorldApi, m: BridgeModel, x: number, y: number): StoneRef | null {
  const p = world.fromScreen(x, y);
  if (!p) return null;
  // The world picks on the plane of the upstream face; the ray runs from the eye through it.
  const origin = world.rig.camera.position.clone();
  const dir = new Vector3(p.x, p.y, m.geometry.width / 2).sub(origin).normalize();
  const i = m.field.pick(origin, dir, (k) => m.isRing(k) && m.laid[k] === 1 && m.gone[k] === 0);
  if (i < 0) return null;
  const s = m.stones[i]!;
  return { span: s.span, stone: s.voussoir };
}

/**
 * Light every piece of one ring course. The pieces of a course are laid out together, so a
 * single index range in the shader covers them; (-10, -10) lights nothing.
 */
export function setHover(m: BridgeModel, stone: StoneRef | null): void {
  let lo = -10;
  let hi = -10;
  if (stone) {
    m.stones.forEach((s, i) => {
      if (!m.isRing(i) || s.span !== stone.span || s.voussoir !== stone.stone) return;
      lo = lo < 0 ? i : Math.min(lo, i);
      hi = Math.max(hi, i);
    });
  }
  m.uniforms.uHover.value.set(lo, hi);
}
