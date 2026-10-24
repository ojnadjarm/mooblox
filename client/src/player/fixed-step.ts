const MAX_STEPS = 5;
const EPSILON = 1e-9;

/** Accumulator that turns variable frame times into fixed steps; returns the leftover fraction for interpolation. */
export class FixedStep {
  private acc = 0;

  constructor(readonly step: number) {}

  advance(dt: number, tick: () => void): number {
    this.acc = Math.min(this.acc + dt, this.step * MAX_STEPS + EPSILON);
    while (this.acc >= this.step - EPSILON) {
      tick();
      this.acc -= this.step;
    }
    return Math.max(0, this.acc) / this.step;
  }
}
