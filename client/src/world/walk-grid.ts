import { DECK_HALF, type Dressing } from './dressing';
import type { WorldLayout } from './layout';

const PLAYER = 0.5;
const CELL = 0.5;

/** Cells the player's centre can stand on (island discs and bridge decks minus solid footprints) and those reached from the spawn. */
export class WalkGrid {
  readonly grid: Uint8Array;
  readonly w: number;
  readonly h: number;
  private readonly minX: number;
  private readonly minZ: number;
  private seen: Uint8Array | null = null;

  constructor(layout: WorldLayout, dressing: Pick<Dressing, 'bridges' | 'obstacles'>, private readonly spawn = layout.spawn) {
    const islands = [...layout.hubs, ...layout.zones];
    this.minX = Math.min(...islands.map((c) => c.x - c.radius)) - 2;
    this.minZ = Math.min(...islands.map((c) => c.z - c.radius)) - 2;
    this.w = Math.ceil((Math.max(...islands.map((c) => c.x + c.radius)) + 2 - this.minX) / CELL);
    this.h = Math.ceil((Math.max(...islands.map((c) => c.z + c.radius)) + 2 - this.minZ) / CELL);
    this.grid = new Uint8Array(this.w * this.h);
    for (const c of islands) {
      const r = c.radius - PLAYER;
      this.paint(c.x - r, c.z - r, c.x + r, c.z + r, (x, z) => Math.hypot(x - c.x, z - c.z) <= r, 1);
    }
    for (const b of dressing.bridges) {
      const len = Math.hypot(b.bx - b.ax, b.bz - b.az);
      const [ux, uz] = [(b.bx - b.ax) / len, (b.bz - b.az) / len];
      const half = DECK_HALF - PLAYER;
      this.paint(Math.min(b.ax, b.bx) - 2, Math.min(b.az, b.bz) - 2, Math.max(b.ax, b.bx) + 2, Math.max(b.az, b.bz) + 2, (x, z) => {
        const t = (x - b.ax) * ux + (z - b.az) * uz;
        return t >= -1 && t <= len + 1 && Math.abs((x - b.ax) * uz - (z - b.az) * ux) <= half;
      }, 1);
    }
    for (const o of dressing.obstacles) {
      const r = o.r + PLAYER;
      this.paint(o.x - r, o.z - r, o.x + r, o.z + r, (x, z) => Math.hypot(x - o.x, z - o.z) < r, 0);
    }
  }

  /** Grid index of the cell nearest (x, z). */
  cell(x: number, z: number): number {
    return Math.round((z - this.minZ) / CELL) * this.w + Math.round((x - this.minX) / CELL);
  }

  /** Whether the player can walk from the spawn to (x, z). */
  reachable(x: number, z: number): boolean {
    const i = Math.round((x - this.minX) / CELL);
    const j = Math.round((z - this.minZ) / CELL);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return false;
    return this.reached()[j * this.w + i] === 1;
  }

  /** Cells reached from the spawn by a 4-way flood fill (computed once). */
  reached(): Uint8Array {
    if (this.seen) return this.seen;
    const { grid, w, h } = this;
    const seen = new Uint8Array(w * h);
    const start = this.cell(this.spawn.x, this.spawn.z);
    if (!grid[start]) return (this.seen = seen);
    const queue = new Int32Array(w * h);
    let [head, tail] = [0, 0];
    queue[tail++] = start;
    seen[start] = 1;
    while (head < tail) {
      const c = queue[head++]!;
      const x = c % w;
      for (const n of [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, c - w, c + w]) {
        if (n >= 0 && n < w * h && grid[n] && !seen[n]) {
          seen[n] = 1;
          queue[tail++] = n;
        }
      }
    }
    return (this.seen = seen);
  }

  private paint(x0: number, z0: number, x1: number, z1: number, test: (x: number, z: number) => boolean, value: number): void {
    const { w, h, minX, minZ } = this;
    for (let j = Math.max(0, Math.floor((z0 - minZ) / CELL)); j <= Math.min(h - 1, Math.ceil((z1 - minZ) / CELL)); j++) {
      for (let i = Math.max(0, Math.floor((x0 - minX) / CELL)); i <= Math.min(w - 1, Math.ceil((x1 - minX) / CELL)); i++) {
        if (test(minX + i * CELL, minZ + j * CELL)) this.grid[j * w + i] = value;
      }
    }
  }
}
