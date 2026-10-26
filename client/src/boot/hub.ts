import { Box3, Fog, Vector3 } from 'three';
import { AudioEngine, audioFormat } from '../audio/engine';
import { isJump, Footfall } from '../audio/cues';
import { Music } from '../audio/music';
import { encodeSound, parseSound, SOUND_PREFERENCE } from '../audio/settings';
import { MUSIC } from '../audio/sounds';
import { hubTotals, type CourseListGateway, type HubCourse } from '../hub/courses';
import { HubHud } from '../hub/hub-hud';
import { archSpots, floorCount, floorCourses, HUB, onLift, padOf, padSpots, portalAt, spawnSpot } from '../hub/hub-layout';
import { buildHubScene, CELL } from '../hub/hub-scene';
import type { SignEntry } from '../hub/hub-signs';
import { fill, hubStrings, progressText, type HubStrings } from '../hub/hub-strings';
import { Portals } from '../hub/portals';
import { Showcase } from '../hub/showcase';
import { Dwell, WARP_IN, WARP_OUT, warpIn, warpOut, withWarpFlag } from '../hub/warp';
import type { MoodleGateway } from '../moodle/gateway';
import { pixelRatio, QUALITY } from '../perf/quality';
import { Outfitter } from '../player/attachments';
import { AvatarKit } from '../player/avatar-kit';
import { BvhCollider } from '../player/collider';
import { Dust } from '../player/dust';
import { FollowCamera } from '../player/follow-camera';
import { GuidedWalk } from '../player/guided-walk';
import { CombinedInput, GatedInput, KeyboardInput } from '../player/input';
import { decodeLook } from '../player/look';
import { MouseLook } from '../player/mouse-look';
import { Player } from '../player/player';
import { CompositeCollider } from '../player/composite-collider';
import { eKey } from '../ui/e-key';
import { LookTip, DEFAULT_LOOK_TIP_STRINGS } from '../ui/look-tip';
import { ActivityPrompt } from '../ui/prompt';
import { DEFAULT_SOUND_STRINGS, SoundControl } from '../ui/sound-control';
import { TouchControls } from '../ui/touch-controls';
import { CAMPUS } from '../world/look';
import { MaterialKit } from '../world/material-kit';
import { Stage } from '../world/stage';
import { bootTier } from './app';

/** What the hub needs from its host page. */
export interface HubDeps {
  readonly gateway: CourseListGateway & Pick<MoodleGateway, 'savePreference'>;
  readonly strings: Readonly<Record<string, string>>;
  /** Base URL of the shipped assets (models, sounds). */
  readonly assets: string;
  /** The stored `local_mooblox_avatar` and `local_mooblox_sound` preferences. */
  readonly avatar: string;
  readonly sound: string;
  /** The course the kid came back from (0 = none): they arrive in front of its pad. */
  readonly from: number;
  /** Opens a course world (play.php). */
  readonly navigate: (url: string) => void;
}

/** The running hub, exposed on `window.mooblox` for the headless checks. */
export interface HubView {
  readonly stage: Stage;
  /** Courses in pad order (last visited first). */
  readonly courses: readonly HubCourse[];
  readonly floor: number;
  readonly floors: number;
  readonly player: Player;
  readonly engine: AudioEngine;
  readonly trophiesShown: number;
  readonly frames: number;
  /** Seconds into a warp out, -1 when none. */
  readonly warping: number;
  setFloor(floor: number): void;
  /** Walks the kid over the pad and through the portal of the course at `index` (switching floor first). */
  walkTo(index: number): void;
  /** The floor number painted in the lift's centre. */
  readonly liftNumber: string;
  /** Walks the kid onto the lift. */
  walkToLift(): void;
}

const SAVE_DELAY_MS = 800;
const LIFT_FLASH = 0.5;
const SPAWN_Y = 1.5;
const FOG = { near: 48, far: 190 } as const;

