import { segmentDistance } from './island-layout';
import type { Segment } from './dressing';

/** Segments bucketed in a uniform grid, so "is any segment within d of (x, z)?" skips the far ones. */
export class SegmentIndex {
  private readonly cells = new Map<number, Segment[]>();

  constructor(private readonly cell = 8) {}

  add(s: Segment): void {
    const c = this.cell;
    for (let i = Math.floor(Math.min(s.ax, s.bx) / c); i <= Math.floor(Math.max(s.ax, s.bx) / c); i++) {
      for (let j = Math.floor(Math.min(s.az, s.bz) / c); j <= Math.floor(Math.max(s.az, s.bz) / c); j++) {
        const key = cellKey(i, j);
        const list = this.cells.get(key);
        if (list) list.push(s);
        else this.cells.set(key, [s]);
      }
    }
  }

  /** Whether any added segment lies at distance <= d from (x, z). */
  within(x: number, z: number, d: number): boolean {
    const c = this.cell;
    for (let i = Math.floor((x - d) / c); i <= Math.floor((x + d) / c); i++) {
      for (let j = Math.floor((z - d) / c); j <= Math.floor((z + d) / c); j++) {
        for (const s of this.cells.get(cellKey(i, j)) ?? []) {
          if (segmentDistance(x, z, s) <= d) return true;
        }
      }
    }
    return false;
  }
}

const cellKey = (i: number, j: number): number => (i + 4096) * 8192 + (j + 4096);
