/** Something the E key can do: its distance from the kid while it is on offer (null when not), and the action. */
export interface EAction {
  distance(): number | null;
  run(): void;
}

/** The one E key handler of a page: each press runs only the nearest action on offer. */
export class EKey {
  private readonly actions = new Set<EAction>();

  constructor(target: Pick<Window, 'addEventListener'>) {
    target.addEventListener('keydown', (e) => {
      if (e.repeat || e.code !== 'KeyE' || e.target instanceof HTMLInputElement) return;
      const a = this.pick();
      if (!a) return;
      e.preventDefault();
      a.run();
    });
  }

  /** Offers an action; returns its removal. */
  add(action: EAction): () => void {
    this.actions.add(action);
    return () => this.actions.delete(action);
  }

  /** The action a press would run now. */
  pick(): EAction | null {
    let best: EAction | null = null;
    let bestD = Infinity;
    for (const a of this.actions) {
      const d = a.distance();
      if (d !== null && d < bestD) {
        best = a;
        bestD = d;
      }
    }
    return best;
  }
}

let shared: EKey | null = null;

/** The page's E key handler (created on first use). */
export function eKey(): EKey {
  return (shared ??= new EKey(window));
}
