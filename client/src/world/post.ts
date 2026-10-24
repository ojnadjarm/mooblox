import { HalfFloatType, Vector2, WebGLRenderTarget, type Camera, type ShaderMaterial, type Scene, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { Look } from './look';

const GRADE = {
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: 1 },
    uContrast: { value: 1 },
    uWarmth: { value: 0 },
    uVignette: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation, uContrast, uWarmth, uVignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSaturation);
      c.rgb = (c.rgb - 0.18) * uContrast + 0.18;
      c.rgb *= vec3(1.0 + uWarmth, 1.0, 1.0 - uWarmth);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      gl_FragColor = vec4(max(c.rgb, 0.0), c.a);
    }`,
};

/** High-tier post chain: render (MSAA) → bloom on bright glows → colour grade → tone map + sRGB. */
export class PostChain {
  private readonly composer: EffectComposer;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: Camera, look: Look) {
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new Vector2(1, 1), look.post.bloom, 0.5, 1.4);
    // One blur kernel on every mip: one shader program instead of five (lower mips still spread wider).
    const blur = bloom as unknown as { separableBlurMaterials: ShaderMaterial[]; _getSeparableBlurMaterial(radius: number): ShaderMaterial };
    blur.separableBlurMaterials.forEach((m, i) => {
      if (i === 0) return;
      m.dispose();
      blur.separableBlurMaterials[i] = blur._getSeparableBlurMaterial(6);
    });
    this.composer.addPass(bloom);
    const grade = new ShaderPass(GRADE);
    grade.uniforms['uSaturation']!.value = look.post.saturation;
    grade.uniforms['uContrast']!.value = look.post.contrast;
    grade.uniforms['uWarmth']!.value = look.post.warmth;
    grade.uniforms['uVignette']!.value = look.post.vignette;
    this.composer.addPass(grade);
    this.composer.addPass(new OutputPass());
  }

  setSize(w: number, h: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
  }

  render(): void {
    this.composer.render();
  }
}
