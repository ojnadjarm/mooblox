import { describe, expect, it } from 'vitest';
import { ENTER_RADIUS, EXIT_RADIUS, nearestPlot } from '../../src/interaction/proximity';
import type { Plot } from '../../src/world/layout';

const plot = (activityId: number, x: number): Plot => ({ activityId, sectionId: 1, x, z: 0, radius: 2.5, facing: 0 });
const plots = [plot(1, 0), plot(2, 10)];

describe('nearestPlot', () => {
  it('picks the nearest plot within reach, none outside', () => {
    expect(nearestPlot(plots, 1, 0, null)?.activityId).toBe(1);
    expect(nearestPlot(plots, 9, 0, null)?.activityId).toBe(2);
    expect(nearestPlot(plots, 5, 0, null)).toBeNull();
  });

  it('keeps the current plot until the player leaves the exit radius', () => {
    const between = (ENTER_RADIUS + EXIT_RADIUS) / 2;
    expect(nearestPlot(plots, between, 0, null)).toBeNull();
    expect(nearestPlot(plots, between, 0, plots[0]!)?.activityId).toBe(1);
    expect(nearestPlot(plots, EXIT_RADIUS + 0.1, 0, plots[0]!)).toBeNull();
  });
});
