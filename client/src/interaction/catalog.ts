import type { MoodleGateway } from '../moodle/gateway';
import { FrameOpener } from './frame-opener';
import { OpenerRegistry } from './opener';
import { VideoOpener } from './video-opener';

/** Every opener, most specific first; the frame opener takes any activity with a page. */
export function createOpenerRegistry(gateway: MoodleGateway): OpenerRegistry {
  return new OpenerRegistry().register(new VideoOpener(gateway)).register(new FrameOpener());
}
