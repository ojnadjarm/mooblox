import { ShaderChunk, ShaderLib, UniformsLib, type Fog } from 'three';
import { SKY_GLSL, SKY_UNIFORMS } from './sky';

/**
 * The haze centre (world x, z) every fogged program reads. A plain object, not a Vector3: three clones its own math types
 * when it copies uniforms, but shares anything else by reference, so one write here reaches every material.
 */
const CENTRE = { x: 0, y: 0, z: 0 };
let installed = false;

/**
 * Turns three's camera-depth fog into a world-space haze bubble: fog grows with the horizontal distance from one moving
 * centre (per pixel, so huge triangles like the water stay right), `fog.near` and `fog.far` are distances from it. The haze
 * colour is the sky's background along the view ray (`skyColour`), so far things melt into the sky or the far sea behind
 * them instead of a flat wall. Call before the first material compiles; idempotent.
 */
export function installHaze(): void {
  if (installed) return;
  installed = true;
  const shared = { hazeCentre: { value: CENTRE }, ...SKY_UNIFORMS };
  Object.assign(UniformsLib.fog, shared);
  for (const shader of Object.values(ShaderLib)) {
    if ('fogNear' in shader.uniforms) Object.assign(shader.uniforms, shared);
  }
  // Haze colour per vertex (small triangles, cheap on weak GPUs); `HAZE_PER_PIXEL` (the water: huge triangles) per pixel.
  ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
\tvarying float vFogDepth;
\tvarying vec3 vHazeWorld;
\t#ifndef HAZE_PER_PIXEL
\tvarying vec3 vHazeSky;
\tuniform vec3 hazeCentre;
\tuniform float fogNear;
${SKY_GLSL}
\t#endif
#endif
`;
  // World position from view space: the view matrix is rigid, so its inverse rotation is the transpose.
  ShaderChunk.fog_vertex = `#ifdef USE_FOG
\tvFogDepth = - mvPosition.z;
\tvHazeWorld = cameraPosition + mvPosition.xyz * mat3( viewMatrix );
\t#ifndef HAZE_PER_PIXEL
\tvHazeSky = length( vHazeWorld.xz - hazeCentre.xz ) > fogNear - 30.0 ? pow( skyColour( normalize( vHazeWorld - cameraPosition ) ), vec3( 2.2 ) ) : vec3( 0.0 );
\t#endif
#endif
`;
  ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
\tuniform vec3 fogColor;
\tuniform vec3 hazeCentre;
\tvarying float vFogDepth;
\tvarying vec3 vHazeWorld;
\t#define vHazeXZ vHazeWorld.xz
\tuniform float fogNear;
\tuniform float fogFar;
\tuniform float fogDensity;
\t#ifdef HAZE_PER_PIXEL
${SKY_GLSL}
\t#else
\tvarying vec3 vHazeSky;
\t#endif
#endif
`;
  // The sky colour is sRGB: to linear, then into whatever space the fragment already wrote (screen sRGB or a linear target).
  ShaderChunk.fog_fragment = `#ifdef USE_FOG
\tfloat fogFactor = smoothstep( fogNear, fogFar, length( vHazeWorld.xz - hazeCentre.xz ) );
\tif ( fogFactor > 0.0 ) {
\t\t#ifdef HAZE_PER_PIXEL
\t\tvec3 hazeSky = pow( skyColour( normalize( vHazeWorld - cameraPosition ) ), vec3( 2.2 ) );
\t\t#else
\t\tvec3 hazeSky = vHazeSky;
\t\t#endif
\t\tgl_FragColor.rgb = mix( gl_FragColor.rgb, linearToOutputTexel( vec4( hazeSky, 1.0 ) ).rgb, fogFactor );
\t}
#endif
`;
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
