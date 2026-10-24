import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  WebGLRenderTarget,
  type Material,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { District } from './dressing';
import type { Circle } from './layout';
import type { ModelLibrary } from './model-library';
import { withFade } from './island-fade';

/** How the islands past the live one look: haze only, real neighbours, ultra-low-poly silhouettes or pre-rendered cards. */
export type FarMode = 'fog' | 'full' | 'silhouette' | 'impostor';

/** The default on every tier and shape: pre-rendered cards (T1369; options in `~/drop/T1368/options.html`). */
export const DEFAULT_FAR: FarMode = 'impostor';

/** `?far=` or the default; software GL defaults to silhouettes (each card capture is a long CPU render there). */
export function farMode(query: string | null, software = false): FarMode {
  if (query === 'fog' || query === 'full' || query === 'silhouette' || query === 'impostor') return query;
  return software ? 'silhouette' : DEFAULT_FAR;
}

/** A cheap stand-in for the islands in the haze ring: one draw for the whole ring. */
export interface FarView {
  readonly mesh: Mesh;
  /** Shows the islands `ring` (indices into the island list); rebuilds only when the set changed. */
  setRing(ring: readonly number[]): void;
  /** Background work, once per frame (impostor captures); returns true when the picture changed. */
  step(): boolean;
  dispose(): void;
}

/** Blocks a silhouette keeps per island, biggest first. */
const SILHOUETTE_BLOCKS = 40;
/** Solids lower than this (m) stay out of a silhouette. */
const MIN_HEIGHT = 1.4;

