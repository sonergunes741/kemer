/**
 * Planar reflection of the scene in the river (medium and high). The scene is drawn once more
 * from the camera mirrored in the water plane, at a fraction of the frame size, with an oblique
 * near plane so nothing below the water leaks into the reflection. Adapted from three's
 * Reflector (MIT), stripped down to a horizontal plane.
 */
import {
  HalfFloatType,
  LinearFilter,
  Matrix4,
  PerspectiveCamera,
  Plane,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three';

export class PlanarReflection {
  readonly target: WebGLRenderTarget;
  readonly textureMatrix = new Matrix4();
  private readonly mirror = new PerspectiveCamera();
  private readonly plane = new Plane();
  private readonly clip = new Vector4();
  private readonly q = new Vector4();
  private readonly v = new Vector3();
  private readonly look = new Vector3();
  private readonly camPos = new Vector3();
  scale = 0.5;

  constructor() {
    this.target = new WebGLRenderTarget(4, 4, { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: true });
    this.target.texture.generateMipmaps = false;
  }

  setSize(width: number, height: number): void {
    const w = Math.max(4, Math.round(width * this.scale));
    const h = Math.max(4, Math.round(height * this.scale));
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);
  }

  /** Render the mirrored view. `hide` are objects to leave out (the water itself, particles). */
  render(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, planeY: number, hide: readonly Object3D[]): void {
    const mirror = this.mirror;
    this.camPos.setFromMatrixPosition(camera.matrixWorld);
    // A camera under the water sees no reflection worth drawing.
    if (this.camPos.y <= planeY + 0.05) return;

    mirror.copy(camera, false);
    mirror.position.set(this.camPos.x, 2 * planeY - this.camPos.y, this.camPos.z);
    this.look.set(0, 0, -1).applyQuaternion(camera.quaternion).add(this.camPos);
    this.look.y = 2 * planeY - this.look.y;
    this.v.set(0, 1, 0).applyQuaternion(camera.quaternion);
    mirror.up.set(this.v.x, -this.v.y, this.v.z);
    mirror.lookAt(this.look);
    mirror.updateMatrixWorld();
    mirror.projectionMatrix.copy(camera.projectionMatrix);

    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);

    // Oblique near plane at the water surface (Lengyel).
    this.plane.set(new Vector3(0, 1, 0), -planeY);
    this.plane.applyMatrix4(mirror.matrixWorldInverse);
    this.clip.set(this.plane.normal.x, this.plane.normal.y, this.plane.normal.z, this.plane.constant);
    const e = mirror.projectionMatrix.elements;
    this.q.x = (Math.sign(this.clip.x) + e[8]!) / e[0]!;
    this.q.y = (Math.sign(this.clip.y) + e[9]!) / e[5]!;
    this.q.z = -1;
    this.q.w = (1 + e[10]!) / e[14]!;
    this.clip.multiplyScalar(2 / this.clip.dot(this.q));
    e[2] = this.clip.x;
    e[6] = this.clip.y;
    e[10] = this.clip.z + 1;
    e[14] = this.clip.w;
    mirror.projectionMatrixInverse.copy(mirror.projectionMatrix).invert();

    const visible = hide.map((o) => o.visible);
    for (const o of hide) o.visible = false;
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.state.buffers.depth.setMask(true);
    renderer.clear();
    renderer.render(scene, mirror);
    renderer.setRenderTarget(previous);
    hide.forEach((o, i) => {
      o.visible = visible[i]!;
    });
  }

  dispose(): void {
    this.target.dispose();
  }
}
