import { seededRandom } from './random';

/** One faceted lump of a cloud, offset from the cloud's centre (m). */
export interface CloudLump {
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
  readonly r: number;
}

/** One cloud of the sky layer, placed round the camera (x, z relative to it, y absolute). */
export interface CloudPuff {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly lumps: readonly CloudLump[];
}

/** Clouds in the ring the eye-level camera sees above the horizon, plus a few high ones overhead. */
export const CLOUD_RING = { count: 16, near: 230, far: 420, low: 26, high: 62 } as const;
export const CLOUD_HIGH = { count: 5, near: 120, far: 200, low: 70, high: 95 } as const;

/**
 * The cloud layer's design, pure and seeded: cumulus of 3-5 lumps (biggest in the middle, smaller shoulders), spread round
 * the full circle in jittered sectors so every view direction gets one or two, never a uniform row.
 */
export function cloudPuffs(seed: number): CloudPuff[] {
  const random = seededRandom(seed ^ 0x5c10d5);
  const out: CloudPuff[] = [];
  const ring = (band: typeof CLOUD_RING | typeof CLOUD_HIGH, scale: number) => {
    for (let i = 0; i < band.count; i++) {
      const a = ((i + 0.15 + random() * 0.7) / band.count) * Math.PI * 2;
      const d = band.near + random() * (band.far - band.near);
      const big = (12 + random() * 9) * scale;
      const n = 3 + Math.floor(random() * 3);
      const lumps: CloudLump[] = [{ dx: 0, dy: big * 0.25, dz: 0, r: big }];
      for (let k = 1; k < n; k++) {
        const side = k % 2 ? 1 : -1;
        const r = big * (0.5 + random() * 0.3);
        lumps.push({ dx: side * (big * 0.7 + r * 0.5 + random() * big * 0.4), dy: r * 0.15, dz: (random() - 0.5) * big * 0.6, r });
      }
      out.push({ x: Math.cos(a) * d, y: band.low + random() * (band.high - band.low), z: Math.sin(a) * d, yaw: a + Math.PI / 2 + (random() - 0.5) * 0.6, lumps });
    }
  };
  ring(CLOUD_RING, 1);
  ring(CLOUD_HIGH, 0.7);
  return out;
}
