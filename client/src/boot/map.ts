import { Fog, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { AudioEngine, audioFormat } from '../audio/engine';
import { Music } from '../audio/music';
import { encodeSound, parseSound, SOUND_PREFERENCE } from '../audio/settings';
import { MUSIC } from '../audio/sounds';
import { CourseCard } from '../map/course-card';
import type { CourseListGateway, MapCourse } from '../map/courses';
import { IslandLabels } from '../map/island-labels';
import { MapCamera } from '../map/map-camera';
import { MapHud } from '../map/map-hud';
import { islandAt, mapLayout, neighbour } from '../map/map-layout';
import { buildMapScene } from '../map/map-scene';
import { mapStrings } from '../map/map-strings';
import type { MoodleGateway } from '../moodle/gateway';
import { pixelRatio, QUALITY } from '../perf/quality';
import { DEFAULT_SOUND_STRINGS, SoundControl } from '../ui/sound-control';
import { CAMPUS } from '../world/look';
import { MaterialKit } from '../world/material-kit';
import { Stage } from '../world/stage';
import { bootTier } from './app';

/** What the course map needs from its host page. */
export interface MapDeps {
  readonly gateway: CourseListGateway & Pick<MoodleGateway, 'savePreference'>;
  readonly strings: Readonly<Record<string, string>>;
  /** Base URL of the shipped assets (sounds). */
  readonly assets: string;
  /** The stored `local_mooblox_sound` preference. */
  readonly sound: string;
  /** Opens a course world (play.php). */
  readonly navigate: (url: string) => void;
}

/** The running map, exposed on `window.mooblox` for the headless checks. */
export interface MapView {
  readonly stage: Stage;
  readonly courses: readonly MapCourse[];
  readonly camera: MapCamera;
  readonly labels: IslandLabels;
  readonly card: CourseCard;
  readonly engine: AudioEngine;
  /** Screen point (CSS px) of each island's centre. */
  islandPoint(index: number): { x: number; y: number };
  select(index: number): void;
  enter(index: number): void;
  readonly selected: number;
  readonly frames: number;
}

/** Drag distance (px) past which a press pans instead of picking. */
const DRAG = 8;
const SAVE_DELAY_MS = 800;

/** Builds the course map in `root`: one island per course on the course world's sea, labels, a card, and the flight into a course. */
export async function startMap(root: HTMLElement, deps: MapDeps): Promise<MapView> {
  Object.assign(root.style, { position: 'fixed', inset: '0', overflow: 'hidden', touchAction: 'none' });
  root.classList.add('mooblox-map-root');
  const s = mapStrings(deps.strings);
  const tier = bootTier();
  const settings = QUALITY[tier];
  const kit = new MaterialKit(settings.materials);
  const stage = new Stage(root, kit, { antialias: settings.antialias, shadowMapSize: settings.shadowMapSize, post: settings.post, ao: settings.ao }, CAMPUS);
  stage.renderer.shadowMap.enabled = settings.shadows;
  const courses = await deps.gateway.getCourses();
  const layout = mapLayout(courses.length);
  const scene = buildMapScene(kit, CAMPUS, layout, courses, tier === 'low', tier === 'low' ? 1.5 : 2.5);
  stage.add(scene.group);
  stage.sky.overview({ x: 0, z: 0, extent: layout.extent });
  stage.focusShadow(0, 0, layout.extent + 6);
  const anchors = layout.islands.map((c, i) => ({ x: c.x, y: scene.labelHeights[i]!, z: c.z }));
  const camera = new MapCamera(stage.camera, layout.extent);

  let selected = -1;
  let frames = 0;
  let dirty = true;
  const hud = new MapHud(root, s, courses.length === 0);
  const select = (i: number): void => {
    if (i === selected || camera.flying || !courses[i]) return;
    selected = i;
    card.show(courses[i], i);
    hud.hint.hidden = true;
    dirty = true;
  };
  const clear = (): void => {
    if (camera.flying) return;
    selected = -1;
    card.hide();
    hud.hint.hidden = courses.length === 0;
    dirty = true;
  };
  const enter = (i: number): void => {
    const c = layout.islands[i];
    const course = courses[i];
    if (!c || !course || camera.flying) return;
    select(i);
    engine.play('open');
    root.dataset['entering'] = String(course.id);
    camera.flyTo(c.x, c.z, c.radius, () => deps.navigate(course.url));
  };
  const labels = new IslandLabels(root, courses, s, () => selected, { select, enter });
  const card = new CourseCard(root, s, enter, clear);

  let sound = parseSound(deps.sound);
  const mix = { on: sound.on, volume: sound.volume, video: false, panel: false, hidden: document.hidden };
  const engine = new AudioEngine(deps.assets, audioFormat(document.createElement('audio')), mix);
  const music = new Music(engine);
  const unlock = (): void => {
    if (!engine.unlock()) return;
    for (const type of ['pointerdown', 'keydown', 'touchend'] as const) window.removeEventListener(type, unlock, true);
    music.setPaused(!engine.audible);
    music.play(MUSIC.hub);
  };
  for (const type of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(type, unlock, true);
  const remix = (change: Partial<typeof mix>): void => {
    Object.assign(mix, change);
    engine.setMix(mix);
    music.setPaused(!engine.audible);
  };
  document.addEventListener('visibilitychange', () => remix({ hidden: document.hidden }));
  let saving = 0;
  new SoundControl(root, sound, { ...DEFAULT_SOUND_STRINGS, ...deps.strings }, (next) => {
    sound = next;
    remix({ on: next.on, volume: next.volume });
    window.clearTimeout(saving);
    saving = window.setTimeout(() => {
      deps.gateway.savePreference(SOUND_PREFERENCE, encodeSound(next)).catch((e: unknown) => console.warn('mooblox: saving the sound choice failed', e));
    }, SAVE_DELAY_MS);
  });
  root.addEventListener('click', (e) => e.target instanceof Element && e.target.closest('button') && engine.play('click'), true);

  const canvas = stage.renderer.domElement;
  const ray = new Raycaster();
  const ground = new Plane(new Vector3(0, 1, 0), 0);
  const hit = new Vector3();
  const ndc = new Vector2();
  const islandUnder = (cx: number, cy: number): number => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, stage.camera);
    return ray.ray.intersectPlane(ground, hit) ? islandAt(layout.islands, hit.x, hit.z) : -1;
  };
  const pointers = new Map<number, { x: number; y: number }>();
  let press: { x: number; y: number; type: string; moved: boolean } | null = null;
  let pinch = 0;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    press = pointers.size === 1 ? { x: e.clientX, y: e.clientY, type: e.pointerType, moved: false } : null;
    pinch = pointers.size === 2 ? spread(pointers) : 0;
  });
  canvas.addEventListener('pointermove', (e) => {
    const last = pointers.get(e.pointerId);
    if (!last) {
      if (e.pointerType === 'mouse') {
        const i = islandUnder(e.clientX, e.clientY);
        canvas.style.cursor = i >= 0 ? 'pointer' : 'grab';
        if (i >= 0) select(i);
      }
      return;
    }
    if (pointers.size === 2) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const now = spread(pointers);
      if (pinch > 0 && now > 0) camera.zoom(pinch / now);
      pinch = now;
      dirty = true;
      return;
    }
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG) press.moved = true;
    if (press?.moved) {
      camera.pan(e.clientX - last.x, e.clientY - last.y, canvas.clientHeight);
      dirty = true;
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  const release = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    const p = press;
    press = null;
    if (!p || p.moved || e.type === 'pointercancel') return;
    const i = islandUnder(e.clientX, e.clientY);
    if (i < 0) clear();
    else if (p.type === 'mouse' || selected === i) enter(i);
    else select(i);
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      camera.zoom(Math.exp(e.deltaY * 0.0015));
      dirty = true;
    },
    { passive: false },
  );
  const ARROWS: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    const arrow = ARROWS[e.key];
    if (arrow && courses.length) {
      e.preventDefault();
      const yaw = camera.current.yaw;
      const dx = arrow[0] * Math.cos(yaw) + arrow[1] * Math.sin(yaw);
      const dz = -arrow[0] * Math.sin(yaw) + arrow[1] * Math.cos(yaw);
      const next = selected < 0 ? 0 : neighbour(layout.islands, selected, dx, dz);
      labels.buttons[next]?.focus();
      select(next);
    } else if (e.key === 'Enter' && selected >= 0 && !(e.target instanceof HTMLButtonElement)) {
      enter(selected);
    } else if (e.key === 'Escape') {
      clear();
    }
  });

  const resize = (): void => {
    stage.resize(pixelRatio(tier, window.devicePixelRatio, 1));
    camera.frame(canvas.clientWidth, canvas.clientHeight);
    stage.camera.far = Math.max(900, camera.current.distance * 2 + layout.extent * 2);
    stage.camera.updateProjectionMatrix();
    labels.measure();
    const fog = stage.scene.fog;
    if (fog instanceof Fog) {
      fog.near = camera.current.distance * 0.9;
      fog.far = camera.current.distance * 2.6 + layout.extent;
    }
    dirty = true;
  };
  window.addEventListener('resize', resize);
  resize();

  let last = performance.now();
  let clock = 0;
  let lastPose = '';
  const frame = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    clock += dt;
    camera.update(dt);
    kit.time.value = clock;
    if (scene.water) scene.water.uniforms['uTime']!.value = clock;
    stage.render();
    frames++;
    const pose = JSON.stringify(camera.current);
    if (dirty || pose !== lastPose) {
      labels.place(stage.camera, anchors, canvas.clientWidth, canvas.clientHeight);
      lastPose = pose;
      dirty = false;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  requestAnimationFrame(() => requestAnimationFrame(() => (root.dataset['ready'] = '1')));

  const point = new Vector3();
  return {
    stage,
    courses,
    camera,
    labels,
    card,
    engine,
    islandPoint(i) {
      const c = layout.islands[i]!;
      point.set(c.x, 0, c.z).project(stage.camera);
      const r = canvas.getBoundingClientRect();
      return { x: r.left + (point.x * 0.5 + 0.5) * r.width, y: r.top + (-point.y * 0.5 + 0.5) * r.height };
    },
    select,
    enter,
    get selected() {
      return selected;
    },
    get frames() {
      return frames;
    },
  };
}

/** Distance between the first two active pointers. */
function spread(pointers: Map<number, { x: number; y: number }>): number {
  const [a, b] = [...pointers.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
}
