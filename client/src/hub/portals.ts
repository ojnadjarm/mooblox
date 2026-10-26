import { BufferGeometry, Color, Group, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3, type Material } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { trophyModel } from '../world/trophy-cup';
import { archSpots, PADS_PER_FLOOR, type Spot } from './hub-layout';
import { padTheme, PLINTH } from './hub-scene';
import { openingGeometry, paintOpening, portalFluidMaterial } from './portal-fluid';
import { WarpBeam } from './warp-beam';

/** What a pad's portal shows on the current floor. */
export interface PortalState {
  /** A course stands behind the pad. */
  readonly open: boolean;
  readonly completed: boolean;
}

const DORMANT = new Color(0x6f7f95).multiplyScalar(0.45);
const GOLD = new Color(0xffd65a);
const CUP_SCALE = 1.7;

/** The animated parts of the warp room: the fluid in each arch, gold cups on finished arches' plinths, the warp beam. */
export class Portals {
  readonly group = new Group();
  private readonly fluid: Mesh;
  private readonly cups: InstancedMesh;
  private readonly warpBeam = new WarpBeam();
  readonly beam: Mesh;
  private readonly fluidMaterial: Material;
  private readonly perOpening: number;

  constructor(plastic: Material, time: { value: number }) {
    this.group.name = 'portals';
    const one = openingGeometry();
    this.perOpening = one.getAttribute('position').count;
    this.fluidMaterial = portalFluidMaterial(time);
    this.fluid = new Mesh(mergeGeometries(archSpots().map((s) => place(one.clone(), s)), false)!, this.fluidMaterial);
    one.dispose();
    this.fluid.name = 'portal-fluid';
    this.fluid.renderOrder = 2;
    this.cups = new InstancedMesh(cupGeometry(), plastic, PADS_PER_FLOOR * 2);
    this.cups.name = 'arch-cups';
    this.cups.castShadow = true;
    this.cups.frustumCulled = false;
    this.beam = this.warpBeam.mesh;
    this.group.add(this.fluid, this.cups, this.beam);
    this.show([]);
  }

  /** Shows a floor: open portals in their pad's colour (gold when finished), dormant grey fluid on empty slots, cups on finished arches. */
  show(states: readonly PortalState[]): void {
    const c = new Color();
    const g = this.fluid.geometry;
    for (let i = 0; i < PADS_PER_FLOOR; i++) {
      const st = states[i];
      if (!st?.open) c.copy(DORMANT);
      else if (st.completed) c.copy(GOLD);
      else c.setHex(padTheme(i).accent);
      paintOpening(g, i * this.perOpening, this.perOpening, c, !!st?.open);
    }
    const spots = cupMatrices(states.map((s) => s.completed));
    spots.forEach((m, i) => this.cups.setMatrixAt(i, m));
    this.cups.count = spots.length;
    this.cups.instanceMatrix.needsUpdate = true;
  }

  /** Puts the warp beam on a ground point with a height and width; height 0 hides it. */
  setBeam(x: number, z: number, height: number, width: number): void {
    this.warpBeam.set(x, 0.3, z, height, width);
  }

  dispose(): void {
    this.fluid.geometry.dispose();
    this.cups.geometry.dispose();
    this.fluidMaterial.dispose();
    this.warpBeam.dispose();
  }
}

/** Moves a local arch part (front +z) to an arch spot. */
function place(g: BufferGeometry, s: Spot): BufferGeometry {
  return g.rotateY(s.yaw).translate(s.x, 0, s.z);
}

/** World matrices of the gold cups: one on each plinth of every finished arch, standing on its cap. */
export function cupMatrices(finished: readonly boolean[]): Matrix4[] {
  const out: Matrix4[] = [];
  const up = new Vector3(0, 1, 0);
  archSpots().forEach((a, i) => {
    if (!finished[i]) return;
    const q = new Quaternion().setFromAxisAngle(up, a.yaw);
    for (const side of [-1, 1]) {
      const p = new Vector3(side * PLINTH.x, PLINTH.h, 0).applyQuaternion(q).add(new Vector3(a.x, 0, a.z));
      out.push(new Matrix4().compose(p, q, new Vector3().setScalar(CUP_SCALE)));
    }
  });
  return out;
}

/** The gold loving cup as one position-normal-colour geometry, standing on y = 0. */
export function cupGeometry(): BufferGeometry {
  const parts = trophyModel('gold').parts.map((g) => {
    const flat = (g as BufferGeometry).index ? (g as BufferGeometry).toNonIndexed() : (g as BufferGeometry).clone();
    for (const key of Object.keys(flat.attributes)) if (key !== 'position' && key !== 'normal' && key !== 'color') flat.deleteAttribute(key);
    return flat;
  });
  const g = mergeGeometries(parts, false)!;
  g.computeBoundingBox();
  return g.translate(0, -g.boundingBox!.min.y, 0);
}
