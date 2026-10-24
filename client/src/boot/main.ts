import { AjaxGateway } from '../moodle/ajax-gateway';
import { keepSessionAlive } from '../moodle/session-keeper';
import { CourseStore } from '../state/course-store';
import { createOpenerRegistry } from '../interaction/catalog';
import { AvatarKit } from '../player/avatar-kit';
import { DEFAULT_GUIDE_STRINGS } from '../tutor/guide';
import { DEFAULT_TUTOR_STRINGS, ScriptedTutor } from '../tutor/scripted-tutor';
import { startActivities, startGuide, startPlayer, startWorld } from './app';
import { readConfig } from './config';

const SESSION_TOUCH_MS = 5 * 60 * 1000;

/** Composition root: reads the play.php config and wires the client. */
async function boot(): Promise<void> {
  const root = document.getElementById('mooblox-root');
  if (!root) {
    throw new Error('missing #mooblox-root');
  }
  const config = readConfig(document.getElementById('mooblox-config')?.textContent);
  const gateway = new AjaxGateway(config);
  const store = new CourseStore();
  keepSessionAlive(gateway, SESSION_TOUCH_MS, (e) => console.error('mooblox: session touch failed', e));
  store.set(await gateway.getWorld(config.courseid));
  root.dataset['courseid'] = String(config.courseid);
  const view = startWorld(root, store.world!);
  const avatars = await AvatarKit.load(new URL(/* @vite-ignore */ './assets/', import.meta.url).href);
  const player = await startPlayer(view, avatars, { skin: config.avatar || 'a', tint: null });
  const course = { store, gateway };
  const interaction = startActivities(view, player, createOpenerRegistry(gateway), course);
  const strings = config.strings;
  const guide = await startGuide(view, player, avatars, new ScriptedTutor({ ...DEFAULT_TUTOR_STRINGS, ...strings }), course, { ...DEFAULT_GUIDE_STRINGS, ...strings });
  Object.assign(window, { mooblox: { ...view, player, interaction, store, guide } });
}

boot().catch((e: unknown) => console.error('mooblox: boot failed', e));
