import { BoxGeometry, CylinderGeometry, type BufferGeometry } from 'three';
import type { LookPalette } from './look';

/** Chimney spot per kit house in the model's own units: centre (x, z) on a roof slope, the roof height there and the stack top. */
const SPOTS: Readonly<Record<string, { readonly x: number; readonly z: number; readonly roof: number; readonly top: number }>> = {
  'suburb/building-type-a': { x: -0.4, z: 0.2, roof: 0.52, top: 0.84 },
  'suburb/building-type-c': { x: 0.45, z: 0.2, roof: 0.76, top: 1.02 },
  'suburb/building-type-e': { x: 0.35, z: 0.2, roof: 1.03, top: 1.3 },
  'suburb/building-type-h': { x: 0.4, z: 0.15, roof: 0.63, top: 0.9 },
  'suburb/building-type-k': { x: 0.25, z: 0.2, roof: 0.9, top: 1.2 },
  'suburb/building-type-t': { x: 0.4, z: 0.25, roof: 1.0, top: 1.3 },
};
/** Stack width (m) and how deep (m) it sinks into the roof so no gap shows on the slope. */
const WIDTH = 0.55;
const SINK = 0.5;

/** A chimney part: geometry centred on the stack axis, its colour and its height above the stack's foot. */
export interface ChimneyPart {
  readonly geometry: BufferGeometry;
  readonly color: number;
  readonly y: number;
}

/** A house's chimney in world space: where its stack stands, its parts, and where its smoke leaves. */
export interface Chimney {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly parts: readonly ChimneyPart[];
  readonly smoke: { readonly x: number; readonly y: number; readonly z: number };
}

/** True when the kit model has a chimney spot. */
export function hasChimney(id: string): boolean {
  return id in SPOTS;
}

/**
 * The chimney of house `id` scaled to `height` (m, model height `modelHeight` in its own units) at (x, z) turned by `yaw`:
 * a terracotta stack, a cream cap band and a dark flue pot (art bible palette, faceted).
 */
export function chimney(id: string, modelHeight: number, height: number, x: number, z: number, yaw: number, p: LookPalette): Chimney | null {
  const s = SPOTS[id];
  if (!s) return null;
  const k = height / modelHeight;
  const cx = x + (s.x * Math.cos(yaw) + s.z * Math.sin(yaw)) * k;
  const cz = z + (-s.x * Math.sin(yaw) + s.z * Math.cos(yaw)) * k;
  const foot = s.roof * k - SINK;
  const stack = s.top * k - foot;
  const parts: ChimneyPart[] = [
    { geometry: new BoxGeometry(WIDTH, stack, WIDTH), color: p.path[0] ?? 0xe0844f, y: stack / 2 },
    { geometry: new BoxGeometry(WIDTH + 0.14, 0.14, WIDTH + 0.14), color: p.trim, y: stack - 0.07 },
    { geometry: new CylinderGeometry(0.13, 0.15, 0.22, 8), color: 0x5b4a52, y: stack + 0.11 },
  ];
  return { x: cx, z: cz, y: foot, parts, smoke: { x: cx, y: foot + stack + 0.3, z: cz } };
}
