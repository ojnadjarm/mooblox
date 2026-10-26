import { BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial, RingGeometry, TorusGeometry, type Material, type ShaderMaterial } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WorldData } from '../domain/types';
import { IslandBuilder } from '../world/island-builder';
import { box, cone, facet, prism, rock } from '../world/landmarks/shapes';
import { THEMES, type ThemeId } from '../world/landmarks/themes';
import type { Look, LookPalette } from '../world/look';
import type { MaterialKit } from '../world/material-kit';
import { seededRandom } from '../world/random';
import { SIGN_CELLS, signCell, SignAtlas } from './hub-signs';
import { archSpots, displaySpots, HUB, padSpots, type Spot } from './hub-layout';

const THEME_ORDER: readonly ThemeId[] = ['library', 'science', 'sports', 'arts', 'harbour'];

/** Accent and shade of pad slot i (the same colour on every floor, as a warp room's buttons). */
export const padTheme = (i: number): { accent: number; shade: number } => {
  const t = THEMES[THEME_ORDER[i % THEME_ORDER.length]!];
  return { accent: t.accent, shade: t.accentShade };
};

/** Arch opening: centre height and radius of the portal disc. */
export const PORTAL = { y: 2.95, r: 1.65, sy: 1.55 } as const;
const ARCH = { span: 2.05, column: 3.3, tube: 0.3 } as const;
const PAD_H = 0.3;
const WALL_H = 0.95;
/** Sign cells: pads 0..4, displays 5..8. */
export const CELL = { display: 5 } as const;
const SIGN = { pad: { w: 3.8, h: 1.9, y: 7.0 }, display: { w: 2.2, h: 1.1, y: 0.62 } } as const;

/** The built hub: everything static plus the sign atlas the floors repaint. */
export interface HubScene {
  readonly group: Group;
  readonly water: ShaderMaterial | null;
  readonly signs: SignAtlas;
  readonly signMesh: Mesh;
  /** Meshes the kid collides with. */
  readonly solids: readonly Mesh[];
  dispose(): void;
}

const EMPTY_WORLD: WorldData = { courseId: 0, courseName: '', firstName: '', sections: [], nextChange: 0 };

/** Builds the hub island: plaza, balustrade, five pads with arches, the lift, display plinths, trees and every sign quad. */
export function buildHubScene(kit: MaterialKit, look: Look, low: boolean, rimDetail: number): HubScene {
  const hub = { x: 0, z: 0, radius: HUB.radius };
  // One island holding one plot (its pad hides inside the lift): the builder needs a studded top to merge.
  const zone = { ...hub, sectionId: 0, angle: 0, anchor: hub, plots: [{ x: 0, z: 0, radius: 2, activityId: 0, sectionId: 0, facing: 0 }] };
  const group = new IslandBuilder(kit, look, low, rimDetail).build(EMPTY_WORLD, { hub, hubs: [], links: [], spawn: { x: 0, z: 0 }, zones: [zone], extent: HUB.radius + 8 });
  group.name = 'hub';
  const p = look.palette;
  const parts: BufferGeometry[] = [];
  ring(parts, p);
  wall(parts, p);
  padSpots().forEach((s, i) => pad(parts, p, s, i));
  archSpots().forEach((s, i) => arch(parts, p, s, i));
  lift(parts, p);
  for (const s of displaySpots()) parts.push(at(prism(0.8, 0.95, 1.05, 8, p.trim), s), at(prism(0.84, 0.84, 0.08, 8, padTheme(0).accent, 0, 1.05), s));
  trees(parts, p);
  const solid = merged('hub-dressing', parts, kit.plastic);
  solid.castShadow = !low;
  group.add(solid);

  const signs = new SignAtlas();
  const material = new MeshBasicMaterial({ map: signs.texture, alphaTest: 0.5, toneMapped: false });
  const quads: BufferGeometry[] = [];
  archSpots().forEach((s, i) => quads.push(quad(SIGN.pad.w, SIGN.pad.h, SIGN.pad.y, 0.45, signCell(i), s)));
  displaySpots().forEach((s, i) => quads.push(quad(SIGN.display.w, SIGN.display.h, SIGN.display.y, 0.97, signCell(CELL.display + i), s, -0.25)));
  if (quads.length > SIGN_CELLS) throw new Error('hub: more signs than atlas cells');
  const signMesh = new Mesh(mergeGeometries(quads, false)!, material);
  signMesh.name = 'hub-signs';
  group.add(signMesh);

  const water = group.getObjectByName('water') as Mesh | undefined;
  const wm = water?.material;
  const land = group.children.filter((o): o is Mesh => o instanceof Mesh && (o.name === 'land' || o.name === 'tops'));
  return {
    group,
    water: wm && 'uniforms' in wm ? (wm as ShaderMaterial) : null,
    signs,
    signMesh,
    solids: [...land, solid],
    dispose: () => {
      signs.dispose();
      material.dispose();
    },
  };
}

/** Moves a part from local (front +z) to a spot. */
function at(g: BufferGeometry, s: Spot): BufferGeometry {
  return g.rotateY(s.yaw).translate(s.x, 0, s.z);
}

/** The terracotta walk ring the pads and displays stand on, edged in cream. */
function ring(into: BufferGeometry[], p: LookPalette): void {
  const flat = (inner: number, outer: number, colour: number, y: number) => facet(new RingGeometry(inner, outer, 72, 1).rotateX(-Math.PI / 2), colour, 0, y, 0);
  into.push(flat(11.2, 19.6, p.trimShade, 0.12), flat(11.5, 19.3, p.path[0]!, 0.15));
}

