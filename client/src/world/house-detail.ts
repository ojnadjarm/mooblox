import { Vector3, type BufferGeometry } from 'three';
import { familyOf } from './kit-materials';
import { closedDoor, DOORWAY } from './house-door';
import { rebuild, TriSink, WallFrame } from './tri-sink';
import { windowRoom, type Pane } from './window-room';

/** One wall side of a kit house: the door parts and window panes found on it. */
interface Side {
  readonly frame: WallFrame;
  readonly door: number[];
  min: number;
  max: number;
}

/**
 * Kit houses (`suburb/building-*`) made homely: an open doorway (its door swung away, a hole through the house) gets a closed
 * painted door, and every rectangular blue pane becomes a cosy lit room (`window-room.ts`). Other models pass through unchanged.
 */
export function furnishHouse(id: string, geometry: BufferGeometry, materials: readonly string[]): { geometry: BufferGeometry; materials: readonly string[] } {
  if (!/building/.test(id)) return { geometry, materials };
  const pos = geometry.getAttribute('position');
  const col = geometry.getAttribute('color');
  const nor = geometry.getAttribute('normal');
  const tris = pos.count / 3;
  const centre = (t: number) => new Vector3().fromBufferAttribute(pos, t * 3).add(new Vector3().fromBufferAttribute(pos, t * 3 + 1)).add(new Vector3().fromBufferAttribute(pos, t * 3 + 2)).divideScalar(3);
  const axis = (t: number) => {
    const n = new Vector3().fromBufferAttribute(nor, t * 3);
    return Math.abs(n.x) > Math.abs(n.z) ? new Vector3(Math.sign(n.x), 0, 0) : new Vector3(0, 0, Math.sign(n.z));
  };
  const sides = new Map<string, Side>();
  const drop = new Set<number>();
  for (let t = 0; t < tris; t++) {
    if (!/door/.test(materials[t * 3]!)) continue;
    const c = centre(t);
    // A door sits on the front or back wall: its side is the sign of z.
    const key = c.z > 0 ? '+z' : '-z';
    let side = sides.get(key);
    if (!side) sides.set(key, (side = { frame: new WallFrame(new Vector3(0, 0, Math.sign(c.z)), 0), door: [], min: Infinity, max: -Infinity }));
    side.door.push(t);
    for (let v = 0; v < 3; v++) {
      const p = new Vector3().fromBufferAttribute(pos, t * 3 + v);
      const s = p.dot(side.frame.u);
      side.min = Math.min(side.min, s);
      side.max = Math.max(side.max, s);
    }
  }
  const sink = new TriSink();
  const doors: { frame: WallFrame; s: number }[] = [];
  for (const side of sides.values()) {
    // A closed door's parts span the whole doorway; an open one leaves only a narrow leaf.
    if (side.max - side.min > DOORWAY.width * 0.7) continue;
    let plane = -Infinity;
    for (const t of side.door) {
      for (let v = 0; v < 3; v++) plane = Math.max(plane, new Vector3().fromBufferAttribute(pos, t * 3 + v).dot(side.frame.n));
      drop.add(t);
    }
    const frame = new WallFrame(side.frame.n, plane);
    const s = (side.min + side.max) / 2;
    doors.push({ frame, s });
    // The open doorway's dark seams (arch, sill) would show through the new door's window and under it.
    for (let t = 0; t < tris; t++) {
      if (materials[t * 3] !== 'colormap-seam') continue;
      const c = centre(t);
      if (Math.abs(c.dot(frame.u) - s) < DOORWAY.width && c.y < DOORWAY.height + 0.02 && Math.abs(c.dot(frame.n) - plane) < 0.03) drop.add(t);
    }
    closedDoor(sink, frame, s, hash(`${id}:door:${plane.toFixed(3)}`));
  }
  const panes = new Map<number, number[]>();
  const parent = new Map<number, number>();
  const find = (a: number): number => (parent.get(a) === a ? a : find(parent.get(a)!));
  const owner = new Map<string, number>();
  for (let t = 0; t < tris; t++) {
    if (materials[t * 3] !== 'colormap' || familyOf(id, 'colormap', col.getX(t * 3), col.getY(t * 3), col.getZ(t * 3)) !== 'smooth') continue;
    parent.set(t, t);
    for (let v = 0; v < 3; v++) {
      const key = `${pos.getX(t * 3 + v).toFixed(3)},${pos.getY(t * 3 + v).toFixed(3)},${pos.getZ(t * 3 + v).toFixed(3)}`;
      const o = owner.get(key);
      if (o === undefined) owner.set(key, t);
      else parent.set(find(t), find(o));
    }
  }
  for (const t of parent.keys()) {
    const r = find(t);
    panes.set(r, [...(panes.get(r) ?? []), t]);
  }
  let index = 0;
  for (const group of panes.values()) {
    // Only flat rectangles (two triangles) on a wall; the triangular gable lights stay glass.
    if (group.length !== 2) continue;
    const n = axis(group[0]!);
    const frame0 = new WallFrame(n, 0);
    let [s0, s1, t0, t1, plane] = [Infinity, -Infinity, Infinity, -Infinity, 0];
    for (const t of group) {
      for (let v = 0; v < 3; v++) {
        const p = new Vector3().fromBufferAttribute(pos, t * 3 + v);
        const s = p.dot(frame0.u);
        [s0, s1, t0, t1, plane] = [Math.min(s0, s), Math.max(s1, s), Math.min(t0, p.y), Math.max(t1, p.y), p.dot(n)];
      }
      drop.add(t);
    }
    // Glass in a doorway being closed is covered by the new door.
    const inDoor = doors.some((d) => d.frame.n.equals(n) && Math.abs((s0 + s1) / 2 - d.s) < DOORWAY.width / 2 && t1 <= DOORWAY.height);
    if (inDoor) continue;
    const pane: Pane = { frame: new WallFrame(n, plane), s0, s1, t0, t1 };
    windowRoom(sink, pane, hash(`${id}:${index++}:${s0.toFixed(3)}:${t0.toFixed(3)}`));
  }
  if (!sink.triangles && !drop.size) return { geometry, materials };
  return rebuild(geometry, materials, (t) => !drop.has(t), sink);
}

/** FNV-1a string hash. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
