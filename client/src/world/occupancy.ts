/** Read-only view of taken ground. */
export interface GroundQuery {
  hits(x: number, z: number, r: number): boolean;
}

/** Ground circles already taken, bucketed in a uniform grid so placement checks stay cheap on large courses. */
export class Occupancy implements GroundQuery {
  private readonly cells = new Map<string, { x: number; z: number; r: number }[]>();

  constructor(private readonly cell = 4) {}

  /** Whether a circle at (x, z) of radius r overlaps anything taken. */
  hits(x: number, z: number, r: number): boolean {
    for (const key of this.keys(x, z, r)) {
      for (const o of this.cells.get(key) ?? []) {
        if (Math.hypot(x - o.x, z - o.z) < o.r + r) return true;
      }
    }
    return false;
  }

  add(x: number, z: number, r: number): void {
    const item = { x, z, r };
    for (const key of this.keys(x, z, r)) {
      const list = this.cells.get(key);
      if (list) list.push(item);
      else this.cells.set(key, [item]);
    }
  }

  private *keys(x: number, z: number, r: number): Generator<string> {
    const s = this.cell;
    for (let i = Math.floor((x - r) / s); i <= Math.floor((x + r) / s); i++) {
      for (let j = Math.floor((z - r) / s); j <= Math.floor((z + r) / s); j++) yield `${i},${j}`;
    }
  }
}
