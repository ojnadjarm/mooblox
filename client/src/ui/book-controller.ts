import type { WorldData } from '../domain/types';
import type { FrameGate } from '../perf/frame-gate';
import { bookButton, renderBook } from './book';
import type { Panel } from './panel';

/** Opens the course book from the HUD button or key B; "Go there" closes it and hands the activity to `goTo`. */
export class BookController {
  private showing = false;

  constructor(
    host: HTMLElement,
    private readonly panel: Panel,
    private readonly gate: FrameGate,
    private readonly world: () => WorldData,
    private readonly goTo: (activityId: number) => void,
  ) {
    bookButton(host, () => this.toggle());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyB' && !e.repeat && !(e.target instanceof HTMLInputElement)) {
        this.toggle();
      }
    });
  }

  toggle(): void {
    if (this.showing) {
      this.panel.close();
    } else if (!this.panel.isOpen) {
      void this.open();
    }
  }

  async open(): Promise<void> {
    const world = this.world();
    let chosen: number | null = null;
    const book = renderBook(world, (id) => {
      chosen = id;
      this.panel.close();
    });
    this.showing = true;
    this.gate.pause();
    try {
      await this.panel.open(world.courseName, book);
    } finally {
      this.showing = false;
      this.gate.resume();
    }
    if (chosen !== null) {
      this.goTo(chosen);
    }
  }
}
