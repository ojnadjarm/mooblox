// Bridge crossings of one autopilot walk (T1394): the in-page frame recorder and the crossing windows, shared by perf.mjs and crossing.mjs.

/** Seconds either side of an island change that count as crossing a bridge (ms). */
export const WINDOW_MS = 2000;

/** In-page: frame times and the island underfoot until the walk arrives or `max` ms pass, plus the hallway log's summary. */
export function walkFrames(max) {
  return new Promise((resolve) => {
    const v = window.mooblox;
    const circles = [...v.layout.hubs, ...v.layout.zones];
    const frames = [];
    let island = 0;
    let last = null;
    const t0 = performance.now();
    const tick = (t) => {
      const p = v.player.body.position;
      const on = circles.findIndex((c) => Math.hypot(c.x - p.x, c.z - p.z) < c.radius);
      if (on >= 0) island = on;
      if (last !== null) frames.push([+(t - t0).toFixed(1), +(t - last).toFixed(1), island]);
      last = t;
      if (v.probe.reached || t - t0 > max) return resolve({ frames, reached: v.probe.reached === true, hallway: v.hallway.summary() });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** Island-change times of `frames` ([t, dt, island, ...]) and the worst frame within WINDOW_MS of one (null when none). */
export function crossingStats(frames) {
  const crossings = [];
  for (let i = 1; i < frames.length; i++) if (frames[i][2] !== frames[i - 1][2]) crossings.push(frames[i][0]);
  const inWindow = frames.filter((f) => crossings.some((c) => Math.abs(c - f[0]) <= WINDOW_MS));
  return { crossings, crossingWorst: inWindow.length ? Math.max(...inWindow.map((f) => f[1])) : null };
}

/** The autopilot route: the farthest plot on small campuses, a tour over 5-6 bridges on bigger ones. */
export const walkFor = (shape) => (shape === 'demo' || shape === '1x2' ? 'far' : 'tour');

/**
 * In-page: a frame-time strip for crossing videos: the last 200 frames as bars (green one vsync, amber two, red more) under a
 * 33 ms line, the worst frame, the island underfoot, and a label each time an island's content switches on (red POP under the
 * hallway's pop fog, grey when hidden in the haze) or the safety net builds one inline.
 */
export function frameOverlay(label) {
  const v = window.mooblox;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;left:0;right:0;bottom:0;width:100%;height:110px;z-index:99;pointer-events:none';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const dts = [];
  const notes = [];
  const circles = [...v.layout.hubs, ...v.layout.zones];
  let island = 0;
  let worst = 0;
  let last = null;
  const show = v.hallway.show.bind(v.hallway);
  v.hallway.show = (i, t, fog) => {
    notes.push({ text: fog < 0.8 ? `POP island ${i} (fog ${fog.toFixed(2)})` : `island ${i} on, hidden (fog ${fog.toFixed(2)})`, pop: fog < 0.8, at: t });
    return show(i, t, fog);
  };
  const inline = v.hallway.inline.bind(v.hallway);
  v.hallway.inline = (i, t, ms) => {
    notes.push({ text: `POP inline build ${i} (${ms.toFixed(0)} ms)`, pop: true, at: t });
    return inline(i, t, ms);
  };
  const draw = (t) => {
    if (last !== null) {
      dts.push(t - last);
      if (dts.length > 200) dts.shift();
      worst = Math.max(worst, t - last);
    }
    last = t;
    const p = v.player.body.position;
    const on = circles.findIndex((c) => Math.hypot(c.x - p.x, c.z - p.z) < c.radius);
    if (on >= 0) island = on;
    const w = (canvas.width = canvas.clientWidth);
    const h = (canvas.height = 110);
    ctx.fillStyle = 'rgba(10,20,40,.78)';
    ctx.fillRect(0, 0, w, h);
    const y = (ms) => h - 8 - (Math.min(ms, 70) / 70) * (h - 40);
    const bw = w / 200;
    dts.forEach((d, k) => {
      ctx.fillStyle = d <= 20 ? '#4caf50' : d <= 34 ? '#ffb300' : '#e53935';
      ctx.fillRect(k * bw, y(d), Math.max(1, bw - 0.5), h - 8 - y(d));
    });
    ctx.strokeStyle = '#fff';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(0, y(33));
    ctx.lineTo(w, y(33));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff';
    ctx.font = '600 12px ui-monospace, monospace';
    ctx.fillText(`${label}  frame ${(dts.at(-1) ?? 0).toFixed(1)} ms  worst ${worst.toFixed(1)}  island ${island}`, 6, 15);
    const fresh = notes.filter((n) => t - n.at < 2500).slice(-1)[0];
    if (fresh) {
      ctx.fillStyle = fresh.pop ? '#ff5252' : '#cfd8dc';
      ctx.fillText(fresh.text, 6, 30);
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}
