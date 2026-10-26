/** What to do when the GPU drops the world's WebGL context. */
export interface ContextHandlers {
  /** The context is back: GPU data must be made again. */
  restored(): void;
  /** The loss outlasted the wait: the browser may never give it back. */
  stuck?(): void;
}

/** Keeps a lost WebGL context restorable and calls `on` as it goes and comes back; returns a stop function. */
export function watchContext(canvas: EventTarget, on: ContextHandlers, waitMs = 5000): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const lost = (e: Event): void => {
    e.preventDefault();
    clear();
    timer = setTimeout(() => {
      timer = null;
      on.stuck?.();
    }, waitMs);
  };
  const restored = (): void => {
    clear();
    on.restored();
  };
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  return () => {
    clear();
    canvas.removeEventListener('webglcontextlost', lost);
    canvas.removeEventListener('webglcontextrestored', restored);
  };
}
