import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, CylinderGeometry, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, Quaternion, Vector3, type Material } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { collectibleGeometry } from '../world/collectible-models';
import { trophyModel } from '../world/trophy-cup';
import { archSpots, padSpots, PADS_PER_FLOOR } from './hub-layout';
import { padTheme, PORTAL } from './hub-scene';

/** What a pad's portal shows on the current floor. */
export interface PortalState {
  /** A course stands behind the pad. */
  readonly open: boolean;
  readonly completed: boolean;
  readonly gems: number;
}

const DORMANT = new Color(0x6f7f95).multiplyScalar(0.45);
const GOLD = new Color(0xffd65a);
const CUP = { y: 0.35 + 3.3 + 0.05, scale: 1.7 } as const;
const GEM = { y: 1.7, scale: 1.7 } as const;

/** The animated parts of the warp room: a swirling disc in each arch, gems over pads with finds, gold cups on finished arches, the warp beam. */
export class Portals {
  readonly group = new Group();
  private readonly swirls: InstancedMesh;
  private readonly gems: InstancedMesh;
  private readonly cups: InstancedMesh;
  readonly beam: Mesh;
  private readonly materials: Material[] = [];
  private states: readonly PortalState[] = [];
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly roll = new Quaternion();
  private readonly v = new Vector3();
  private readonly s = new Vector3();
  private readonly axis = new Vector3();

  constructor(glow: Material, plastic: Material) {
    this.group.name = 'portals';
    this.swirls = new InstancedMesh(swirlGeometry(), glow, PADS_PER_FLOOR);
    this.swirls.name = 'portal-swirls';
    const gemMaterial = new MeshLambertMaterial({ vertexColors: true, emissive: 0x3a3450 });
    this.gems = new InstancedMesh(collectibleGeometry('gem'), gemMaterial, PADS_PER_FLOOR);
    this.gems.name = 'pad-gems';
    this.cups = new InstancedMesh(cupGeometry(), plastic, PADS_PER_FLOOR * 2);
    this.cups.name = 'arch-cups';
    this.cups.castShadow = true;
    const beamMaterial = new MeshBasicMaterial({ color: 0xbff4ff, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false });
    this.beam = new Mesh(new CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0), beamMaterial);
    this.beam.name = 'warp-beam';
    this.beam.visible = false;
    this.materials.push(gemMaterial, beamMaterial);
    for (const mesh of [this.swirls, this.gems, this.cups]) mesh.frustumCulled = false;
    this.group.add(this.swirls, this.gems, this.cups, this.beam);
    this.show([]);
  }

  /** Shows a floor: open portals in their pad's colour (gold when finished), dormant grey discs on empty slots. */
  show(states: readonly PortalState[]): void {
    this.states = states;
    const c = new Color();
    for (let i = 0; i < PADS_PER_FLOOR; i++) {
      const st = states[i];
      if (!st?.open) c.copy(DORMANT);
      else if (st.completed) c.copy(GOLD);
      else c.setHex(padTheme(i).accent);
      this.swirls.setColorAt(i, c);
    }
    this.swirls.instanceColor!.needsUpdate = true;
    let cups = 0;
    archSpots().forEach((a, i) => {
      if (!states[i]?.completed) return;
      for (const side of [-1, 1]) {
        this.v.set(side * 2.05, CUP.y, 0).applyAxisAngle(this.axis.set(0, 1, 0), a.yaw).add(this.s.set(a.x, 0, a.z));
        this.q.setFromAxisAngle(this.axis, a.yaw);
        this.cups.setMatrixAt(cups++, this.m.compose(this.v, this.q, this.s.setScalar(CUP.scale)));
      }
    });
    this.cups.count = cups;
    this.cups.instanceMatrix.needsUpdate = true;
    this.update(0);
  }

  /** Spins the open swirls and bobs the gems (t = seconds). */
  update(t: number): void {
    const up = this.axis;
    archSpots().forEach((a, i) => {
      const open = this.states[i]?.open ?? false;
      const turn = open ? -t * 1.6 : 0;
      this.q.setFromAxisAngle(up.set(0, 1, 0), a.yaw).multiply(this.roll.setFromAxisAngle(this.v.set(0, 0, 1), turn));
      this.v.set(a.x, PORTAL.y, a.z).addScaledVector(this.s.set(Math.sin(a.yaw), 0, Math.cos(a.yaw)), 0.2);
      this.swirls.setMatrixAt(i, this.m.compose(this.v, this.q, this.s.set(PORTAL.r, PORTAL.r * PORTAL.sy, 1)));
    });
    this.swirls.instanceMatrix.needsUpdate = true;
    let gems = 0;
    padSpots().forEach((p, i) => {
      if (!(this.states[i]?.gems ?? 0)) return;
      this.q.setFromAxisAngle(up.set(0, 1, 0), t * 1.4 + i);
      this.v.set(p.x, GEM.y + Math.sin(t * 2 + i) * 0.15, p.z);
      this.gems.setMatrixAt(gems++, this.m.compose(this.v, this.q, this.s.setScalar(GEM.scale)));
    });
    this.gems.count = gems;
    this.gems.instanceMatrix.needsUpdate = true;
  }

  /** Puts the warp beam on a point with a height and width; height 0 hides it. */
  setBeam(x: number, z: number, height: number, width: number): void {
    this.beam.visible = height > 0.01 && width > 0.01;
    this.beam.position.set(x, 0.3, z);
    this.beam.scale.set(width, height, width);
  }

  dispose(): void {
    for (const mesh of [this.swirls, this.gems, this.cups, this.beam]) mesh.geometry.dispose();
    for (const m of this.materials) m.dispose();
  }
}

/** A unit disc facing +z with spiral arms in the vertex colours (white and a soft grey: the instance colour tints it). */
function swirlGeometry(): BufferGeometry {
  const rings = 7;
  const segs = 40;
  const pos: number[] = [];
  const col: number[] = [];
  const arm = (a: number, r: number) => (Math.floor((a / (Math.PI * 2)) * 6 + r * 2.4) % 2 ? 1 : 0.4);
  for (let ri = 0; ri < rings; ri++) {
    const r0 = ri / rings;
    const r1 = (ri + 1) / rings;
    for (let si = 0; si < segs; si++) {
      const a0 = (si / segs) * Math.PI * 2;
      const a1 = ((si + 1) / segs) * Math.PI * 2;
      const k = ri === 0 ? 1.15 : arm((a0 + a1) / 2, (r0 + r1) / 2);
      const p = (r: number, a: number) => [Math.cos(a) * r, Math.sin(a) * r, 0];
      pos.push(...p(r0, a0), ...p(r1, a0), ...p(r1, a1), ...p(r0, a0), ...p(r1, a1), ...p(r0, a1));
      for (let v = 0; v < 6; v++) col.push(k, k, k);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.computeVertexNormals();
  return g;
}

/** The gold loving cup as one position-normal-colour geometry. */
function cupGeometry(): BufferGeometry {
  const parts = trophyModel('gold').parts.map((g) => {
    const flat = (g as BufferGeometry).index ? (g as BufferGeometry).toNonIndexed() : (g as BufferGeometry).clone();
    for (const key of Object.keys(flat.attributes)) if (key !== 'position' && key !== 'normal' && key !== 'color') flat.deleteAttribute(key);
    return flat;
  });
  return mergeGeometries(parts, false)!;
}
