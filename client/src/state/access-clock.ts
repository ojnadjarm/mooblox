/** Longest single wait; setTimeout overflows past 2^31 ms and a long sleep should re-check anyway. */
const MAX_WAIT_MS = 6 * 60 * 60 * 1000;
/** Margin after the date so the server already sees it as passed. */
const AFTER_MS = 1500;

/** Re-reads the course when the earliest pending restriction date passes while playing. */
export class AccessClock {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly due: () => void,
    private readonly now: () => number = Date.now,
  ) {}

  /** Arms one timer for `nextChange` (epoch s); 0 disarms. */
  schedule(nextChange: number): void {
    this.cancel();
    if (nextChange <= 0) {
      return;
    }
    const wait = Math.max(0, nextChange * 1000 + AFTER_MS - this.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      this.due();
    }, Math.min(wait, MAX_WAIT_MS));
  }

  cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
