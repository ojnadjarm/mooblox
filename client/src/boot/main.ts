import { readConfig } from './config';

/** Composition root: reads the play.php config and wires the client. */
function boot(): void {
  const root = document.getElementById('mooblox-root');
  if (!root) {
    throw new Error('missing #mooblox-root');
  }
  const config = readConfig(document.getElementById('mooblox-config')?.textContent);
  root.dataset['courseid'] = String(config.courseid);
}

boot();
