import { ArenaGateFactory } from './arena-gate';
import { BookStandFactory } from './book-stand';
import { CinemaFactory } from './cinema';
import { DoorFactory } from './door';
import { PropRegistry } from './prop-registry';
import { SignpostFactory } from './signpost';

/** The registry of every prop kind; a new kind is one more `register`. */
export function createPropRegistry(): PropRegistry {
  return new PropRegistry(new DoorFactory())
    .register(new SignpostFactory())
    .register(new BookStandFactory())
    .register(new CinemaFactory())
    .register(new ArenaGateFactory());
}
