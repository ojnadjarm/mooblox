import { doneIds, Footfall, isJump, newlyDone, rewardCue, type MixState } from '../audio/cues';
import { AudioEngine, audioFormat } from '../audio/engine';
import { Music } from '../audio/music';
import { encodeSound, parseSound, SOUND_PREFERENCE, type SoundSettings } from '../audio/settings';
import { musicFor } from '../audio/sounds';
import { surfaceAt, type Ground } from '../audio/surface';
import { FountainWater, type Fountain } from '../audio/water';
import type { MoodleGateway } from '../moodle/gateway';
import type { Player } from '../player/player';
import type { RewardsStore } from '../rewards/rewards-store';
import type { CourseStore } from '../state/course-store';
import { DEFAULT_SOUND_STRINGS, SoundControl } from '../ui/sound-control';
import type { WorldView } from './app';

/** What the sound wiring listens to. */
export interface SoundDeps {
  readonly assets: string;
  /** The stored `local_mooblox_sound` preference. */
  readonly stored: string;
  readonly gateway: Pick<MoodleGateway, 'savePreference'>;
  readonly strings: Readonly<Record<string, string>>;
  readonly store: CourseStore;
  readonly rewards: RewardsStore | null;
  /** The Guide's speech bubble, if there is a Guide. */
  readonly bubble: HTMLElement | null;
}

/** The running sound, exposed on `window.mooblox.sound` for the headless checks. */
export interface SoundRuntime {
  readonly engine: AudioEngine;
  readonly music: Music;
  readonly settings: SoundSettings;
}

/** Radii (m) of the paved spawn plaza and of the further plazas, a little past their trim. */
const SPAWN_PLAZA = 8.3;
const PLAZA = 6.8;
/** Seconds between listener and fountain updates. */
const LISTEN_EVERY = 0.1;
const WATER_EVERY = 0.5;
/** Seconds after a completion jingle in which the XP ding stays quiet (the jingle says it). */
const XP_AFTER_COMPLETE = 2;
const SAVE_DELAY_MS = 800;

/** Fountains of the dressing: the tiered spawn fountain plus every kit fountain. */
function fountains(view: WorldView): Fountain[] {
  const spawn = view.layout.hubs[0];
  const list: Fountain[] = spawn ? [{ x: spawn.x, y: 0.1, z: spawn.z, size: 1 }] : [];
  for (const d of view.dressing.districts) {
    for (const p of d.placements) if (p.id.includes('fountain')) list.push({ x: p.x, y: p.y, z: p.z, size: p.id.endsWith('detail') ? 0.7 : 0.5 });
  }
  return list;
}

function ground(view: WorldView): Ground {
  return {
    bridges: view.dressing.bridges,
    paths: view.dressing.paths,
    plazas: view.layout.hubs.map((h, i) => ({ x: h.x, z: h.z, r: i === 0 ? SPAWN_PLAZA : PLAZA })),
  };
}

/** Soundtrack, effects and fountains for the world, the HUD sound button, and the saved choice; silent until the first gesture. */
export function startSound(view: WorldView, player: Player, deps: SoundDeps): SoundRuntime {
  let settings = parseSound(deps.stored);
  const mix = { on: settings.on, volume: settings.volume, video: false, panel: false, hidden: document.hidden };
  const engine = new AudioEngine(deps.assets, audioFormat(document.createElement('audio')), mix);
  const music = new Music(engine);
  const water = new FountainWater(engine);
  let springs = fountains(view);
  let floor = ground(view);
  view.onRebuild(() => {
    springs = fountains(view);
    floor = ground(view);
  });
  const remix = (change: Partial<MixState>): void => {
    Object.assign(mix, change);
    engine.setMix(mix);
    music.setPaused(!engine.audible);
  };
  const track = () => musicFor(view.island, view.layout.hubs.length);

  const unlock = (): void => {
    if (!engine.unlock()) return;
    for (const type of ['pointerdown', 'keydown', 'touchend'] as const) window.removeEventListener(type, unlock, true);
    music.setPaused(!engine.audible);
    music.play(track());
  };
  for (const type of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(type, unlock, true);
  document.addEventListener('visibilitychange', () => remix({ hidden: document.hidden }));

  let saving = 0;
  new SoundControl(view.stage.canvasHost, settings, { ...DEFAULT_SOUND_STRINGS, ...deps.strings }, (next) => {
    settings = next;
    remix({ on: next.on, volume: next.volume });
    window.clearTimeout(saving);
    saving = window.setTimeout(() => {
      deps.gateway.savePreference(SOUND_PREFERENCE, encodeSound(next)).catch((e: unknown) => console.warn('mooblox: saving the sound choice failed', e));
    }, SAVE_DELAY_MS);
  });

  const feet = player.onFeet;
  player.onFeet = (x, y, z, n, strength) => {
    feet?.(x, y, z, n, strength);
    if (isJump(n)) engine.play('jump');
  };
  const footfall = new Footfall();

  const backdrop = view.stage.canvasHost.querySelector<HTMLElement>('.mooblox-panel-backdrop');
  if (backdrop) {
    new MutationObserver(() => {
      const open = !backdrop.hidden;
      if (open === mix.panel || (open && mix.video)) return;
      const video = open && backdrop.querySelector('.mooblox-video') !== null;
      if (open && !video) engine.play('open');
      remix({ panel: open, video });
      if (!open) engine.play('close');
    }).observe(backdrop, { attributes: true, attributeFilter: ['hidden'] });
  }

  let done = deps.store.world ? doneIds(deps.store.world) : new Set<number>();
  let completedAt = -Infinity;
  deps.store.subscribe((world) => {
    const next = doneIds(world);
    if (newlyDone(done, next)) {
      engine.play('complete');
      completedAt = performance.now() / 1000;
    }
    done = next;
  });
  deps.rewards?.subscribe((next, previous) => {
    const cue = rewardCue(previous, next);
    if (cue === 'levelup' || (cue === 'xp' && performance.now() / 1000 - completedAt > XP_AFTER_COMPLETE)) engine.play(cue);
  });

  const bubble = deps.bubble;
  let talking = false;
  if (bubble) {
    new MutationObserver(() => {
      if (!bubble.hidden) engine.play('guide');
    }).observe(bubble.querySelector('.mooblox-bubble-text') ?? bubble, { childList: true, characterData: true, subtree: true });
  }

  let listenIn = 0;
  let waterIn = 0;
  const at = player.body.position;
  const m = view.stage.camera.matrixWorld.elements;
  view.onFrame((dt) => {
    if (!engine.context) return;
    music.play(track());
    const cue = footfall.update(at.x, at.z, player.body.onGround, dt);
    if (cue === 'step') engine.play(`step-${surfaceAt(floor, at.x, at.z)}`);
    else if (cue === 'land') engine.play('land', 0.5 + Math.min(1, footfall.landedAfter) * 0.5);
    if (bubble && !bubble.hidden !== talking) {
      talking = !bubble.hidden;
      if (talking) engine.play('guide');
    }
    if ((listenIn -= dt) <= 0) {
      listenIn = LISTEN_EVERY;
      engine.listen(at, Math.atan2(-m[8]!, -m[10]!));
    }
    if ((waterIn -= dt) <= 0) {
      waterIn = WATER_EVERY;
      water.update(springs, at.x, at.z);
    }
  });

  return {
    engine,
    music,
    get settings() {
      return settings;
    },
  };
}
