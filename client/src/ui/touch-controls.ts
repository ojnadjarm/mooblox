import type { InputSource, InputState, MutableInput } from '../player/input';

const RUN_AT = 0.95;
const STYLE_ID = 'mooblox-touch-style';
const CSS = `
.mooblox-touch { position: absolute; inset: 0; pointer-events: none; user-select: none; -webkit-user-select: none;
  --pad: max(clamp(16px, 4vmin, 40px), env(safe-area-inset-left), env(safe-area-inset-right)); --size: clamp(110px, 26vmin, 180px); }
.mooblox-touch[hidden] { display: none; }
.mooblox-stick, .mooblox-jump { position: absolute; bottom: calc(var(--pad) + env(safe-area-inset-bottom)); pointer-events: auto;
  touch-action: none; border-radius: 50%; box-sizing: border-box; }
.mooblox-stick { left: var(--pad); width: var(--size); height: var(--size); background: rgba(255,255,255,.28);
  border: 4px solid rgba(255,255,255,.75); box-shadow: 0 4px 14px rgba(0,40,80,.25); }
.mooblox-knob { position: absolute; left: 50%; top: 50%; width: 44%; height: 44%; margin: -22% 0 0 -22%; border-radius: 50%;
  background: #fff; box-shadow: 0 3px 8px rgba(0,40,80,.35); transition: transform .08s ease-out; }
.mooblox-stick.active .mooblox-knob { transition: none; }
.mooblox-jump { right: var(--pad); width: calc(var(--size) * .62); height: calc(var(--size) * .62); background: rgba(255,255,255,.85);
  border: 4px solid #fff; box-shadow: 0 4px 14px rgba(0,40,80,.3); display: grid; place-items: center; color: #1e88e5; }
.mooblox-jump.active { background: #ffe066; transform: scale(.94); }
.mooblox-jump svg { width: 46%; height: 46%; }
`;

/** On-screen joystick (left) and jump button (right) over the canvas; only they take pointer events. */
export class TouchControls implements InputSource {
  readonly element: HTMLElement;
  private readonly knob: HTMLElement;
  private x = 0;
  private z = 0;
  private jump = false;
  private readonly state: MutableInput = { x: 0, z: 0, run: false, jump: false };

  constructor(host: HTMLElement, show: boolean) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.element = document.createElement('div');
    this.element.className = 'mooblox-touch';
    this.element.hidden = !show;
    this.element.innerHTML = `
      <div class="mooblox-stick" role="application" aria-label="Move"><div class="mooblox-knob"></div></div>
      <button type="button" class="mooblox-jump" aria-label="Jump">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 15l7-7 7 7"/></svg></button>`;
    host.appendChild(this.element);
    this.knob = this.element.querySelector('.mooblox-knob')!;
    this.bindStick(this.element.querySelector('.mooblox-stick')!);
    this.bindJump(this.element.querySelector('.mooblox-jump')!);
    window.addEventListener('touchstart', () => (this.element.hidden = false), { once: true, passive: true });
  }

  read(): InputState {
    const s = this.state;
    s.x = this.x;
    s.z = this.z;
    s.run = Math.sqrt(this.x * this.x + this.z * this.z) >= RUN_AT;
    s.jump = this.jump;
    return s;
  }

  private bindStick(stick: HTMLElement): void {
    let id: number | null = null;
    const move = (e: PointerEvent): void => {
      const r = stick.getBoundingClientRect();
      const radius = r.width / 2;
      let dx = (e.clientX - (r.left + radius)) / radius;
      let dy = (e.clientY - (r.top + radius)) / radius;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      this.x = dx;
      this.z = -dy;
      this.knob.style.transform = `translate(${dx * radius * 0.6}px, ${dy * radius * 0.6}px)`;
    };
    const end = (e: PointerEvent): void => {
      if (e.pointerId === id) {
        id = null;
        this.x = this.z = 0;
        this.knob.style.transform = '';
        stick.classList.remove('active');
      }
    };
    stick.addEventListener('pointerdown', (e) => {
      if (id !== null) {
        return;
      }
      id = e.pointerId;
      stick.setPointerCapture(id);
      stick.classList.add('active');
      move(e);
      e.preventDefault();
    });
    stick.addEventListener('pointermove', (e) => e.pointerId === id && move(e));
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
  }

  private bindJump(button: HTMLElement): void {
    const set = (on: boolean) => (e: PointerEvent): void => {
      this.jump = on;
      button.classList.toggle('active', on);
      if (on) {
        button.setPointerCapture(e.pointerId);
        e.preventDefault();
      }
    };
    button.addEventListener('pointerdown', set(true));
    button.addEventListener('pointerup', set(false));
    button.addEventListener('pointercancel', set(false));
  }
}
