import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { BiomeId } from '../../core/types';
import { fixtureBridge } from '../../../harness/worldFixtures';
import { framePose, orbitDirection, projectToCss, unprojectToPlaneZ } from './camera';

function cameraFor(pose: ReturnType<typeof framePose>, aspect: number): PerspectiveCamera {
  const cam = new PerspectiveCamera(pose.fov, aspect, 0.1, 10000);
  const t = new Vector3(pose.target.x, pose.target.y, pose.target.z);
  cam.position.copy(t).addScaledVector(orbitDirection(pose.yaw, pose.pitch), pose.distance);
  cam.lookAt(t);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
}

describe('camera', () => {
  for (const biome of ['tuff-valley', 'steppe-river', 'green-valley'] as BiomeId[]) {
    it(`frames every corner of the ${biome} bridge`, () => {
      const g = fixtureBridge(biome);
      const aspect = 16 / 9;
      for (const [yaw, pitch] of [
        [0, 0.1],
        [0.6, 0.3],
        [-0.9, 0.05],
      ] as const) {
        const pose = framePose(g, yaw, pitch, 38, aspect, 0.1);
        const cam = cameraFor(pose, aspect);
        let edge = 0;
        for (const p of g.deck) {
          for (const z of [-g.width / 2, g.width / 2]) {
            const v = new Vector3(p.x, p.y + g.parapetHeight, z).project(cam);
            expect(Math.abs(v.x)).toBeLessThanOrEqual(1.0001);
            expect(Math.abs(v.y)).toBeLessThanOrEqual(1.0001);
            edge = Math.max(edge, Math.abs(v.x), Math.abs(v.y));
          }
        }
        // Framed, not lost in the middle of the picture.
        expect(edge).toBeGreaterThan(0.6);
      }
    });
  }

  it('toScreen and fromScreen are inverse on the upstream face', () => {
    const g = fixtureBridge('green-valley');
    const pose = framePose(g, 0.4, 0.15, 38, 1.6);
    const cam = cameraFor(pose, 1.6);
    const planeZ = g.width / 2;
    const out = { x: 0, y: 0 };
    for (const p of [
      { x: 0, y: 2 },
      { x: g.deck[0]!.x, y: 1 },
      { x: g.deck[g.deck.length - 1]!.x, y: 5 },
    ]) {
      projectToCss(cam, { x: p.x, y: p.y, z: planeZ }, 1280, 800, out);
      const back = unprojectToPlaneZ(cam, out.x, out.y, 1280, 800, planeZ);
      expect(back).not.toBeNull();
      expect(back!.x).toBeCloseTo(p.x, 3);
      expect(back!.y).toBeCloseTo(p.y, 3);
    }
  });

  it('fromScreen is null for a degenerate canvas', () => {
    const cam = new PerspectiveCamera();
    expect(unprojectToPlaneZ(cam, 10, 10, 0, 0, 0)).toBeNull();
  });
});
