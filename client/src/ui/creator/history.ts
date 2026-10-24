import type { CharacterLook } from '../../player/character/look';

/** Undo stack of looks; the top is the current one. */
export class LookHistory {
  private readonly stack: CharacterLook[];

  constructor(initial: CharacterLook) {
    this.stack = [initial];
  }

  get current(): CharacterLook {
    return this.stack[this.stack.length - 1]!;
  }

  get canUndo(): boolean {
    return this.stack.length > 1;
  }

  /** Records a new look; an identical one is ignored. */
  push(look: CharacterLook): void {
    if (JSON.stringify(look) !== JSON.stringify(this.current)) {
      this.stack.push(look);
    }
  }

  undo(): CharacterLook {
    if (this.canUndo) {
      this.stack.pop();
    }
    return this.current;
  }

  /** Starts over from `look`, forgetting the past. */
  reset(look: CharacterLook): void {
    this.stack.length = 0;
    this.stack.push(look);
  }
}
