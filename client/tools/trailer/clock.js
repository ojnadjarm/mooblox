// Virtual frame clock (page init script): rAF and performance.now only move on `__trailerClock.step(ms)`, from the first script on;
// `before(now)` runs at the start of each step.
(() => {
  const queue = new Map();
  let next = 0;
  let now = performance.now();
  window.requestAnimationFrame = (cb) => {
    queue.set(++next, cb);
    return next;
  };
  window.cancelAnimationFrame = (id) => void queue.delete(id);
  performance.now = () => now;
  /** CSS animations and transitions follow the virtual clock too: paused and set to their virtual age, finished at their end. */
  const born = new WeakMap();
  const syncAnimations = () => {
    for (const a of document.getAnimations?.() ?? []) {
      if (a.playState === 'finished') continue;
      if (!born.has(a)) born.set(a, now - (a.currentTime ?? 0));
      const age = now - born.get(a);
      if (age >= a.effect.getComputedTiming().endTime) {
        a.finish();
        continue;
      }
      if (a.playState !== 'paused') a.pause();
      a.currentTime = age;
    }
  };
  window.__trailerClock = {
    /** Advances `ms` and runs the frame callbacks queued so far. */
    step(ms) {
      now += ms;
      this.before?.(now);
      const due = [...queue.values()];
      queue.clear();
      for (const cb of due) {
        try {
          cb(now);
        } catch (e) {
          console.error('trailer clock: frame callback failed', e);
        }
      }
      syncAnimations();
    },
  };
})();
