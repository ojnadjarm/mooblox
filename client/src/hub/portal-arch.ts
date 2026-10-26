import { TorusGeometry, type BufferGeometry } from 'three';
import { box, facet, prism } from '../world/landmarks/shapes';

/** Arch frame sizes: half span between the column axes, column height, arch tube radius. */
export const ARCH = { span: 2.05, column: 3.3, tube: 0.3 } as const;
const BASE = 0.35;

/** The opening the portal fluid fills (local, front +z): half width, bottom, spring height of the round top, plane depth. */
export const OPENING = { half: 1.7, bottom: BASE + 0.01, spring: BASE + ARCH.column - 0.2, z: 0 } as const;

/** Centre height of the opening (where the vortex turns). */
export const OPENING_CENTRE = (OPENING.bottom + OPENING.spring + OPENING.half) / 2;

/** The frame's colours: cream column stone, its shade, the accent and its shade. */
export interface ArchColours {
  readonly trim: number;
  readonly trimShade: number;
  readonly accent: number;
  readonly shade: number;
}

/** A portal arch in local space (front +z): stepped base, two columns with capitals, a half ring over the opening, open from behind. */
export function archParts(c: ArchColours): BufferGeometry[] {
  const parts: BufferGeometry[] = [box(ARCH.span * 2 + 1.4, BASE, 1.4, c.trimShade)];
  for (const side of [-1, 1]) {
    parts.push(prism(0.38, 0.45, ARCH.column, 8, c.trim, side * ARCH.span, BASE));
    parts.push(prism(0.5, 0.5, 0.3, 8, c.accent, side * ARCH.span, BASE + ARCH.column - 0.25));
  }
  parts.push(facet(new TorusGeometry(ARCH.span, ARCH.tube, 8, 24, Math.PI), c.accent, 0, OPENING.spring, 0));
  parts.push(facet(new TorusGeometry(ARCH.span - 0.34, 0.1, 6, 24, Math.PI), c.shade, 0, OPENING.spring, 0.05));
  return parts;
}

/** Capsule radius of the kid: their front touches the fluid when their centre is this far in front of it. */
const REACH = 0.55;

/** Whether a body at local (x, y, z) of an arch has stepped into its fluid surface, from the front or from behind. */
export function inOpening(x: number, y: number, z: number): boolean {
  return Math.abs(x) < OPENING.half - 0.3 && Math.abs(z - OPENING.z) < REACH && y < OPENING.spring;
}

/** A world point (x, y, z) in the local frame of an arch standing at (ax, az) facing yaw. */
export function toArch(ax: number, az: number, yaw: number, x: number, y: number, z: number): { x: number; y: number; z: number } {
  const dx = x - ax;
  const dz = z - az;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: dx * c - dz * s, y, z: dx * s + dz * c };
}
