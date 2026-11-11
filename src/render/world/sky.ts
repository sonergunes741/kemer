/**
 * The sky dome and the image-based ambient made from it. The dome follows whichever camera
 * renders it (the main view and the mirrored water camera), so it never needs to be huge.
 * The environment map is a PMREM of the same shader with lit ground below the horizon,
 * regenerated only when the light has changed enough to notice.
 */
import {
  BackSide,
  Color,
  Mesh,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  type Camera,
  type Texture,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { log } from '../../core/log';
import { SKY_FRAGMENT, SKY_VERTEX } from './skyShader';

export interface SkyUniforms {
  [name: string]: { value: unknown };
  uSunDir: { value: Vector3 };
  uBetaR: { value: Vector3 };
  uBetaM: { value: Vector3 };
  uSunE: { value: number };
  uSunfade: { value: number };
  uMieG: { value: number };
  uExposure: { value: number };
  uDisc: { value: number };
  uPole: { value: Vector3 };
  uDecBand: { value: Vector2 };
  uStreak: { value: number };
  uStreakTint: { value: Color };
  uNoise: { value: Texture };
  uCloudCover: { value: number };
  uCloudAlpha: { value: number };
  uCloudOffset: { value: Vector2 };
  uCloudSun: { value: Color };
  uCloudShade: { value: Color };
  uFogColor: { value: Color };
  uHorizonHaze: { value: number };
  uNight: { value: number };
  uGround: { value: Color };
  uEnvPass: { value: number };
}

export class SkyDome {
  readonly mesh: Mesh;
  readonly uniforms: SkyUniforms;
  private readonly envScene = new Scene();
  private readonly envMaterial: ShaderMaterial;
  private readonly pmrem: PMREMGenerator;
  private envTarget: WebGLRenderTarget | null = null;
  private envSize = 128;

  constructor(renderer: WebGLRenderer, noise: Texture) {
    this.uniforms = {
      uSunDir: { value: new Vector3(0, 1, 0) },
      uBetaR: { value: new Vector3() },
      uBetaM: { value: new Vector3() },
      uSunE: { value: 0 },
      uSunfade: { value: 1 },
      uMieG: { value: 0.8 },
      uExposure: { value: 1 },
      uDisc: { value: 1 },
      uPole: { value: new Vector3(0, 0.6, -0.8) },
      uDecBand: { value: new Vector2(0, 0) },
      uStreak: { value: 0 },
      uStreakTint: { value: new Color(1, 1, 1) },
      uNoise: { value: noise },
      uCloudCover: { value: 0.3 },
      uCloudAlpha: { value: 0.8 },
      uCloudOffset: { value: new Vector2() },
      uCloudSun: { value: new Color(1, 1, 1) },
      uCloudShade: { value: new Color(0.5, 0.55, 0.6) },
      uFogColor: { value: new Color(0.6, 0.65, 0.7) },
      uHorizonHaze: { value: 0.6 },
      uNight: { value: 0 },
      uGround: { value: new Color(0.1, 0.1, 0.08) },
      uEnvPass: { value: 0 },
    };
    const material = new ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: this.uniforms,
      side: BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new Mesh(new SphereGeometry(1, 64, 32), material);
    this.mesh.name = 'sky';
    this.mesh.frustumCulled = false;
    // Drawn after the other opaque things so early depth rejection skips the hidden sky.
    this.mesh.renderOrder = 900;
    // Centre the dome on whichever camera draws it (main view, water mirror, environment cube).
    this.mesh.onBeforeRender = (_r, _s, camera: Camera) => {
      this.mesh.position.setFromMatrixPosition(camera.matrixWorld);
      this.mesh.updateMatrixWorld();
    };

    // The environment pass shares every uniform except the flag that paints the ground.
    const envUniforms: Record<string, { value: unknown }> = { ...this.uniforms, uEnvPass: { value: 1 } };
    this.envMaterial = new ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: envUniforms,
      side: BackSide,
      depthWrite: false,
      fog: false,
    });
    const envMesh = new Mesh(new SphereGeometry(1, 32, 16), this.envMaterial);
    envMesh.scale.setScalar(10);
    this.envScene.add(envMesh);
    this.pmrem = new PMREMGenerator(renderer);
  }

  /** Radius of the dome: inside the camera's far plane. */
  setRadius(r: number): void {
    this.mesh.scale.setScalar(r);
  }

  setEnvSize(size: number): void {
    this.envSize = size;
  }

  /** Rebuild the image-based ambient from the current sky. Returns the texture for scene.environment. */
  refreshEnvironment(): Texture | null {
    try {
      const target = this.pmrem.fromScene(this.envScene, 0, 1, 100, { size: this.envSize });
      this.envTarget?.dispose();
      this.envTarget = target;
      return target.texture;
    } catch (err) {
      log.once('world:env', 'world', 'environment map failed; ambient falls back to the hemisphere', err);
      return this.envTarget?.texture ?? null;
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as ShaderMaterial).dispose();
    this.envMaterial.dispose();
    this.envTarget?.dispose();
    this.pmrem.dispose();
  }
}
