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
  const timers = new Set();
  const runTimers = () => {
    for (const t of [...timers].sort((a, b) => a.at - b.at)) {
      if (t.at > now) break;
      timers.delete(t);
      t.fn(...t.args);
    }
  };
  window.__trailerClock = {
    /** From now on setTimeout runs on the virtual clock too (page timers created before keep real time). */
    holdTimers() {
      window.setTimeout = (fn, ms = 0, ...args) => {
        const t = { at: now + ms, fn: typeof fn === 'function' ? fn : () => (0, eval)(fn), args };
        timers.add(t);
        return t;
      };
      window.clearTimeout = (t) => void timers.delete(t);
    },
    /** Advances `ms` and runs the timers and frame callbacks due by then. */
    step(ms) {
      now += ms;
      runTimers();
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
