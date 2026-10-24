import { AjaxGateway } from '../moodle/ajax-gateway';
import { keepSessionAlive } from '../moodle/session-keeper';
import { CourseStore } from '../state/course-store';
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
}

boot().catch((e: unknown) => console.error('mooblox: boot failed', e));
