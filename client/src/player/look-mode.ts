/** Mouse-look state: `off` waits for a click, `locked` turns the camera, `free` = Tab held (cursor out), `held` = a panel is open. */
export type LookMode = 'off' | 'locked' | 'free' | 'held';

/** What happened: a mouse click on the world, any other key press, the cursor key (Tab), the browser's lock answer, a panel, the window losing focus. */
export type LookEvent = 'click' | 'key' | 'hold-down' | 'hold-up' | 'locked' | 'unlocked' | 'refused' | 'panel-open' | 'panel-close' | 'blur';

/** What the adapter must ask the browser for. */
export type LookAction = 'lock' | 'unlock' | null;

/** Pure pointer-lock policy: the first key press or a click locks, hold Tab for the cursor, release to look again; panels free the cursor until they close. */
export class LookModel {
  mode: LookMode = 'off';
  private held = false;
  private panel = false;
  /** The page's first key press still takes the lock (later ones leave it to a click). */
  private first = true;
  /** Whether mouse-look was on (or only paused by Tab) when the panel opened. */
  private wanted = false;

  handle(e: LookEvent): LookAction {
    switch (e) {
      case 'click':
        this.first = false;
        return this.mode === 'off' && !this.held && !this.panel ? 'lock' : null;
      case 'key':
        if (!this.first || this.mode !== 'off' || this.held || this.panel) return null;
        this.first = false;
        return 'lock';
      case 'hold-down':
        this.held = true;
        if (this.mode !== 'locked') return null;
        this.mode = 'free';
        return 'unlock';
      case 'hold-up':
        this.held = false;
        return this.mode === 'free' ? 'lock' : null;
      case 'locked':
        if (this.held || this.panel) return 'unlock';
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
        this.mode = this.wanted && this.held ? 'free' : 'off';
        return this.wanted && !this.held ? 'lock' : null;
      case 'blur':
        this.held = false;
        if (this.mode === 'free') this.mode = 'off';
        return null;
    }
  }
}
