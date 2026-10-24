import type { Activity, WorldData } from '../domain/types';
import type { FrameGate } from '../perf/frame-gate';
import type { Panel } from '../ui/panel';
import type { ActivityPrompt } from '../ui/prompt';
import { htmlToText } from '../ui/style';
import type { Plot } from '../world/layout';
import type { OpenerRegistry } from './opener';
import { nearestPlot } from './proximity';

export type ClosedListener = (a: Activity) => void;

/** Extra title-bar controls for an open activity (the manual completion toggle). */
export type PanelActions = (a: Activity) => HTMLElement[];

/** Walk up to a plot → prompt → E or tap → opener in the panel; the world sleeps while it is open. */
export class ActivityInteraction {
  private current: Plot | null = null;
  private readonly closed = new Set<ClosedListener>();

  constructor(
    private readonly plots: readonly Plot[],
    private readonly world: () => WorldData,
    private readonly openers: OpenerRegistry,
    private readonly panel: Panel,
    private readonly prompt: ActivityPrompt,
    private readonly gate: FrameGate,
    private readonly actionsFor: PanelActions = () => [],
  ) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE' && !e.repeat && !this.panel.isOpen && !(e.target instanceof HTMLInputElement)) {
        void this.openCurrent();
      }
    });
  }

  /** The activity whose prompt is showing, if any. */
  get activity(): Activity | null {
    return this.current ? this.find(this.current.activityId) : null;
  }

  /** Follows the player; call once per frame. */
  update(x: number, z: number): void {
    const next = nearestPlot(this.plots, x, z, this.current);
    if (next !== this.current) {
      this.current = next;
      this.refreshPrompt();
    }
  }

  /** Re-reads the prompt after the world changed (completion, availability). */
  refreshPrompt(): void {
    const a = this.activity;
    this.prompt.show(
      a ? { name: a.name, locked: a.available ? null : htmlToText(a.availableInfo) || '', openable: this.openers.resolve(a) !== null } : null,
    );
  }

  /** Runs after each close, with the activity that was open. */
  onClosed(listener: ClosedListener): () => void {
    this.closed.add(listener);
    return () => this.closed.delete(listener);
  }

  async openCurrent(): Promise<void> {
    const a = this.activity;
    if (a) {
      await this.open(a);
    }
  }

  async open(a: Activity): Promise<void> {
    const opener = this.openers.resolve(a);
    if (!opener || this.panel.isOpen) {
      return;
    }
    this.prompt.show(null);
    this.gate.pause();
    try {
      const actions = this.actionsFor(a);
      await opener.open(a, { open: (title, content, more = []) => this.panel.open(title, content, [...actions, ...more]) });
    } finally {
      this.gate.resume();
      this.refreshPrompt();
      for (const listener of this.closed) {
        listener(a);
      }
    }
  }

  private find(id: number): Activity | null {
    return this.world().sections.flatMap((s) => s.activities).find((a) => a.id === id) ?? null;
  }
}
