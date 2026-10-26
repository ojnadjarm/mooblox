/** `extras` over `view` with the view's getters still live (a spread would freeze them at boot). */
export function liveHandle<V extends object, E extends object>(view: V, extras: E): V & E {
  return Object.assign(Object.create(view) as V, extras);
}