/** A cream balustrade round the floor: posts and a rail, solid. */
function wall(into: BufferGeometry[], p: LookPalette): void {
  const posts = 56;
  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2;
    const x = Math.sin(a) * HUB.wall;
    const z = Math.cos(a) * HUB.wall;
    into.push(prism(0.24, 0.3, WALL_H, 6, p.trim, x, 0, z));
    const b = ((i + 0.5) / posts) * Math.PI * 2;
    const len = (Math.PI * 2 * HUB.wall) / posts + 0.08;
    into.push(box(len, 0.18, 0.34, p.trimShade, 0, WALL_H - 0.2, 0).rotateY(b).translate(Math.sin(b) * HUB.wall, 0, Math.cos(b) * HUB.wall));
    into.push(box(len, 0.5, 0.16, p.trim, 0, 0.1, 0).rotateY(b).translate(Math.sin(b) * HUB.wall, 0, Math.cos(b) * HUB.wall));
  }
}

/** A warp pad: a cream drum with an accent top and a darker rim, the button the kid walks onto. */
function pad(into: BufferGeometry[], p: LookPalette, s: Spot, i: number): void {
  const t = padTheme(i);
  into.push(at(prism(HUB.padRadius, HUB.padRadius + 0.15, PAD_H, 24, p.trim), s));
  into.push(at(prism(HUB.padRadius - 0.2, HUB.padRadius - 0.2, 0.05, 24, t.shade, 0, PAD_H), s));
  into.push(at(prism(HUB.padRadius - 0.5, HUB.padRadius - 0.5, 0.05, 24, t.accent, 0, PAD_H + 0.04), s));
}

/** A portal arch: two columns and a half ring over the opening, in the pad's accent, on a stepped base. */
function arch(into: BufferGeometry[], p: LookPalette, s: Spot, i: number): void {
  const t = padTheme(i);
  into.push(at(box(ARCH.span * 2 + 1.4, 0.35, 1.4, p.trimShade), s));
  for (const side of [-1, 1]) {
    into.push(at(prism(0.38, 0.45, ARCH.column, 8, p.trim, side * ARCH.span, 0.35), s));
    into.push(at(prism(0.5, 0.5, 0.3, 8, t.accent, side * ARCH.span, 0.35 + ARCH.column - 0.25), s));
  }
  const top = facet(new TorusGeometry(ARCH.span, ARCH.tube, 8, 24, Math.PI), t.accent, 0, 0.35 + ARCH.column - 0.2, 0);
  into.push(at(top, s));
  into.push(at(facet(new TorusGeometry(ARCH.span - 0.34, 0.1, 6, 24, Math.PI), t.shade, 0, 0.35 + ARCH.column - 0.2, 0.05), s));
  // Back panel so the portal reads as a doorway from behind.
  into.push(at(box(ARCH.span * 2 - 0.2, ARCH.column - 0.2, 0.18, t.shade, 0, 0.35, -0.55), s));
}

/** The centre lift: a stepped teal platform with up arrows. */
function lift(into: BufferGeometry[], p: LookPalette): void {
  const { x, z, r } = HUB.lift;
  into.push(prism(r + 0.55, r + 0.7, 0.22, 32, p.trimShade, x, 0, z));
  into.push(prism(r + 0.2, r + 0.3, 0.36, 32, p.trim, x, 0, z));
  into.push(prism(r - 0.1, r - 0.1, 0.05, 32, 0x2fa39a, x, 0.36, z));
  for (const dz of [-0.75, 0.35]) {
    for (const side of [-1, 1]) into.push(box(0.16, 0.04, 0.7, 0xffffff, 0, 0.41, 0).rotateY(side * 0.75).translate(x + side * 0.24, 0, z + dz));
  }
}

/** Trees and rocks on the lawn outside the balustrade, seeded. */
function trees(into: BufferGeometry[], p: LookPalette): void {
  const random = seededRandom(1393);
  const count = 22;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + random() * 0.15;
    const d = HUB.wall + 1.1 + random() * 0.6;
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d;
    const h = 2.4 + random() * 1.4;
    into.push(prism(0.2, 0.26, h * 0.4, 6, p.woodDark, x, 0, z));
    into.push(cone(1.1 + random() * 0.4, h, 7, p.leaves[Math.floor(random() * p.leaves.length)]!, x, h * 0.3, z, random()));
    if (random() < 0.4) into.push(rock(0.45, p.rock, Math.sin(a + 0.13) * (d + 0.3), 0, Math.cos(a + 0.13) * (d + 0.3)));
  }
}

/** A sign quad w x h facing the spot's front, centred `y` up and `forward` along its front, mapped to `rect`; `tilt` leans it back. */
function quad(w: number, h: number, y: number, forward: number, rect: readonly [number, number, number, number], s: Spot, tilt = 0): BufferGeometry {
  const [u0, v0, u1, v1] = rect;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([-w / 2, -h / 2, 0, w / 2, -h / 2, 0, w / 2, h / 2, 0, -w / 2, h / 2, 0]), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array([u0, v0, u1, v0, u1, v1, u0, v1]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.rotateX(tilt).translate(0, y, forward);
  return at(g.toNonIndexed(), s);
}

/** One mesh of many parts, each reduced to position, normal and colour. */
function merged(name: string, parts: readonly BufferGeometry[], material: Material): Mesh {
  const clean = parts.map((g) => {
    const flat = g.index ? g.toNonIndexed() : g;
    for (const key of Object.keys(flat.attributes)) if (key !== 'position' && key !== 'normal' && key !== 'color') flat.deleteAttribute(key);
    if (!flat.getAttribute('normal')) flat.computeVertexNormals();
    return flat;
  });
  const mesh = new Mesh(mergeGeometries(clean, false)!, material);
  for (const g of clean) g.dispose();
  mesh.name = name;
  mesh.receiveShadow = true;
  return mesh;
}
