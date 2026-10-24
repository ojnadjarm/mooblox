import { DoorFactory } from './door';
import { PropRegistry } from './prop-registry';

/** The registry of every prop kind; a new kind is one more `register`. */
export function createPropRegistry(): PropRegistry {
  return new PropRegistry(new DoorFactory());
}
