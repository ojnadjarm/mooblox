import { LookModel, type LookAction, type LookEvent, type LookMode } from './look-mode';

/** A single mousemove beyond this (px) is a browser glitch (Chrome on Windows reports lock jumps), not a flick. */
const SPIKE = 250;

/** What mouse-look turns. */
export interface Turnable {
  turn(dx: number, dy: number): void;
}

/** PC mouse-look over the Pointer Lock API: a click on the world locks, the mouse turns the camera, Ctrl held frees the cursor. */
export class MouseLook {
  private readonly model = new LookModel();
  private readonly listeners: ((mode: LookMode) => void)[] = [];

  constructor(
    private readonly canvas: HTMLElement,
    camera: Turnable,
    private readonly doc: Document = document,
    win: Window = window,
  ) {
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button === 0) this.send('click');
    });
    const ctrl = (e: KeyboardEvent): boolean => (e.code === 'ControlLeft' || e.code === 'ControlRight') && !e.repeat;
    win.addEventListener('keydown', (e) => ctrl(e) && this.send('ctrl-down'));
    win.addEventListener('keyup', (e) => ctrl(e) && this.send('ctrl-up'));
    win.addEventListener('blur', () => this.send('blur'));
    doc.addEventListener('pointerlockchange', () => this.send(doc.pointerLockElement === canvas ? 'locked' : 'unlocked'));
    doc.addEventListener('pointerlockerror', () => this.send('refused'));
    doc.addEventListener('mousemove', (e) => {
      if (this.model.mode === 'locked' && Math.abs(e.movementX) < SPIKE && Math.abs(e.movementY) < SPIKE) camera.turn(e.movementX, e.movementY);
    });
  }

  get mode(): LookMode {
    return this.model.mode;
  }

  /** Calls `fn` with the mode now and after every change. */
  onChange(fn: (mode: LookMode) => void): void {
    this.listeners.push(fn);
    fn(this.model.mode);
  }

  /** A panel opened or closed over the world. */
  panel(open: boolean): void {
    this.send(open ? 'panel-open' : 'panel-close');
  }

  private send(e: LookEvent): void {
    const before = this.model.mode;
    this.act(this.model.handle(e));
    if (this.model.mode !== before) for (const fn of this.listeners) fn(this.model.mode);
  }

  private act(action: LookAction): void {
    if (action === 'unlock') {
      if (this.doc.pointerLockElement === this.canvas) this.doc.exitPointerLock();
    } else if (action === 'lock') {
      try {
        const pending = this.canvas.requestPointerLock() as Promise<void> | undefined;
        pending?.catch(() => this.send('refused'));
      } catch {
        this.send('refused');
      }
    }
  }
}
