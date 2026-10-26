import { AdditiveBlending, CylinderGeometry, DoubleSide, Mesh, MeshBasicMaterial } from 'three';

/** The warp's column of light: an open additive cylinder scaled to a height and width at a ground point. */
export class WarpBeam {
  readonly mesh: Mesh;

  constructor() {
    const material = new MeshBasicMaterial({ color: 0xbff4ff, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false });
    this.mesh = new Mesh(new CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0), material);
    this.mesh.name = 'warp-beam';
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
  }

  /** Puts the beam on a point (feet height `y`) with a height and width; height 0 hides it. */
  set(x: number, y: number, z: number, height: number, width: number): void {
    this.mesh.visible = height > 0.01 && width > 0.01;
    this.mesh.position.set(x, y, z);
    this.mesh.scale.set(width, height, width);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
  }
}
