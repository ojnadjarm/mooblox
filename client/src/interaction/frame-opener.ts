import type { Activity } from '../domain/types';
import type { PanelHost } from '../ui/panel';
import type { ActivityOpener } from './opener';

/** Default: the activity's own Moodle page in a frame (the plugin strips Moodle's chrome there). */
export class FrameOpener implements ActivityOpener {
  canOpen(a: Activity): boolean {
    return a.available && a.url !== '';
  }

  open(a: Activity, panel: PanelHost): Promise<void> {
    const frame = document.createElement('iframe');
    frame.className = 'mooblox-frame';
    frame.title = a.name;
    frame.src = a.url;
    frame.allow = 'fullscreen; autoplay; encrypted-media; picture-in-picture';
    return panel.open(a.name, frame);
  }
}
