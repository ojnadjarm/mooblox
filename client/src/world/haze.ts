import { ShaderChunk, ShaderLib, UniformsLib, type Fog } from 'three';

/**
 * The haze centre (world x, z) every fogged program reads. A plain object, not a Vector3: three clones its own math types
 * when it copies uniforms, but shares anything else by reference, so one write here reaches every material.
 */
const CENTRE = { x: 0, y: 0, z: 0 };
let installed = false;

/**
 * Turns three's camera-depth fog into a world-space haze bubble: fog grows with the horizontal distance from one moving
 * centre (per pixel, so huge triangles like the water stay right), `fog.near` and `fog.far` are distances from it.
 * Call before the first material compiles; idempotent.
 */
export function installHaze(): void {
  if (installed) return;
  installed = true;
  (UniformsLib.fog as Record<string, { value: unknown }>)['hazeCentre'] = { value: CENTRE };
  for (const shader of Object.values(ShaderLib)) {
    const u = shader.uniforms as Record<string, { value: unknown }>;
    if ('fogNear' in u) u['hazeCentre'] = { value: CENTRE };
  }
  ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\n\tvarying float vFogDepth;\n\tvarying vec2 vHazeXZ;\n#endif\n';
  // World x/z from view space: the view matrix is rigid, so its inverse rotation is the transpose.
  ShaderChunk.fog_vertex = '#ifdef USE_FOG\n\tvFogDepth = - mvPosition.z;\n\tvHazeXZ = (cameraPosition + mvPosition.xyz * mat3( viewMatrix )).xz;\n#endif\n';
  ShaderChunk.fog_pars_fragment =
    '#ifdef USE_FOG\n\tuniform vec3 fogColor;\n\tuniform vec3 hazeCentre;\n\tvarying float vFogDepth;\n\tvarying vec2 vHazeXZ;\n\tuniform float fogNear;\n\tuniform float fogFar;\n\tuniform float fogDensity;\n#endif\n';
  ShaderChunk.fog_fragment =
    '#ifdef USE_FOG\n\tfloat fogFactor = smoothstep( fogNear, fogFar, length( vHazeXZ - hazeCentre.xz ) );\n\tgl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );\n#endif\n';
}

/** Clear and fully hazed distances past the bubble's edge, metres. */
export interface HazeBand {
  readonly near: number;
  readonly far: number;
}

/** Seconds for the bubble to cover most of the way to a new target (time constant). */
const GLIDE = 0.45;

/** The bubble: centre and radius ease towards their target, so islands come out of the mist instead of popping. */
export class Haze {
  x = 0;
  z = 0;
  radius = 0;
  private tx = 0;
  private tz = 0;
  private tr = 0;

  constructor(
    private readonly fog: Fog,
    public band: HazeBand,
  ) {}

  /** Where the bubble heads; `snap` jumps there (first frame, teleports, overview). */
  target(x: number, z: number, radius: number, snap = false): void {
    this.tx = x;
    this.tz = z;
    this.tr = radius;
    if (snap) {
      this.x = x;
      this.z = z;
      this.radius = radius;
    }
  }

  /** Eases one frame and writes the shared centre and the fog distances; returns true while still moving. */
  update(dt: number): boolean {
    const k = 1 - Math.exp(-dt / GLIDE);
    const dx = this.tx - this.x;
    const dz = this.tz - this.z;
    const dr = this.tr - this.radius;
    const moving = dx * dx + dz * dz + dr * dr > 0.0004;
    if (moving) {
      this.x += dx * k;
      this.z += dz * k;
      this.radius += dr * k;
    }
    CENTRE.x = this.x;
    CENTRE.z = this.z;
    this.fog.near = this.radius + this.band.near;
    this.fog.far = this.radius + this.band.far;
    return moving;
  }

  /** Edge distance of a circle from the bubble's centre past which it is fully hazed. */
  get hidden(): number {
    return this.radius + this.band.far;
  }
}
