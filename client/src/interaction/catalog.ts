import { FrameOpener } from './frame-opener';
import { OpenerRegistry } from './opener';

/** Every opener, most specific first; the frame opener takes any activity with a page. */
export function createOpenerRegistry(): OpenerRegistry {
  return new OpenerRegistry().register(new FrameOpener());
}