/** Ultra-low-poly silhouette of one district: its biggest solids as boxes (trees as cones) and its landmark as a prism. */
export function silhouetteGeometry(district: District, lib: ModelLibrary, landmark: { x: number; z: number; top: number; colour: number; cap: number } | null): BufferGeometry | null {
  const parts: BufferGeometry[] = [];
  const picks = district.placements
    .filter((p) => p.solid && !p.minor && !p.rich && p.height >= MIN_HEIGHT && p.y > -1)
    .map((p) => {
      const m = lib.get(p.id);
      const s = p.width ? p.width / m.width : p.height / m.height;
      return { p, w: m.width * s, h: m.height * s };
    })
    .sort((a, b) => b.w * b.w * b.h - a.w * a.w * a.h)
    .slice(0, SILHOUETTE_BLOCKS);
  for (const { p, w, h } of picks) {
    const colour = new Color(averageColour(lib, p.id));
    if (p.tint !== undefined) colour.multiply(new Color(p.tint));
    if (p.id.includes('tree')) {
      const g = new CylinderGeometry(0, w * 0.45, h, 5, 1);
      place(g, p.x, p.y + h / 2, p.z, p.yaw);
      parts.push(painted(stripBottom(g), colour));
    } else if (p.roof !== undefined) {
      // A house: walls and a four-sided roof in its roof colour.
      const body = new BoxGeometry(w * 0.75, h * 0.62, w * 0.75);
      place(body, p.x, p.y + h * 0.31, p.z, p.yaw);
      parts.push(painted(stripBottom(body), colour));
      const roof = new CylinderGeometry(0, w * 0.62, h * 0.38, 4, 1);
      place(roof, p.x, p.y + h * 0.81, p.z, p.yaw + Math.PI / 4);
      parts.push(painted(stripBottom(roof), new Color(p.roof)));
    } else {
      const g = new BoxGeometry(w * 0.8, h, w * 0.8);
      place(g, p.x, p.y + h / 2, p.z, p.yaw);
      parts.push(painted(stripBottom(g), colour));
    }
  }
  if (landmark) {
    // The district landmark: a cream tower with a coloured cap, the island's sign from afar.
    const body = new CylinderGeometry(2.4, 3, landmark.top * 0.75, 8, 1);
    place(body, landmark.x, landmark.top * 0.375, landmark.z, 0);
    parts.push(painted(stripBottom(body), new Color(landmark.colour)));
    const cap = new CylinderGeometry(0, 3.2, landmark.top * 0.3, 8, 1);
    place(cap, landmark.x, landmark.top * 0.85, landmark.z, 0);
    parts.push(painted(stripBottom(cap), new Color(landmark.cap)));
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return merged;
}

/** Plank decks with low rails for every bridge, one geometry: the way on stays visible while the island across is a fake. */
export function deckGeometry(bridges: readonly { ax: number; az: number; bx: number; bz: number }[], deck: number, rail: number, top: number): BufferGeometry | null {
  const parts: BufferGeometry[] = [];
  for (const b of bridges) {
    const len = Math.hypot(b.bx - b.ax, b.bz - b.az) + 1.6;
    const yaw = Math.atan2(b.bx - b.ax, b.bz - b.az);
    const mx = (b.ax + b.bx) / 2;
    const mz = (b.az + b.bz) / 2;
    // Just under and inside the real deck, so the real one covers it wherever both draw.
    const g = new BoxGeometry(2.9, 0.3, len);
    place(g, mx, top - 0.27, mz, yaw);
    parts.push(painted(stripBottom(g), new Color(deck)));
    for (const side of [-1.35, 1.35]) {
      const r = new BoxGeometry(0.14, 0.12, len - 0.8);
      place(r, mx + Math.cos(yaw) * side, top + 0.9, mz - Math.sin(yaw) * side, yaw);
      parts.push(painted(stripBottom(r), new Color(rail)));
    }
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return merged;
}

/** A 16-sided lawn disc with a dirt rim per island, just under the real land: the islands round the live one. */
export function groundGeometry(islands: readonly Circle[], grass: number, dirt: number): BufferGeometry | null {
  const parts: BufferGeometry[] = [];
  for (const c of islands) {
    const top = new CylinderGeometry(c.radius, c.radius, 0.01, 16, 1, false).toNonIndexed();
    place(top, c.x, -0.06, c.z, 0);
    parts.push(painted(stripBottom(onlyUp(top)), new Color(grass)));
    const side = new CylinderGeometry(c.radius, c.radius * 0.88, 3.2, 16, 1, true);
    place(side, c.x, -1.66, c.z, 0);
    parts.push(painted(stripBottom(side), new Color(dirt)));
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return merged;
}

/** Keeps the upward faces of a geometry. */
function onlyUp(g: BufferGeometry): BufferGeometry {
  const pos = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  const keep: number[] = [];
  const keepN: number[] = [];
  for (let t = 0; t < pos.count; t += 3) {
    if (nrm.getY(t) < 0.9) continue;
    for (let k = 0; k < 3; k++) {
      keep.push(pos.getX(t + k), pos.getY(t + k), pos.getZ(t + k));
      keepN.push(0, 1, 0);
    }
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new Float32BufferAttribute(keep, 3));
  out.setAttribute('normal', new Float32BufferAttribute(keepN, 3));
  g.dispose();
  return out;
}

/** Silhouettes of the ring islands merged into one mesh over one plastic material with the inverted island fade. */
export class Silhouettes implements FarView {
  readonly mesh: Mesh;
  private readonly cache = new Map<number, BufferGeometry | null>();
  private key = '';

  constructor(
    material: Material,
    private readonly build: (island: number) => BufferGeometry | null,
  ) {
    this.mesh = new Mesh(new BufferGeometry(), material);
    this.mesh.name = 'far-silhouettes';
    this.mesh.matrixAutoUpdate = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
  }

  setRing(ring: readonly number[]): void {
    const key = ring.join(',');
    if (key === this.key) return;
    // At most two new silhouettes per frame: a ring change never costs a long frame; the rest follow (under the haze).
    let builds = 0;
    let complete = true;
    const parts: BufferGeometry[] = [];
    for (const i of ring) {
      if (!this.cache.has(i)) {
        if (builds++ >= 2) {
          complete = false;
          continue;
        }
        this.cache.set(i, this.build(i));
      }
      const g = this.cache.get(i);
      if (g) parts.push(g);
    }
    this.key = complete ? key : '';
    this.mesh.geometry.dispose();
    this.mesh.geometry = (parts.length ? mergeGeometries(parts, false) : null) ?? new BufferGeometry();
    this.mesh.visible = parts.length > 0;
  }

  step(): boolean {
    return false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    for (const g of this.cache.values()) g?.dispose();
    (this.mesh.material as Material).dispose();
  }
}

/** Atlas of impostor tiles: 8 x 8 tiles of 256 x 128 px. */
const ATLAS = { w: 2048, h: 1024, cols: 8, rows: 8 } as const;
/** District mesh chunks an impostor capture draws per frame (each at most CHUNK_VERTICES). */
const CAPTURE_MESHES = 2;
/** Elevation of the capture camera (radians): a little from above, like the play camera. */
const CAPTURE_PITCH = 0.22;

/** What an impostor capture needs from the world: building and freeing a district, and the scene to draw it in. */
export interface CaptureHost {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  /** Island i's capture build (a group under the scenery, hidden from play). */
  district(i: number): Object3D;
  /** Runs island i's capture build in the background; true once it is built and on the GPU. */
  build(i: number): boolean;
  /** Island i is captured: frees its capture build. */
  release(i: number): void;
  /** Objects shown during a capture besides the district (the scenery group and its parents). */
  readonly keep: readonly Object3D[];
}

/** A capture in progress: island i into atlas tile `tile`, its meshes drawn a few per frame. */
interface CaptureJob {
  readonly i: number;
  readonly tile: number;
  readonly meshes: readonly Mesh[];
  next: number;
}

/**
 * Pre-rendered cards: each island's real build is rendered once (built in the background, captured into one atlas tile,
 * freed again) and stands in as a camera-facing card. One draw and one 2048 x 1024 texture for the ring. A capture never
 * costs one long frame: it draws CAPTURE_MESHES of the district's mesh chunks per frame into the tile (the tile's depth
 * buffer carries over), mipmaps once at the end.
 */
export class Impostors implements FarView {
  readonly mesh: Mesh;
  private readonly target = new WebGLRenderTarget(ATLAS.w, ATLAS.h, { generateMipmaps: true, minFilter: LinearMipmapLinearFilter });
  private readonly tiles = new Map<number, number>();
  private readonly queue: number[] = [];
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  private ring: readonly number[] = [];
  private key = '';
  private job: CaptureJob | null = null;

  constructor(
    private readonly islands: readonly Circle[],
    private readonly host: CaptureHost,
    /** Where cards are seen from most (the spawn): each capture looks from there. */
    private readonly from: { x: number; z: number },
  ) {
    // Captures render like the canvas (sRGB out, tone mapped): the scenery's own programs, no render-target variants
    // compiled mid-walk. The atlas then holds display colours: the card decodes them and is not tone mapped again.
    (this.target as WebGLRenderTarget & { isXRRenderTarget: boolean }).isXRRenderTarget = true;
    this.target.texture.colorSpace = SRGBColorSpace;
    const material = new MeshBasicMaterial({ map: this.target.texture, alphaTest: 0.5, toneMapped: false });
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', 'diffuseColor *= sRGBTransferEOTF(texture2D(map, vMapUv));');
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 centre;')
        .replace(
          '#include <begin_vertex>',
          'vec3 toCam = cameraPosition - centre;\nvec3 side = normalize(vec3(toCam.z, 0.0, -toCam.x));\nvec3 transformed = centre + side * position.x + vec3(0.0, position.y, 0.0);',
        );
    };
    material.customProgramCacheKey = () => 'mooblox-impostor';
    withFade(material, true);
    this.mesh = new Mesh(new BufferGeometry(), material);
    this.mesh.name = 'far-impostors';
    this.mesh.matrixAutoUpdate = false;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    // Captures queue nearest the spawn first: the ring the player sees first is ready first.
    this.queue = islands.map((_, i) => i).sort((a, b) => dist(islands[a]!, from) - dist(islands[b]!, from));
    this.queue = this.queue.slice(0, ATLAS.cols * ATLAS.rows);
  }

  setRing(ring: readonly number[]): void {
    this.ring = ring;
    const key = ring.filter((i) => this.tiles.has(i)).join(',');
    if (key === this.key) return;
    this.key = key;
    this.rebuild();
  }

  step(): boolean {
    if (!this.job) {
      const i = this.queue[0];
      if (i === undefined) return false;
      if (!this.host.build(i)) return false;
      this.queue.shift();
      const meshes: Mesh[] = [];
      this.host.district(i).traverse((o) => {
        if ((o as Mesh).isMesh) meshes.push(o as Mesh);
      });
      this.job = { i, tile: this.tiles.size, meshes, next: 0 };
    }
    const job = this.job;
    const end = Math.min(job.meshes.length, job.next + CAPTURE_MESHES);
    this.capture(job, end);
    job.next = end;
    if (end < job.meshes.length) return false;
    this.job = null;
    this.tiles.set(job.i, job.tile);
    this.host.release(job.i);
    this.key = '';
    this.setRing(this.ring);
    return true;
  }

  /** Draws the job's meshes up to `end` into its tile: the first slice clears the tile, the last one mipmaps the atlas. */
  private capture(job: CaptureJob, end: number): void {
    const { renderer, scene } = this.host;
    const c = this.islands[job.i]!;
    const tw = ATLAS.w / ATLAS.cols;
    const th = ATLAS.h / ATLAS.rows;
    const col = job.tile % ATLAS.cols;
    const row = Math.floor(job.tile / ATLAS.cols);
    const half = c.radius + 3;
    const cam = this.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half / 2;
    cam.bottom = -half / 2;
    const dir = this.viewDirection(c);
    const d = c.radius + 40;
    cam.position.set(c.x - dir.x * d * Math.cos(CAPTURE_PITCH), half / 2 - 3 + d * Math.sin(CAPTURE_PITCH), c.z - dir.z * d * Math.cos(CAPTURE_PITCH));
    cam.lookAt(c.x, half / 2 - 3, c.z);
    cam.near = d - c.radius - 4;
    cam.far = d + c.radius + 4;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    // Only the district's line to the scene and that line's siblings change: a big world's thousands of props stay untouched.
    const shown = new Map<Object3D, boolean>();
    const keep = new Set<Object3D>(this.host.keep);
    const district = this.host.district(job.i);
    for (let a = district; a.parent; a = a.parent) {
      for (const o of a.parent.children) {
        shown.set(o, o.visible);
        o.visible = o === a || keep.has(o) || isLight(o);
      }
    }
    district.traverse((o) => {
      if (!shown.has(o)) shown.set(o, o.visible);
      o.visible = !(o as Mesh).isMesh;
    });
    for (let k = job.next; k < end; k++) job.meshes[k]!.visible = true;
    const background = scene.background;
    const fog = scene.fog as { near: number; far: number } | null;
    const fogNear = fog?.near ?? 0;
    const fogFar = fog?.far ?? 0;
    if (fog) {
      fog.near = 1e5;
      fog.far = 2e5;
    }
    scene.background = null;
    const clear = renderer.getClearColor(new Color());
    const alpha = renderer.getClearAlpha();
    const shadows = renderer.shadowMap.autoUpdate;
    const autoClear = renderer.autoClear;
    // The world matrices are this frame's already: no pass over every object in the scene for one slice.
    const matrices = scene.matrixWorldAutoUpdate;
    scene.matrixWorldAutoUpdate = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.autoClear = false;
    this.target.texture.generateMipmaps = end === job.meshes.length;
    this.target.viewport.set(col * tw, row * th, tw, th);
    this.target.scissor.set(col * tw, row * th, tw, th);
    this.target.scissorTest = true;
    renderer.setRenderTarget(this.target);
    if (job.next === 0) {
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
    }
    renderer.render(scene, cam);
    renderer.setRenderTarget(null);
    renderer.setClearColor(clear, alpha);
    renderer.autoClear = autoClear;
    renderer.shadowMap.autoUpdate = shadows;
    scene.matrixWorldAutoUpdate = matrices;
    scene.background = background;
    if (fog) {
      fog.near = fogNear;
      fog.far = fogFar;
    }
    for (const [o, v] of shown) o.visible = v;
  }

  private viewDirection(c: Circle): { x: number; z: number } {
    const dx = c.x - this.from.x;
    const dz = c.z - this.from.z;
    const l = Math.hypot(dx, dz);
    return l < 1 ? { x: 0, z: 1 } : { x: dx / l, z: dz / l };
  }

  private rebuild(): void {
    const pos: number[] = [];
    const centre: number[] = [];
    const uv: number[] = [];
    const index: number[] = [];
    for (const i of this.ring) {
      const tile = this.tiles.get(i);
      if (tile === undefined) continue;
      const c = this.islands[i]!;
      const half = c.radius + 3;
      const col = tile % ATLAS.cols;
      const row = Math.floor(tile / ATLAS.cols);
      const u0 = col / ATLAS.cols;
      const v0 = row / ATLAS.rows;
      const u1 = u0 + 1 / ATLAS.cols;
      const v1 = v0 + 1 / ATLAS.rows;
      const base = pos.length / 3;
      const bottom = -3 - (half / 2) * Math.sin(CAPTURE_PITCH);
      for (const [x, y, u, v] of [
        [-half, bottom, u0, v0],
        [half, bottom, u1, v0],
        [half, bottom + half, u1, v1],
        [-half, bottom + half, u0, v1],
      ] as const) {
        pos.push(x, y, 0);
        centre.push(c.x, 0, c.z);
        uv.push(u, v);
      }
      index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('centre', new Float32BufferAttribute(centre, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
    this.mesh.visible = index.length > 0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as Material).dispose();
    this.target.dispose();
  }
}

const colours = new Map<string, number>();

/** A model's mean vertex colour (cached per model). */
function averageColour(lib: ModelLibrary, id: string): number {
  let hex = colours.get(id);
  if (hex === undefined) {
    const col = lib.get(id).geometry.getAttribute('color');
    const c = new Color(0.8, 0.8, 0.8);
    if (col) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let i = 0; i < col.count; i++) {
        r += col.getX(i);
        g += col.getY(i);
        b += col.getZ(i);
      }
      c.setRGB(r / col.count, g / col.count, b / col.count);
    }
    hex = c.getHex();
    colours.set(id, hex);
  }
  return hex;
}

function place(g: BufferGeometry, x: number, y: number, z: number, yaw: number): void {
  g.applyMatrix4(new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw), new Vector3(1, 1, 1)));
}

