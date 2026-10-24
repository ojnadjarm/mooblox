import type { WorldData } from '../domain/types';
import type { FrameGate } from '../perf/frame-gate';
import { bookButton, bookTabs, renderBook } from './book';
import type { Panel } from './panel';

/** An extra page of the book (rewards pages); rendered fresh each time it is shown. */
export interface BookPage {
  readonly id: string;
  readonly label: string;
  render(): HTMLElement;
}

/** Opens the course book from the HUD button or key B; "Go there" closes it and hands the activity to `goTo`. */
export class BookController {
  private showing = false;
  private readonly pages: BookPage[] = [];
  private courseLabel = 'Course';

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

  /** Adds a page after the course list; with any page added the book shows tabs, the course list first. */
  addPage(page: BookPage, courseLabel?: string): void {
    if (this.pages.some((p) => p.id === page.id)) return;
    this.pages.push(page);
    if (courseLabel) this.courseLabel = courseLabel;
  }

  toggle(): void {
    if (this.showing) {
      this.panel.close();
    } else if (!this.panel.isOpen) {
      void this.open();
    }
  }

  /** Opens the book at a page id ('course' or an added page). */
  async open(pageId = 'course'): Promise<void> {
    const world = this.world();
    let chosen: number | null = null;
    const course: BookPage = {
      id: 'course',
      label: this.courseLabel,
      render: () =>
        renderBook(world, (id) => {
          chosen = id;
          this.panel.close();
        }),
    };
    const content = this.pages.length ? bookTabs([course, ...this.pages], pageId) : course.render();
    this.showing = true;
    this.gate.pause();
    try {
      await this.panel.open(world.courseName, content);
    } finally {
      this.showing = false;
      this.gate.resume();
    }
    if (chosen !== null) {
      this.goTo(chosen);
    }
  }
}
