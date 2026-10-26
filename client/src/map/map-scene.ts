import { Group, Mesh, type BufferGeometry, type ShaderMaterial } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WorldData } from '../domain/types';
import { IslandBuilder } from '../world/island-builder';
import type { Circle, WorldLayout, Zone } from '../world/layout';
import { tieredFountain } from '../world/landmarks/fountain';
import { cone, prism, rock } from '../world/landmarks/shapes';
import { HUB_THEME, THEMES, type ThemeId } from '../world/landmarks/themes';
import type { Look, LookPalette } from '../world/look';
import type { MaterialKit } from '../world/material-kit';
import { seededRandom } from '../world/random';
import { trophyModel } from '../world/trophy-cup';
import type { MapCourse } from './courses';
import type { MapLayout } from './map-layout';

const THEME_ORDER: readonly ThemeId[] = ['library', 'science', 'sports', 'arts', 'harbour'];
/** Trophy scale on the island of a finished course, and its plinth. */
const TROPHY = { scale: 4, plinth: 0.9 } as const;
/** Landmarks stand a little larger than in a course world: the map sees them from far. */
const LANDMARK_SCALE = 1.25;

/** The built map: one group for the stage, the water to animate and the label anchor height above each island. */
export interface MapScene {
  readonly group: Group;
  readonly water: ShaderMaterial | null;
  readonly labelHeights: readonly number[];
}

/** Distance of an island's pad (the studded landing spot) from its centre, towards the camera side for home, towards home for courses. */
const PAD_AT = 3.6;

/** The map as a world layout: every island (home first) is a zone with one pad, no hubs and no bridges. */
export function asWorldLayout(map: MapLayout): WorldLayout {
  const zone = (c: Circle, i: number, facing: number): Zone => {
    const x = c.x + Math.sin(facing) * (c.radius - PAD_AT);
    const z = c.z + Math.cos(facing) * (c.radius - PAD_AT);
    return { ...c, sectionId: i, angle: facing, anchor: map.home, plots: [{ x, z, radius: 2, activityId: i, sectionId: i, facing }] };
  };
  const zones = [zone(map.home, 0, 0), ...map.islands.map((c, i) => zone(c, i + 1, facingHome(c)))];
  return { hub: map.home, hubs: [], links: [], spawn: { x: 0, z: 0 }, zones, extent: map.extent };
}

/** Yaw that turns a model's front (+z) from an island towards the home island. */
const facingHome = (c: Circle): number => Math.atan2(-c.x, -c.z);

const EMPTY_WORLD: WorldData = { courseId: 0, courseName: '', firstName: '', sections: [], nextChange: 0 };

/** Builds the sea, sky-lit islands (the course world's island look), a landmark per course, trees, and trophies on finished courses. */
export function buildMapScene(kit: MaterialKit, look: Look, map: MapLayout, courses: readonly MapCourse[], low: boolean, rimDetail: number): MapScene {
  const group = new IslandBuilder(kit, look, low, rimDetail).build(EMPTY_WORLD, asWorldLayout(map));
  group.name = 'map';
  const parts: BufferGeometry[] = [];
  const glow: BufferGeometry[] = [];
  const p = look.palette;
  const fountain = tieredFountain(p, HUB_THEME.accent);
  parts.push(...fountain.parts);
  const heights = map.islands.map((c, i) => {
    const course = courses[i];
    const theme = THEMES[THEME_ORDER[i % THEME_ORDER.length]!];
    const lm = theme.landmark(p, theme.accent, theme.accentShade);
    const yaw = facingHome(c);
    const place = (g: BufferGeometry, dx = 0, dz = 0) => g.scale(LANDMARK_SCALE, LANDMARK_SCALE, LANDMARK_SCALE).rotateY(yaw).translate(c.x + dx, 0, c.z + dz);
    const reach = lm.radius * LANDMARK_SCALE;
    const back = Math.max(0, Math.min(2.5, c.radius - reach - 1));
    const bx = -Math.sin(yaw) * back;
    const bz = -Math.cos(yaw) * back;
    for (const g of lm.parts) parts.push(place(g, bx, bz));
    for (const g of lm.glow) glow.push(place(g, bx, bz));
    const spot = (turn: number) => ({ x: c.x + Math.sin(yaw + turn) * (c.radius - PAD_AT), z: c.z + Math.cos(yaw + turn) * (c.radius - PAD_AT) });
    const pad = spot(0);
    const cup = spot(0.75);
    trees(parts, p, c, reach + back + 1.5, [pad, cup], (course?.id ?? i) * 7919 + i);
    if (course?.completed) {
      parts.push(prism(1.1, 1.3, TROPHY.plinth, 8, p.trim, cup.x, 0, cup.z));
      for (const g of trophyModel('gold').parts) parts.push(g.scale(TROPHY.scale, TROPHY.scale, TROPHY.scale).rotateY(yaw).translate(cup.x, TROPHY.plinth, cup.z));
    }
    return Math.min(lm.height * LANDMARK_SCALE, 18) + 3;
  });
  group.add(merged('map-dressing', parts, kit.plastic, true));
  if (glow.length) group.add(merged('map-glow', glow, kit.glow, false));
  const water = group.getObjectByName('water') as Mesh | undefined;
  const material = water?.material;
  return { group, water: material && 'uniforms' in material ? (material as ShaderMaterial) : null, labelHeights: heights };
}

/** A few faceted trees and rocks round an island's rim, outside the landmark's ground and clear of `keep` spots, seeded per course. */
function trees(into: BufferGeometry[], p: LookPalette, c: Circle, inner: number, keep: readonly { x: number; z: number }[], seed: number): void {
  const random = seededRandom(seed);
  const count = 7;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + random() * 0.6;
    const d = Math.max(inner, c.radius - 2.2 - random() * 2);
    const tx = c.x + Math.cos(a) * d;
    const tz = c.z + Math.sin(a) * d;
    const h = 2.2 + random() * 1.6;
    const leaf = p.leaves[Math.floor(random() * p.leaves.length)]!;
    const crown = 1.3 + random() * 0.5;
    const turn = random();
    const stone = random() < 0.5;
    if (d > c.radius - 1.4 || keep.some((k) => Math.hypot(k.x - tx, k.z - tz) < crown + 2.8)) continue;
    into.push(prism(0.22, 0.28, h * 0.4, 6, p.woodDark, tx, 0, tz));
    into.push(cone(crown, h, 7, leaf, tx, h * 0.3, tz, turn));
    const rx = c.x + Math.cos(a + 0.4) * (c.radius - 1.2);
    const rz = c.z + Math.sin(a + 0.4) * (c.radius - 1.2);
    if (stone && !keep.some((k) => Math.hypot(k.x - rx, k.z - rz) < 3)) into.push(rock(0.6, p.rock, rx, 0, rz));
  }
}

/** One mesh of many parts, each reduced to position, normal and colour. */
function merged(name: string, parts: readonly BufferGeometry[], material: Mesh['material'], cast: boolean): Mesh {
  const clean = parts.map((g) => {
    const flat = g.index ? g.toNonIndexed() : g;
    for (const key of Object.keys(flat.attributes)) if (key !== 'position' && key !== 'normal' && key !== 'color') flat.deleteAttribute(key);
    if (!flat.getAttribute('normal')) flat.computeVertexNormals();
    return flat;
  });
  const mesh = new Mesh(mergeGeometries(clean, false)!, material);
  for (const g of clean) g.dispose();
  mesh.name = name;
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}
