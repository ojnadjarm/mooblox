import { Color, HalfFloatType, Vector2, WebGLRenderTarget, type Camera, type ShaderMaterial, type Scene, type Texture, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
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
    const bloom = new GlowPass(new Vector2(1, 1), look.post.bloom, 0.5, 1.4);
    // One blur kernel on every mip: one shader program instead of five (lower mips still spread wider).
    const blur = bloom as unknown as { separableBlurMaterials: ShaderMaterial[]; _getSeparableBlurMaterial(radius: number): ShaderMaterial };
    blur.separableBlurMaterials.forEach((m, i) => {
      if (i === 0) return;
      m.dispose();
      blur.separableBlurMaterials[i] = blur._getSeparableBlurMaterial(6);
    });
    this.composer.addPass(bloom);
    this.composer.addPass(gradedOutput(look, bloom.glow));
  }

  setSize(w: number, h: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
  }

  render(): void {
    this.composer.render();
  }
}

type Uniforms = Record<string, { value: unknown }>;
const ALONG_X = new Vector2(1, 0);
const ALONG_Y = new Vector2(0, 1);

/** Unreal bloom without its full-resolution blend over the multisampled frame: the output pass adds `glow` instead. */
class GlowPass extends UnrealBloomPass {
  private readonly oldClear = new Color();

  /** The composited glow (half resolution), valid after this pass rendered. */
  get glow(): Texture {
    return this.renderTargetsHorizontal[0]!.texture;
  }

  override render(renderer: WebGLRenderer, _write: WebGLRenderTarget, read: WebGLRenderTarget): void {
    const quad = (this as unknown as { _fsQuad: FullScreenQuad })._fsQuad;
    renderer.getClearColor(this.oldClear);
    const oldAlpha = renderer.getClearAlpha();
    const oldAuto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setClearColor(this.clearColor, 0);
    const draw = (material: ShaderMaterial, target: WebGLRenderTarget): void => {
      quad.material = material;
      renderer.setRenderTarget(target);
      renderer.clear();
      quad.render(renderer);
    };
    const high = this.highPassUniforms as Uniforms;
    high['tDiffuse']!.value = read.texture;
    high['luminosityThreshold']!.value = this.threshold;
    draw(this.materialHighPassFilter, this.renderTargetBright);
    let input = this.renderTargetBright;
    for (let i = 0; i < this.nMips; i++) {
      const blur = this.separableBlurMaterials[i]!;
      const across = this.renderTargetsHorizontal[i]!;
      blur.uniforms['colorTexture']!.value = input.texture;
      blur.uniforms['direction']!.value = ALONG_X;
      draw(blur, across);
      blur.uniforms['colorTexture']!.value = across.texture;
      blur.uniforms['direction']!.value = ALONG_Y;
      input = this.renderTargetsVertical[i]!;
      draw(blur, input);
    }
    const mix = this.compositeMaterial.uniforms;
    mix['bloomStrength']!.value = this.strength;
    mix['bloomRadius']!.value = this.radius;
    mix['bloomTintColors']!.value = this.bloomTintColors;
    draw(this.compositeMaterial, this.renderTargetsHorizontal[0]!);
    renderer.setClearColor(this.oldClear, oldAlpha);
    renderer.autoClear = oldAuto;
  }
}

/** The output pass (tone map + sRGB) with the bloom's glow added and the colour grade first. */
function gradedOutput(look: Look, glow: Texture): OutputPass {
  const output = new OutputPass();
  const u = output.uniforms as Uniforms;
  Object.assign(u, {
    tGlow: { value: glow },
    uSaturation: { value: look.post.saturation },
    uContrast: { value: look.post.contrast },
    uWarmth: { value: look.post.warmth },
    uVignette: { value: look.post.vignette },
  });
  const m = output.material as ShaderMaterial;
  const read = 'gl_FragColor = texture2D( tDiffuse, vUv );';
  if (!m.fragmentShader.includes(read)) throw new Error('OutputShader changed: the grade has no place to go');
  m.fragmentShader = m.fragmentShader.replace('varying vec2 vUv;', `varying vec2 vUv;\nuniform sampler2D tGlow;\n${GRADE}`).replace(read, `${read}\n\tgl_FragColor.rgb = grade( gl_FragColor.rgb + texture2D( tGlow, vUv ).rgb, vUv );`);
  return output;
}
