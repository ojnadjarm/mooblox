import { Color, DirectionalLight, HemisphereLight, NeutralToneMapping, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { Avatar } from '../player/avatar';
import { AvatarKit } from '../player/avatar-kit';
import { DEFAULT_LOOK, randomLook, type CharacterLook } from '../player/character/look';
import { CAMPUS } from '../world/look';

/** Twelve hand-picked kids for the stills (row by row), blonde ones included. */
const SHOWCASE: Partial<CharacterLook>[] = [
  { skin: 's2', hair: 'long', hairc: 'blonde', eyec: 'blue', top: 'tee', topc: 'pink', bottom: 'skirt', bottomc: 'purple', mouth: 'grin' },
  { skin: 's8', hair: 'afro', hairc: 'black', eyec: 'brown', top: 'hoodie', topc: 'yellow', bottomc: 'denim', brows: 'bold' },
  { skin: 's4', hair: 'spiky', hairc: 'blue', eyes: 'sparkle', eyec: 'green', top: 'stripes', topc: 'navy', bottom: 'shorts', bottomc: 'grey' },
  { skin: 's6', hair: 'braids', hairc: 'auburn', eyec: 'hazel', glasses: 'round', glassesc: 'red', top: 'longsleeve', topc: 'teal' },
  { skin: 's1', hair: 'bob', hairc: 'platinum', eyes: 'tall', eyec: 'grey', top: 'tank', topc: 'green', bottom: 'shorts', bottomc: 'navy', shoes: 'sandals', shoesc: 'brown' },
  { skin: 's10', hair: 'buns', hairc: 'pink', eyes: 'happy', top: 'tee', topc: 'purple', bottom: 'skirt', bottomc: 'black', shoes: 'boots', shoesc: 'black' },
  { skin: 's3', hair: 'ponytail', hairc: 'red', eyec: 'green', brows: 'arched', top: 'hoodie', topc: 'orange', bottomc: 'black', mouth: 'open' },
  { skin: 's7', hair: 'curly', hairc: 'brown', eyec: 'amber', glasses: 'square', glassesc: 'black', top: 'tee', topc: 'blue', bottom: 'shorts', bottomc: 'brown' },
  { skin: 's5', hair: 'mohawk', hairc: 'green', eyes: 'wide', eyec: 'violet', top: 'longsleeve', topc: 'black', bottomc: 'grey', shoes: 'boots', shoesc: 'red' },
  { skin: 's2', hair: 'short', hairc: 'blonde', eyes: 'sleepy', eyec: 'blue', top: 'stripes', topc: 'red', bottomc: 'denim', brows: 'straight' },
  { skin: 's9', hair: 'buzz', hairc: 'black', eyec: 'brown', glasses: 'stars', glassesc: 'yellow', top: 'tee', topc: 'white', bottom: 'shorts', bottomc: 'teal' },
  { skin: 's4', hair: 'long', hairc: 'purple', eyes: 'sparkle', eyec: 'pink', top: 'tank', topc: 'yellow', bottom: 'skirt', bottomc: 'pink', mouth: 'grin' },
];

/** Standalone characters: `?n=12` (3x4 showcase, one cell each; `&turn=<rad>` yaw) or `?n=20&random=1` (a crowd); exposes draw calls per frame. */
async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const n = Number(params.get('n') ?? 12);
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = CAMPUS.exposure;
  document.body.appendChild(renderer.domElement);
  const scene = new Scene();
  scene.background = new Color(0xcdeeff);
  scene.add(new HemisphereLight(CAMPUS.hemi.sky, CAMPUS.hemi.ground, CAMPUS.hemi.intensity));
  const sun = new DirectionalLight(CAMPUS.sun.color, CAMPUS.sun.intensity);
  sun.position.set(...CAMPUS.sun.dir);
  scene.add(sun);
  const kit = await AvatarKit.load('/assets/');
  const showcase = !params.has('random');
  const cols = showcase ? 4 : 5;
  const rows = Math.ceil(n / cols);
  const avatars: Avatar[] = [];
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < n; i++) {
    const look = showcase ? { ...DEFAULT_LOOK, ...SHOWCASE[i % SHOWCASE.length] } : randomLook(random);
    const avatar = await kit.create(look as CharacterLook);
    if (showcase) {
      avatar.root.rotation.y = Number(params.get('turn') ?? -0.35);
    } else {
      avatar.root.position.set((i % cols - (cols - 1) / 2) * 2.2, 0, (Math.floor(i / cols) - (rows - 1) / 2) * 3);
      avatar.root.rotation.y = random() - 0.5;
    }
    scene.add(avatar.root);
    avatars.push(avatar);
  }
  const camera = new PerspectiveCamera(30, 1, 0.5, 200);
  const probe = { ready: false, calls: 0, triangles: 0, frames: 0 };
  Object.assign(window, { grid: probe });
  renderer.autoClear = false;
  let last = performance.now();
  const frame = (t: number) => {
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    for (const a of avatars) a.update(dt);
    renderer.info.autoReset = false;
    renderer.info.reset();
    renderer.setScissorTest(false);
    renderer.clear();
    if (showcase) {
      const w = innerWidth / cols;
      const h = innerHeight / rows;
      camera.aspect = w / h;
      camera.position.set(0, 2.0, 7.2);
      camera.lookAt(0, 1.45, 0);
      camera.updateProjectionMatrix();
      renderer.setScissorTest(true);
      avatars.forEach((a, i) => {
        const x = (i % cols) * w;
        const y = innerHeight - (Math.floor(i / cols) + 1) * h;
        renderer.setViewport(x, y, w, h);
        renderer.setScissor(x, y, w, h);
        avatars.forEach((b) => (b.root.visible = b === a));
        renderer.render(scene, camera);
      });
    } else {
      camera.aspect = innerWidth / innerHeight;
      camera.position.set(0, rows * 3.2, rows * 4.6 + 6);
      camera.lookAt(0, 1.0, 0);
      camera.updateProjectionMatrix();
      renderer.setViewport(0, 0, innerWidth, innerHeight);
      renderer.render(scene, camera);
    }
    probe.calls = renderer.info.render.calls;
    probe.triangles = renderer.info.render.triangles;
    probe.frames++;
    probe.ready = true;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void main();
