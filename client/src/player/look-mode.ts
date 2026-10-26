/** Mouse-look state: `off` waits for a click, `locked` turns the camera, `free` = Ctrl held (cursor out), `held` = a panel is open. */
export type LookMode = 'off' | 'locked' | 'free' | 'held';

/** What happened: a mouse click on the world, Ctrl, the browser's lock answer, a panel, the window losing focus. */
export type LookEvent = 'click' | 'ctrl-down' | 'ctrl-up' | 'locked' | 'unlocked' | 'refused' | 'panel-open' | 'panel-close' | 'blur';

/** What the adapter must ask the browser for. */
export type LookAction = 'lock' | 'unlock' | null;

/** Pure pointer-lock policy: hold Ctrl for the cursor, release to look again; panels free the cursor until they close. */
export class LookModel {
  mode: LookMode = 'off';
  private ctrl = false;
  private panel = false;
  /** Whether mouse-look was on (or only paused by Ctrl) when the panel opened. */
  private wanted = false;

  handle(e: LookEvent): LookAction {
    switch (e) {
      case 'click':
        return this.mode === 'off' && !this.ctrl && !this.panel ? 'lock' : null;
      case 'ctrl-down':
        this.ctrl = true;
        if (this.mode !== 'locked') return null;
        this.mode = 'free';
        return 'unlock';
      case 'ctrl-up':
        this.ctrl = false;
        return this.mode === 'free' ? 'lock' : null;
      case 'locked':
        if (this.ctrl || this.panel) return 'unlock';
        this.mode = 'locked';
        return null;
      case 'unlocked':
        if (this.mode === 'locked') this.mode = 'off';
        return null;
      case 'refused':
        if (this.mode === 'free') this.mode = 'off';
        return null;
      case 'panel-open':
        if (this.panel) return null;
        this.panel = true;
        this.wanted = this.mode === 'locked' || this.mode === 'free';
        this.mode = 'held';
        return this.wanted ? 'unlock' : null;
      case 'panel-close':
        if (!this.panel) return null;
        this.panel = false;
        this.mode = this.wanted && this.ctrl ? 'free' : 'off';
        return this.wanted && !this.ctrl ? 'lock' : null;
      case 'blur':
        this.ctrl = false;
        if (this.mode === 'free') this.mode = 'off';
        return null;
    }
  }
}