/** Builds the hub in `root`: a warp room the kid walks around, a portal per course, the trophy hall and their totals. */
export async function startHub(root: HTMLElement, deps: HubDeps): Promise<HubView> {
  Object.assign(root.style, { position: 'fixed', inset: '0', overflow: 'hidden', touchAction: 'none' });
  root.classList.add('mooblox-hub-root');
  const s = hubStrings(deps.strings);
  const tier = bootTier();
  const settings = QUALITY[tier];
  const kit = new MaterialKit(settings.materials);
  const stage = new Stage(root, kit, { antialias: settings.antialias, shadowMapSize: settings.shadowMapSize, post: settings.post, ao: settings.ao }, CAMPUS);
  stage.renderer.shadowMap.enabled = settings.shadows;
  const fog = stage.scene.fog;
  if (fog instanceof Fog) Object.assign(fog, FOG);
  const [courses, avatars] = await Promise.all([deps.gateway.getCourses(), AvatarKit.load(deps.assets)]);
  const floors = floorCount(courses.length);

  const scene = buildHubScene(kit, CAMPUS, tier === 'low', tier === 'low' ? 1.5 : 2.5);
  stage.add(scene.group);
  const portals = new Portals(kit.plastic, kit.time);
  stage.add(portals.group);
  const showcase = new Showcase(kit, hubTotals(courses), () => undefined, settings.shadows);
  stage.add(showcase.group);
  stage.focusShadow(0, 0, HUB.radius + 2);
  for (const m of [...scene.solids, showcase.hall]) m.updateMatrixWorld(true);
  const collider = new CompositeCollider();
  collider.addStatic({ collider: BvhCollider.fromMeshes([...scene.solids, showcase.hall]), bounds: new Box3().setFromObject(scene.group).union(new Box3().setFromObject(showcase.hall)) });

  const back = courses.findIndex((c) => c.id === deps.from);
  let floor = back >= 0 ? padOf(back).floor : 0;
  let liftNumber = '';
  const hud = new HubHud(root, s, courses, (step) => setFloor((floor + step + floors) % floors, true));
  const paint = (): void => {
    const here = floorCourses(courses, floor);
    portals.show(padSpots().map((_, i) => ({ open: !!here[i], completed: here[i]?.completed ?? false })));
    liftNumber = String(floor + 1);
    scene.signs.paint(signs(s, here, courses, liftNumber));
    hud.setFloor(floor, floors);
  };

  // Player: the course world's kid, controls, mouse-look and camera.
  const look = decodeLook(deps.avatar, avatars.bodies.map((b) => b.id));
  const avatar = await new Outfitter(avatars).create(look);
  stage.add(avatar.root);
  const camera = new FollowCamera(stage.camera, stage.renderer.domElement, collider);
  const coarse = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const touch = new TouchControls(stage.canvasHost, coarse || new URLSearchParams(location.search).has('touch'));
  const start = spawnSpot(back >= 0 ? padOf(back).pad : null);
  const spawn = new Vector3(start.x, SPAWN_Y, start.z);
  let at: { x: number; z: number } = spawn;
  const guided = new GuidedWalk(new CombinedInput([new KeyboardInput(), touch]), () => at, camera);
  const gated = new GatedInput(guided);
  const player = new Player(avatar, collider, spawn, gated, camera);
  at = player.body.position;
  player.teleport(start.x, start.z, start.yaw);
  if (window.matchMedia('(any-pointer: fine)').matches) {
    const mouse = new MouseLook(stage.renderer.domElement, camera);
    camera.mouseDrags = false;
    const tip = new LookTip(stage.canvasHost, { ...DEFAULT_LOOK_TIP_STRINGS, ...deps.strings });
    mouse.onChange((mode) => {
      camera.manual = mode === 'locked';
      tip.show(mode);
    });
  }
  const dust = tier === 'low' ? null : new Dust();
  if (dust) {
    stage.add(dust.mesh);
    player.onFeet = (x, y, z, n, strength) => dust.kick(x, y, z, n, strength);
  }

  // Sound: the hub lullaby, steps, jumps, the warp whoosh; the same mute and volume as the worlds.
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
  const feet = player.onFeet;
  player.onFeet = (x, y, z, n, strength) => {
    feet?.(x, y, z, n, strength);
    if (isJump(n)) engine.play('jump');
    else if (n === 2) engine.play('bump', 0.5 + strength);
  };
  const footfall = new Footfall();

  // Portals, lift and warps.
  const crossings = archSpots().map(() => new Dwell(0));
  let warp: { course: HubCourse; t: number; x: number; z: number } | null = null;
  let arrival = back >= 0 ? 0 : -1;
  let ride = -1;
  let rideTo = 0;
  const setFloor = (next: number, animated = false): void => {
    if (next === floor || next < 0 || next >= floors) return;
    if (animated) {
      ride = 0;
      rideTo = next;
      engine.play('lift');
      return;
    }
    floor = next;
    paint();
    hud.say(fill(s.hub_floor, { floor: floor + 1, floors }));
  };
  const warpTo = (pad: number, x: number, z: number): void => {
    const course = floorCourses(courses, floor)[pad];
    if (!course || warp) return;
    warp = { course, t: 0, x, z };
    lift.show(null);
    gated.frozen = true;
    guided.cancel();
    hud.hint.hidden = true;
    hud.say(fill(s.hub_warping, { name: course.fullname }));
    root.dataset['warping'] = String(course.id);
    engine.play('warp');
  };

  const nextFloor = (): number => (floor + 1) % floors;
  const lift = new ActivityPrompt(root, () => ride < 0 && !warp && setFloor(nextFloor(), true), s.hub_lift_go);
  lift.element.classList.add('mooblox-hub-lift');
  let liftReady = false;
  eKey().add({
    distance: () => (liftReady && ride < 0 && !warp ? Math.hypot(player.body.position.x - HUB.lift.x, player.body.position.z - HUB.lift.z) : null),
    run: () => setFloor(nextFloor(), true),
  });

  const resize = (): void => {
    stage.resize(pixelRatio(tier, window.devicePixelRatio, 1));
  };
  window.addEventListener('resize', resize);
  resize();
  paint();
  window.setTimeout(() => (hud.hint.hidden = true), 12000);

  let last = performance.now();
  let clock = 0;
  let frames = 0;
  const frame = (now: number): void => {
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = now;
    clock += dt;
    kit.time.value = clock;
    if (scene.water) scene.water.uniforms['uTime']!.value = clock;
    showcase.update(clock);
    if (warp) {
      warp.t += dt;
      const pose = warpOut(warp.t);
      portals.setBeam(warp.x, warp.z, pose.beam, pose.width);
      const root3 = player.avatar.root;
      root3.position.set(warp.x, player.body.position.y + pose.lift, warp.z);
      root3.rotation.y += dt * pose.spin;
      root3.scale.setScalar(pose.shrink);
      hud.flash(pose.flash);
      camera.follow(root3.position, dt);
      if (warp.t >= WARP_OUT && !root.dataset['navigated']) {
        const url = withWarpFlag(warp.course.url);
        root.dataset['navigated'] = url;
        deps.navigate(url);
      }
    } else {
      player.update(dt);
      dust?.update(dt);
      const b = player.body.position;
      const step = footfall.update(b.x, b.z, player.body.onGround, dt);
      if (step === 'step') engine.play('step-stone');
      else if (step === 'land') engine.play('land');
      const portal = portalAt(b.x, b.y, b.z);
      crossings.forEach((d, i) => {
        if (d.step(portal === i, true, dt)) warpTo(i, b.x, b.z);
      });
      const ready = floors > 1 && ride < 0 && !warp && onLift(b.x, b.z);
      if (ready !== liftReady) {
        liftReady = ready;
        lift.show(ready ? { name: fill(s.hub_lift, { floor: nextFloor() + 1 }), locked: null, openable: true } : null);
      }
      if (arrival >= 0) {
        arrival += dt;
        const pose = warpIn(arrival);
        portals.setBeam(b.x, b.z, pose.beam, pose.width);
        hud.flash(pose.flash);
        if (arrival >= WARP_IN) {
          arrival = -1;
          portals.setBeam(0, 0, 0, 0);
          hud.flash(0);
        }
      }
      if (ride >= 0) {
        ride += dt;
        const half = LIFT_FLASH / 2;
        gated.frozen = true;
        hud.flash(Math.min(1, ride < half ? ride / half : 2 - ride / half) * 0.85);
        if (ride >= half && floor !== rideTo) setFloor(rideTo);
        if (ride >= LIFT_FLASH) {
          ride = -1;
          hud.flash(0);
          gated.frozen = false;
        }
      }
    }
    stage.render();
    frames++;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  requestAnimationFrame(() => requestAnimationFrame(() => (root.dataset['ready'] = '1')));
  if (arrival >= 0) engine.play('warp');

  const walkTo = (index: number): void => {
    const { floor: f, pad } = padOf(index);
    if (f !== floor) setFloor(f);
    const p = padSpots()[pad]!;
    const a = archSpots()[pad]!;
    guided.start([
      { x: p.x, z: p.z, r: 0.6 },
      { x: a.x + Math.sin(a.yaw) * 0.2, z: a.z + Math.cos(a.yaw) * 0.2, r: 0.3 },
    ]);
  };
  return {
    stage,
    courses,
    get floor() {
      return floor;
    },
    floors,
    player,
    engine,
    trophiesShown: showcase.shown,
    get frames() {
      return frames;
    },
    get warping() {
      return warp ? warp.t : -1;
    },
    get liftNumber() {
      return liftNumber;
    },
    setFloor: (f) => setFloor(f),
    walkTo,
    walkToLift: () => guided.start([{ x: HUB.lift.x, z: HUB.lift.z, r: 0.3 }]),
  };
}

/** Sign atlas entries for a floor: the pads, the four show-off plaques and the lift's floor number. */
function signs(s: HubStrings, here: readonly HubCourse[], all: readonly HubCourse[], floorNumber: string): SignEntry[] {
  const out: SignEntry[] = [];
  for (let i = 0; i < CELL.display; i++) {
    const c = here[i];
    out.push(
      c
        ? {
            kind: 'pad',
            name: c.fullname,
            status: progressText(s, c.progress, c.completed),
            progress: c.completed ? 1 : c.progress / 100,
            completed: c.completed,
            isNew: c.lastaccess > 0 ? '' : s.hub_new,
            gems: c.gemstotal > 0 ? `${c.gems}/${c.gemstotal}` : String(c.gems),
            trophies: c.trophies.length,
          }
        : { kind: 'blank' },
    );
  }
  const t = hubTotals(all);
  out.push(
    { kind: 'display', title: s.hub_gems, value: String(t.gems), sub: '' },
    { kind: 'display', title: s.hub_crystals, value: String(t.crystals), sub: '' },
    { kind: 'display', title: s.hub_stars, value: String(t.stars), sub: '' },
    { kind: 'display', title: fill(s.hub_level, { level: t.level }), value: fill(s.hub_xp, { xp: t.xp }), sub: `${s.hub_trophies}: ${t.trophies.length}` },
    { kind: 'number', value: floorNumber },
  );
  return out;
}
