// Page-side trailer hooks (init script): a scripted camera rig over the game's render, a clean-frame switch and a pinned render scale.
(() => {
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
  const mix = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
  const style = document.createElement('style');
  style.textContent = 'html.trailer-clean body * { visibility: hidden !important; } html.trailer-clean canvas, html.trailer-clean .mooblox-white-out, html.trailer-clean .trailer-keep, html.trailer-clean .trailer-keep * { visibility: visible !important; } html.trailer-clean { cursor: none !important; }';
  let rig = null;
  let t0 = 0;
  const api = {
    lerp,
    ease,
    mix,
    /** Wraps the game's render so a rig `(t, mooblox, api) => {pos, look, fov}` places the camera (null = the game's own camera). */
    install() {
      const m = window.mooblox;
      const stage = m.view?.stage ?? m.stage;
      const render = stage.render.bind(stage);
      const camera = stage.camera;
      const fov = camera.fov;
      const place = () => {
        const shot = rig?.((performance.now() - t0) / 1000, m, api);
        if (!shot) return;
        camera.position.set(...shot.pos);
        camera.up.set(0, 1, 0);
        camera.lookAt(...shot.look);
        const want = shot.fov ?? fov;
        if (camera.fov !== want) {
          camera.fov = want;
          camera.updateProjectionMatrix();
        }
        camera.updateMatrixWorld();
        camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
      };
      // The rig places the camera before the frame's work (culling, life, streaming see it) and again before the render.
      window.__trailerClock.before = place;
      stage.render = () => {
        place();
        render();
      };
      const follow = m.player.camera.follow.bind(m.player.camera);
      m.player.camera.follow = (...args) => (rig ? undefined : follow(...args));
      const q = m.view?.quality;
      if (q) {
        q.frame = () => {};
        q.dynamic.scale = 1;
        q.apply();
      }
      document.head.append(style);
    },
    /** Sets the camera rig from function source; its clock starts now. */
    rig(source) {
      rig = source ? (0, eval)(`(${source})`) : null;
      t0 = performance.now();
    },
    clean(on) {
      document.documentElement.classList.toggle('trailer-clean', on);
    },
    /** World position of the player's avatar. */
    me() {
      const p = window.mooblox.player.avatar.root.position;
      return [p.x, p.y, p.z];
    },
  };
  window.__trailer = api;
})();
