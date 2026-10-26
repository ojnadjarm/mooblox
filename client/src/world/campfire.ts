import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  Quaternion,
  Vector2,
  Vector3,
  type Material,
} from 'three';

/** Where a campfire burns (ground point at its centre). */
export interface FireSpot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Flame tongues per fire: a tall centre and smaller ones leaning out. */
const TONGUES: readonly { readonly ox: number; readonly oz: number; readonly h: number; readonly w: number }[] = [
  { ox: 0, oz: 0, h: 0.9, w: 0.8 },
  { ox: 0.14, oz: 0.06, h: 0.55, w: 0.6 },
  { ox: -0.11, oz: 0.1, h: 0.5, w: 0.55 },
  { ox: 0.02, oz: -0.14, h: 0.6, w: 0.6 },
];
/** Embers per fire by tier (low draws none). */
const EMBERS: Readonly<Record<string, number>> = { low: 0, medium: 4, high: 7, xhigh: 8 };
/** Seconds an ember lives and how high (m) it climbs. */
const EMBER_LIFE = 1.6;
const EMBER_RISE = 1.5;
/** Fires further than this (m) from the camera are skipped. */
const DRAW = 60;
/** Flame colour bottom to tip, and its unlit brightness (a little over 1 so the high tier's bloom gives a small halo). */
const FLAME = [new Color(0xd8401a), new Color(0xf5781e), new Color(0xffb52e), new Color(0xffe680)];
const FLAME_GAIN = 1.1;
const GLOW = new Color(0xff9a4a);

/** One flame tongue's flicker at time `t`: height and width factors, sway (rad) and twist. */
export function flicker(t: number, seed: number): { h: number; w: number; sway: number; twist: number } {
  const a = Math.sin(t * 9.1 + seed * 17) * 0.5 + Math.sin(t * 14.3 + seed * 5) * 0.3 + Math.sin(t * 23.7 + seed * 11) * 0.2;
  return { h: 1 + a * 0.22, w: 1 - a * 0.1, sway: Math.sin(t * 3.3 + seed * 7) * 0.12, twist: t * 0.8 + seed * 6.28 };
}

/** One ember `age` (0..1) through its life: offset from the fire and size (m); it drifts up, wanders and shrinks. */
export function emberAt(age: number, seed: number): { dx: number; dy: number; dz: number; size: number } {
  const a = seed * 6.28;
  const r = 0.12 + age * 0.35;
  return {
    dx: Math.cos(a + age * 3) * r * 0.6,
    dy: 0.25 + age * EMBER_RISE,
    dz: Math.sin(a + age * 3) * r * 0.6,
    size: 0.05 * (1 - age) ** 0.7,
  };
}

/** A teardrop flame 1 m tall (non-indexed), coloured bottom to tip. */
function flameGeometry(): BufferGeometry {
  const profile = [
    [0, 0],
    [0.17, 0.12],
    [0.17, 0.4],
    [0.08, 0.7],
    [0, 1],
  ].map(([x, y]) => new Vector2(x, y));
  const g = new LatheGeometry(profile, 6).toNonIndexed();
  const pos = g.getAttribute('position');
  const colours = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const y = Math.min(0.999, Math.max(0, pos.getY(i))) * (FLAME.length - 1);
    const k = Math.floor(y);
    c.copy(FLAME[k]!).lerp(FLAME[k + 1]!, y - k);
    colours.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new BufferAttribute(colours, 3));
  return g;
}

/** A small faceted spark (non-indexed octahedron, 0.5 m across), one colour. */
function emberGeometry(): BufferGeometry {
  return new OctahedronGeometry(0.5, 0);
}

/** A warm glow on the ground round each fire: a disc fading to nothing at its rim, added onto what is under it. */
function glowGeometry(): BufferGeometry {
  const g = new CircleGeometry(1, 20).rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position');
  const colours = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = (1 - Math.min(1, Math.hypot(pos.getX(i), pos.getZ(i)))) ** 2;
    colours.set([k, k, k], i * 3);
  }
  g.setAttribute('color', new BufferAttribute(colours, 3));
  return g;
}

/**
 * Every campfire's animated flames and embers as one dynamic mesh on the scene's lamp-glow material (no new shader program),
 * rewritten each frame for the fires near the camera; plus, off the low tier, one instanced draw of flickering ground glows.
 */
export class Campfires {
  readonly flames: Mesh;
  readonly glow: InstancedMesh | null;
  private readonly flame = flameGeometry();
  private readonly ember = emberGeometry();
  private readonly embers: number;
  private readonly position: Float32Array;
  private readonly colour: Float32Array;
  private readonly gain: number;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly s = new Vector3();
  private readonly c = new Color();
  private readonly axis = new Vector3();
  private readonly p = new Vector3();

