const COLOURS = ['#2fa39a', '#f07a5f', '#f6c445', '#5db761', '#2f7fe0', '#8e5ad8', '#ffffff'];

/** Flat faceted confetti (squares and triangles in the palette) bursting up and falling over `el` for `ms`; returns a stop. */
export function confetti(el: HTMLElement, ms = 2500): () => void {
  const canvas = document.createElement('canvas');
  el.prepend(canvas);
  const w = (canvas.width = el.clientWidth);
  const h = (canvas.height = el.clientHeight);
  const g = canvas.getContext('2d');
  let frame = 0;
  const stop = (): void => {
    cancelAnimationFrame(frame);
    canvas.remove();
  };
  if (!g) return stop;
  const count = Math.round(Math.min(160, Math.max(60, (w * h) / 9000)));
  const bits = Array.from({ length: count }, (_, i) => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.3,
    y: h * 0.42,
    vx: (Math.random() - 0.5) * w * 1.1,
    vy: -h * (0.5 + Math.random() * 0.7),
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 12,
    size: 7 + Math.random() * 7,
    tri: i % 3 === 0,
    colour: COLOURS[i % COLOURS.length]!,
  }));
  const start = performance.now();
  let last = start;
  const step = (now: number): void => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now - start;
    g.clearRect(0, 0, w, h);
    g.globalAlpha = t > ms - 500 ? Math.max(0, (ms - t) / 500) : 1;
    for (const b of bits) {
      b.vy += h * 1.3 * dt;
      b.vx *= 0.985;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.r += b.vr * dt;
      g.save();
      g.translate(b.x, b.y);
      g.rotate(b.r);
      g.scale(1, Math.cos(b.r * 1.7));
      g.fillStyle = b.colour;
      g.beginPath();
      if (b.tri) {
        g.moveTo(0, -b.size * 0.6);
        g.lineTo(b.size * 0.55, b.size * 0.45);
        g.lineTo(-b.size * 0.55, b.size * 0.45);
      } else {
        g.rect(-b.size / 2, -b.size / 3, b.size, (b.size * 2) / 3);
      }
      g.fill();
      g.restore();
    }
    if (t < ms) frame = requestAnimationFrame(step);
    else canvas.remove();
  };
  frame = requestAnimationFrame(step);
  return stop;
}
