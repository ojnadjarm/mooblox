import { injectStyle } from './style';

const CSS = `
.mooblox-burst { position: absolute; inset: 0; z-index: 11; pointer-events: none; overflow: hidden; }
.mooblox-burst i { position: absolute; width: 10px; height: 10px; border-radius: 50%; opacity: 0;
  animation: mooblox-burst 1.6s cubic-bezier(.15, .7, .3, 1) forwards; }
@keyframes mooblox-burst { 0% { opacity: 1; transform: translate(0, 0) scale(1); }
  70% { opacity: 1; } 100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(.4); } }
`;
const COLOURS = ['#f6c445', '#2fa39a', '#e0844f', '#a774f0', '#5ed8d2', '#ffffff'];
const SPARKS = 28;
const SHELLS = 3;

/** Firework bursts drawn in the page (the low tier): a few rings of CSS sparks over the sky, gone after 2.5 s. */
export function goalBurst(host: HTMLElement): HTMLElement {
  injectStyle('mooblox-burst-style', CSS);
  const root = document.createElement('div');
  root.className = 'mooblox-burst';
  root.setAttribute('aria-hidden', 'true');
  for (let s = 0; s < SHELLS; s++) {
    const cx = 25 + s * 25;
    const cy = 22 + (s % 2) * 10;
    for (let i = 0; i < SPARKS; i++) {
      const a = (i / SPARKS) * Math.PI * 2;
      const spark = document.createElement('i');
      spark.style.left = `${cx}%`;
      spark.style.top = `${cy}%`;
      spark.style.background = COLOURS[(s * 2 + i) % COLOURS.length]!;
      spark.style.setProperty('--dx', `${Math.cos(a) * 22}vmin`);
      spark.style.setProperty('--dy', `${Math.sin(a) * 22 + 6}vmin`);
      spark.style.animationDelay = `${s * 0.4}s`;
      root.appendChild(spark);
    }
  }
  host.appendChild(root);
  window.setTimeout(() => root.remove(), 2600);
  return root;
}
