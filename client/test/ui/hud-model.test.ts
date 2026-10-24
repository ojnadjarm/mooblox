import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/get_rewards_demo.json';
import type { RewardsDto } from '../../src/domain/rewards-dto';
import { toRewards } from '../../src/domain/rewards-mapper';
import type { Quest, Rewards } from '../../src/domain/rewards';
import { fill, hudView, nextQuest } from '../../src/ui/hud-model';

const demo = (): Rewards => toRewards(structuredClone(fixture) as RewardsDto);
const quest = (id: string, done: number, total: number, complete = done >= total): Quest => ({ id, kind: 'section', name: id, text: `Finish ${id}`, done, total, complete, reward: null });

describe('hudView', () => {
  it('shows level, XP share and the open quest closest to done', () => {
    const v = hudView(demo(), null)!;
    expect(v.level).toBe(0);
    expect(v.levelLabel).toBe('Level 0');
    expect(v.xpLabel).toBe('45 / 50 XP');
    expect(v.fraction).toBeCloseTo(0.9);
    expect(v.quest).toBe('Read every page');
    expect(v.progress).toBe('3/4');
    expect(v.weeks).toBeNull();
  });

  it('measures the bar from the start of the current level', () => {
    const v = hudView({ ...demo(), xp: 80, level: 1, levelStart: 50, levelNext: 150 }, null)!;
    expect(v.fraction).toBeCloseTo(0.3);
    expect(v.levelLabel).toBe('Level 1');
  });

  it('clamps the bar and survives an empty level span', () => {
    expect(hudView({ ...demo(), xp: 400, levelStart: 50, levelNext: 150 }, null)!.fraction).toBe(1);
    expect(hudView({ ...demo(), xp: 10, levelStart: 50, levelNext: 150 }, null)!.fraction).toBe(0);
    expect(hudView({ ...demo(), levelStart: 50, levelNext: 50 }, null)!.fraction).toBe(1);
  });

  it('cheers when every quest is done', () => {
    const v = hudView({ ...demo(), quests: [quest('a', 2, 2)] }, null)!;
    expect(v.quest).toBe('Every quest done!');
    expect(v.progress).toBe('');
  });

  it('counts learning weeks without a zero or a loss', () => {
    expect(hudView(demo(), 1)!.weeks).toBe('1 learning week');
    expect(hudView(demo(), 3)!.weeks).toBe('3 learning weeks');
    expect(hudView(demo(), 0)!.weeks).toBeNull();
  });

  it('builds no HUD when rewards are off', () => {
    expect(hudView({ ...demo(), enabled: false }, 2)).toBeNull();
  });

  it('uses the lang strings it is given', () => {
    const v = hudView(demo(), 2, { hud_level: 'Nivel {level}', hud_xp: '{xp}/{next}', hud_progress: '{done} de {total}', hud_alldone: '!', hud_week: '1 semana', hud_weeks: '{weeks} semanas', hud_welcome: '¡Hola!' })!;
    expect([v.levelLabel, v.xpLabel, v.progress, v.weeks]).toEqual(['Nivel 0', '45/50', '3 de 4', '2 semanas']);
  });

  it('greets a returning kid on the first week after a break', () => {
    const back = { ...demo(), weeks: { count: 1, welcomeBack: true } };
    expect(hudView(back, 1)!.weeks).toBe('Welcome back!');
    expect(hudView({ ...back, weeks: { count: 2, welcomeBack: false } }, 2)!.weeks).toBe('2 learning weeks');
  });
});

describe('nextQuest', () => {
  it('keeps server order on a tie and skips zero-sized quests', () => {
    expect(nextQuest([quest('a', 1, 2), quest('b', 1, 2)])!.id).toBe('a');
    expect(nextQuest([quest('z', 0, 0, false), quest('b', 1, 3)])!.id).toBe('b');
    expect(nextQuest([])).toBeNull();
  });
});

describe('fill', () => {
  it('leaves unknown placeholders alone', () => {
    expect(fill('{a} {b}', { a: 1 })).toBe('1 {b}');
  });
});
