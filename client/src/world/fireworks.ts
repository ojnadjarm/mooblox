import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, Points, PointsMaterial } from 'three';

/** Shell colours (art bible accents). */
const COLOURS = [0xf6c445, 0x2fa39a, 0xe0844f, 0xa774f0, 0x5ed8d2, 0xffffff];
const SHELLS = 6;
/** Seconds between shells, and how long a shell's sparks live. */
const GAP = 0.45;
const LIFE = 1.7;
const GRAVITY = 3.5;

/** A soft round spark (the points' sprite). */
function sparkTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, '#fff');
  g.addColorStop(0.35, 'rgba(255,255,255,.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new CanvasTexture(canvas);
}

/** A point in the sky a shell bursts at. */
export interface Burst {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** One show of firework shells as a single Points draw; sparks fly, fall and fade on the CPU. Removes itself when done. */
export class Fireworks {
  readonly points: Points;
  private readonly position: Float32Array;
  private readonly velocity: Float32Array;
  private readonly base: Float32Array;
  private readonly colour: Float32Array;
  private readonly shellOf: Uint8Array;
  private time = 0;

  constructor(count: number, bursts: readonly Burst[]) {
    this.position = new Float32Array(count * 3);
    this.velocity = new Float32Array(count * 3);
    this.base = new Float32Array(count * 3);
    this.colour = new Float32Array(count * 3);
    this.shellOf = new Uint8Array(count);
    const c = new Color();
    for (let i = 0; i < count; i++) {
      const shell = i % SHELLS;
      const b = bursts[shell % bursts.length]!;
      this.shellOf[i] = shell;
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const speed = 6 + Math.random() * 3;
      this.velocity.set([Math.cos(a) * s * speed, u * speed + 1, Math.sin(a) * s * speed], i * 3);
      this.position.set([b.x, b.y, b.z], i * 3);
      c.setHex(COLOURS[(shell + (Math.random() < 0.2 ? 1 : 0)) % COLOURS.length]!);
      this.base.set([c.r, c.g, c.b], i * 3);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.position, 3));
    g.setAttribute('color', new BufferAttribute(this.colour, 3));
    const material = new PointsMaterial({ size: 1.1, map: sparkTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending });
    material.customProgramCacheKey = () => 'mooblox-fireworks';
    this.points = new Points(g, material);
    this.points.name = 'fireworks';
    this.points.frustumCulled = false;
  }

  /** Seconds the whole show lasts. */
  static get duration(): number {
    return (SHELLS - 1) * GAP + LIFE;
  }

  /** Advances the sparks; false once the show is over (the caller removes and disposes it). */
  step(dt: number): boolean {
    this.time += dt;
    const n = this.shellOf.length;
    for (let i = 0; i < n; i++) {
      const t = this.time - this.shellOf[i]! * GAP;
      const k = i * 3;
      if (t <= 0 || t > LIFE) {
        this.colour[k] = this.colour[k + 1] = this.colour[k + 2] = 0;
        continue;
      }
      const drag = Math.exp(-1.6 * dt);
      this.velocity[k]! *= drag;
      this.velocity[k + 1] = this.velocity[k + 1]! * drag - GRAVITY * dt;
      this.velocity[k + 2]! *= drag;
      this.position[k] = this.position[k]! + this.velocity[k]! * dt;
      this.position[k + 1] = this.position[k + 1]! + this.velocity[k + 1]! * dt;
      this.position[k + 2] = this.position[k + 2]! + this.velocity[k + 2]! * dt;
      const fade = 1 - t / LIFE;
      const twinkle = fade * (0.75 + 0.25 * Math.sin(i * 12.9898 + t * 30));
      this.colour[k] = this.base[k]! * twinkle;
      this.colour[k + 1] = this.base[k + 1]! * twinkle;
      this.colour[k + 2] = this.base[k + 2]! * twinkle;
    }
    this.points.geometry.attributes['position']!.needsUpdate = true;
    this.points.geometry.attributes['color']!.needsUpdate = true;
    return this.time < Fireworks.duration;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    const material = this.points.material as PointsMaterial;
    material.map?.dispose();
    material.dispose();
  }
}
