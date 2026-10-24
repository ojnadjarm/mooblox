import type { Material } from 'three';

/** Islands fading in at once, at most (the current one and the one across the bridge, plus slack). */
export const FADE_SLOTS = 8;

/**
 * The live islands as (x, z, radius, alpha) per slot, shared by reference with every faded program: inside a slot's
 * circle the real scenery shows `alpha` of its pixels (screen-door dither) and the far view the rest, so an island swaps
 * from its fake to its real build without a pop. Radius 0 = empty slot.
 */
export const FADE = { value: new Float32Array(FADE_SLOTS * 4) };

/** Writes the live islands' fade circles; the rest of the slots are cleared. */
export function setFades(circles: readonly { x: number; z: number; radius: number; alpha: number }[]): void {
  const v = FADE.value;
  v.fill(0);
  const n = Math.min(FADE_SLOTS, circles.length);
  for (let i = 0; i < n; i++) {
    const c = circles[i]!;
    v[i * 4] = c.x;
    v[i * 4 + 1] = c.z;
    v[i * 4 + 2] = c.radius;
    v[i * 4 + 3] = c.alpha;
  }
}

/**
 * Adds the island fade to a lit material (it needs the scene fog: the haze varying gives the world x, z). `fake` inverts
 * it: the far view hides where a real island is drawn.
 */
export function withFade(m: Material, fake: boolean): void {
  const before = m.onBeforeCompile.bind(m);
  const key = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    shader.uniforms['uFade'] = FADE;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec4 uFade[${FADE_SLOTS}];`)
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
#ifdef USE_FOG
{
  float fadeA = ${fake ? '0.0' : '1.0'};
  for (int i = 0; i < ${FADE_SLOTS}; i++) {
    vec4 f = uFade[i];
    if (f.z > 0.0 && length(vHazeXZ - f.xy) < f.z) fadeA = f.w;
  }
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (ign >= ${fake ? '1.0 - fadeA' : 'fadeA'}) discard;
}
#endif`,
      );
  };
  m.customProgramCacheKey = () => `${key()}-fade${fake ? '-fake' : ''}`;
}
