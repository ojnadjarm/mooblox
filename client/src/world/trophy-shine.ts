import type { Material } from 'three';

/**
 * Polished metal on the vertices with `shine` 1 (Lambert or Standard, no new texture or draw): a sky-over-floor reflection
 * by the reflected view ray, a hot sun highlight and a glint band sweeping over each trophy every few seconds.
 */
export function withShine(m: Material, time: { value: number }): Material {
  const before = m.onBeforeCompile.bind(m);
  m.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    shader.uniforms['uTime'] = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float shine;\nvarying float vShine;\nvarying vec3 vShineWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShine = shine;\nvShineWorld = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vShine;\nvarying vec3 vShineWorld;')
      .replace(
        '#include <opaque_fragment>',
        `if (vShine > 0.0) {
  vec3 eyeDir = normalize(vViewPosition);
  vec3 r = reflect(-eyeDir, normalize(normal));
  float up = dot(r, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
  vec3 env = mix(vec3(0.42, 0.34, 0.3), vec3(1.0, 0.97, 0.9), smoothstep(-0.25, 0.55, up));
  float hot = pow(max(dot(r, normalize((viewMatrix * vec4(0.45, 0.8, 0.4, 0.0)).xyz)), 0.0), 24.0);
  float rim = pow(1.0 - max(dot(eyeDir, normalize(normal)), 0.0), 3.0);
  float phase = vShineWorld.y * 2.6 + (vShineWorld.x + vShineWorld.z) * 0.9 - uTime * 1.6;
  float sweep = pow(max(sin(phase) , 0.0), 60.0) * step(0.0, sin(phase * 0.25));
  vec3 metal = diffuseColor.rgb * env * 1.15 + diffuseColor.rgb * rim * 0.5 + vec3(1.0, 0.95, 0.85) * (hot * 0.55 + sweep * 0.45);
  outgoingLight = mix(outgoingLight, metal, vShine * 0.6);
}
#include <opaque_fragment>`,
      );
  };
  return m;
}
