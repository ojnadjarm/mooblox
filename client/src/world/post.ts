import { HalfFloatType, Vector2, WebGLRenderTarget, type Camera, type ShaderMaterial, type Scene, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { Look } from './look';

/** Colour grade on linear HDR, run inside the output pass before its tone map and sRGB encode (one full-screen pass, not two). */
const GRADE = /* glsl */ `
  uniform float uSaturation, uContrast, uWarmth, uVignette;
  vec3 grade(vec3 c, vec2 uv) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, uSaturation);
    c = (c - 0.18) * uContrast + 0.18;
    c *= vec3(1.0 + uWarmth, 1.0, 1.0 - uWarmth);
    vec2 d = uv - 0.5;
    c *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
    return max(c, 0.0);
  }
`;

/** High-tier post chain: render (MSAA) → GTAO (xhigh only) → bloom on bright glows → colour grade + tone map + sRGB. */
export class PostChain {
  private readonly composer: EffectComposer;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: Camera, look: Look, ao = false) {
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    if (ao) {
      const gtao = new GTAOPass(scene, camera, 1, 1);
      gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.6, thickness: 1.5, scale: 1, samples: 12 });
      gtao.blendIntensity = 0.75;
      this.composer.addPass(gtao);
    }
    const bloom = new UnrealBloomPass(new Vector2(1, 1), look.post.bloom, 0.5, 1.4);
    // One blur kernel on every mip: one shader program instead of five (lower mips still spread wider).
    const blur = bloom as unknown as { separableBlurMaterials: ShaderMaterial[]; _getSeparableBlurMaterial(radius: number): ShaderMaterial };
    blur.separableBlurMaterials.forEach((m, i) => {
      if (i === 0) return;
      m.dispose();
      blur.separableBlurMaterials[i] = blur._getSeparableBlurMaterial(6);
    });
    this.composer.addPass(bloom);
    this.composer.addPass(gradedOutput(look));
  }

  setSize(w: number, h: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
  }

  render(): void {
    this.composer.render();
  }
}

/** The output pass (tone map + sRGB) with the colour grade first. */
function gradedOutput(look: Look): OutputPass {
  const output = new OutputPass();
  const u = output.uniforms as Record<string, { value: unknown }>;
  Object.assign(u, {
    uSaturation: { value: look.post.saturation },
    uContrast: { value: look.post.contrast },
    uWarmth: { value: look.post.warmth },
    uVignette: { value: look.post.vignette },
  });
  const m = output.material as ShaderMaterial;
  const read = 'gl_FragColor = texture2D( tDiffuse, vUv );';
  if (!m.fragmentShader.includes(read)) throw new Error('OutputShader changed: the grade has no place to go');
  m.fragmentShader = m.fragmentShader.replace('varying vec2 vUv;', `varying vec2 vUv;\n${GRADE}`).replace(read, `${read}\n\tgl_FragColor.rgb = grade( gl_FragColor.rgb, vUv );`);
  return output;
}