/** Drops downward faces (never seen: the blocks stand on the ground). */
function stripBottom(g: BufferGeometry): BufferGeometry {
  const flat = g.index ? g.toNonIndexed() : g;
  if (flat !== g) g.dispose();
  const pos = flat.getAttribute('position');
  const nrm = flat.getAttribute('normal');
  const keep: number[] = [];
  const keepN: number[] = [];
  for (let t = 0; t < pos.count; t += 3) {
    if (nrm.getY(t) < -0.9 && nrm.getY(t + 1) < -0.9 && nrm.getY(t + 2) < -0.9) continue;
    for (let k = 0; k < 3; k++) {
      keep.push(pos.getX(t + k), pos.getY(t + k), pos.getZ(t + k));
      keepN.push(nrm.getX(t + k), nrm.getY(t + k), nrm.getZ(t + k));
    }
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new Float32BufferAttribute(keep, 3));
  out.setAttribute('normal', new Float32BufferAttribute(keepN, 3));
  flat.dispose();
  return out;
}

function painted(g: BufferGeometry, c: Color): BufferGeometry {
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new BufferAttribute(col, 3));
  return g;
}

function dist(c: Circle, p: { x: number; z: number }): number {
  return Math.hypot(c.x - p.x, c.z - p.z);
}

function isLight(o: Object3D): boolean {
  return (o as Object3D & { isLight?: boolean }).isLight === true;
}
