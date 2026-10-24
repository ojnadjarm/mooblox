import { Material, OrthographicCamera, WebGLRenderTarget, type Camera, type Mesh, type Object3D, type Scene, type WebGLRenderer } from 'three';
import type { FrameBudget } from '../perf/frame-budget';

/**
 * GPU pre-upload: hands fresh meshes' buffers to the GPU one mesh per budget slice, before they are first drawn (an island
 * built behind the haze uploads while the player is still on the bridge, not in the frame it appears). Each upload is a
 * render of the lone mesh with an invisible material into a 1 x 1 target: three uploads the geometry and draws nothing.
 */
export class GpuWarmup {
  private readonly queue: Mesh[] = [];
  private readonly target = new WebGLRenderTarget(1, 1, { depthBuffer: false });
  private readonly camera = new OrthographicCamera();
  private readonly hidden = new Material();

  constructor(private readonly renderer: WebGLRenderer) {
    this.hidden.visible = false;
  }

  /** Meshes still to upload. */
  get pending(): number {
    return this.queue.length;
  }

  /** Queues every mesh under `root`. */
  add(root: Object3D): void {
    root.traverse((o) => {
      if ((o as Mesh).isMesh) this.queue.push(o as Mesh);
    });
  }

  /** Uploads queued meshes while the frame budget lasts; true when one was uploaded. */
  step(budget: FrameBudget): boolean {
    if (!this.queue.length) return false;
    let any = false;
    budget.run(() => {
      const mesh = this.queue.shift();
      if (mesh) {
        this.upload(mesh);
        any = true;
      }
      return this.queue.length === 0;
    });
    return any;
  }

  /** Compiles the programs of every material under `root`, hidden ones too, for the canvas or (`offscreen`) a plain target like the post chain's. */
  compile(root: Object3D, camera: Camera, scene: Scene, offscreen: boolean): void {
    const r = this.renderer;
    const before = r.getRenderTarget();
    r.setRenderTarget(offscreen ? this.target : null);
    r.compile(root, camera, scene);
    r.setRenderTarget(before);
  }

  private upload(mesh: Mesh): void {
    if (!mesh.parent) return;
    const r = this.renderer;
    const material = mesh.material;
    const culled = mesh.frustumCulled;
    const before = r.getRenderTarget();
    mesh.material = this.hidden;
    mesh.frustumCulled = false;
    r.setRenderTarget(this.target);
    r.render(mesh, this.camera);
    r.setRenderTarget(before);
    mesh.material = material;
    mesh.frustumCulled = culled;
  }

  dispose(): void {
    this.target.dispose();
    this.hidden.dispose();
  }
}