  /** `material` draws vertex colours unlit times its own colour (`brightness`), which the flame colours are divided by. */
  constructor(
    private readonly fires: readonly FireSpot[],
    tier: string,
    material: Material,
    brightness: number,
  ) {
    this.embers = EMBERS[tier] ?? 0;
    this.gain = FLAME_GAIN / brightness;
    const verts = Math.max(1, fires.length * (TONGUES.length * this.flame.getAttribute('position').count + this.embers * this.ember.getAttribute('position').count));
    this.position = new Float32Array(verts * 3);
    this.colour = new Float32Array(verts * 3);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.position, 3).setUsage(DynamicDrawUsage));
    g.setAttribute('color', new BufferAttribute(this.colour, 3).setUsage(DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.flames = new Mesh(g, material);
    this.flames.name = 'campfire-flames';
    this.flames.frustumCulled = false;
    if (tier === 'low') {
      this.glow = null;
      return;
    }
    this.glow = new InstancedMesh(
      glowGeometry(),
      new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 }),
      Math.max(1, fires.length),
    );
    this.glow.name = 'campfire-glow';
    this.glow.instanceMatrix.setUsage(DynamicDrawUsage);
    this.glow.frustumCulled = false;
    this.glow.count = 0;
    this.glow.setColorAt(0, this.c.setRGB(1, 1, 1));
  }

  /** Flickers every fire near the camera at time `t` (s). */
  update(t: number, eye: Vector3): void {
    let n = 0;
    let g = 0;
    for (let i = 0; i < this.fires.length; i++) {
      const f = this.fires[i]!;
      if (Math.hypot(f.x - eye.x, f.z - eye.z) > DRAW) continue;
      for (let k = 0; k < TONGUES.length; k++) {
        const tongue = TONGUES[k]!;
        const fl = flicker(t, i * 0.37 + k * 0.21);
        this.axis.set(Math.cos(fl.twist), 0, Math.sin(fl.twist));
        this.q.setFromAxisAngle(this.axis, fl.sway);
        this.s.set(tongue.w * fl.w, tongue.h * fl.h, tongue.w * fl.w);
        this.m.compose(this.v.set(f.x + tongue.ox, f.y, f.z + tongue.oz), this.q, this.s);
        n = this.write(this.flame, n, null);
      }
      for (let k = 0; k < this.embers; k++) {
        const seed = ((i * 7 + k) * 0.6180339) % 1;
        const age = (t / EMBER_LIFE + k / this.embers + seed * 0.5) % 1;
        const e = emberAt(age, seed);
        this.m.compose(this.v.set(f.x + e.dx, f.y + e.dy, f.z + e.dz), this.q.identity(), this.s.set(e.size * 2, e.size * 3, e.size * 2));
        n = this.write(this.ember, n, this.c.setRGB(1.1, 0.7 - age * 0.3, 0.3 - age * 0.2));
      }
      if (!this.glow) continue;
      const glow = 0.22 + flicker(t * 0.8, i * 0.53).h * 0.12;
      this.m.compose(this.v.set(f.x, f.y + 0.02, f.z), this.q.identity(), this.s.set(1.4, 1, 1.4));
      this.glow.setMatrixAt(g, this.m);
      this.glow.setColorAt(g, this.c.copy(GLOW).multiplyScalar(glow));
      g++;
    }
    const geometry = this.flames.geometry;
    geometry.setDrawRange(0, n);
    if (n) {
      for (const name of ['position', 'color']) {
        const a = geometry.getAttribute(name) as BufferAttribute;
        a.clearUpdateRanges();
        a.addUpdateRange(0, n * 3);
        a.needsUpdate = true;
      }
    }
    if (this.glow) {
      this.glow.count = g;
      this.glow.instanceMatrix.needsUpdate = true;
      if (this.glow.instanceColor) this.glow.instanceColor.needsUpdate = true;
    }
  }

  /** Writes `part` moved by the current matrix from vertex `n` on, in its own colours or `tint`; returns the next free vertex. */
  private write(part: BufferGeometry, n: number, tint: Color | null): number {
    const pos = part.getAttribute('position');
    const col = part.getAttribute('color');
    for (let j = 0; j < pos.count; j++, n++) {
      this.p.fromBufferAttribute(pos, j).applyMatrix4(this.m);
      this.position[n * 3] = this.p.x;
      this.position[n * 3 + 1] = this.p.y;
      this.position[n * 3 + 2] = this.p.z;
      this.colour[n * 3] = (tint ? tint.r : col!.getX(j)) * this.gain;
      this.colour[n * 3 + 1] = (tint ? tint.g : col!.getY(j)) * this.gain;
      this.colour[n * 3 + 2] = (tint ? tint.b : col!.getZ(j)) * this.gain;
    }
    return n;
  }

  dispose(): void {
    this.flames.removeFromParent();
    this.flames.geometry.dispose();
    this.flame.dispose();
    this.ember.dispose();
    if (this.glow) {
      this.glow.removeFromParent();
      this.glow.geometry.dispose();
      (this.glow.material as MeshBasicMaterial).dispose();
    }
  }
}
