import type { CollectibleDto, LookDto, QuestDto, RewardsDto, TrophyDto } from './rewards-dto';
import type { Collectible, CollectibleKind, Look, Quest, QuestKind, Rewards, Trophy } from './rewards';

type Field = 'string' | 'number' | 'boolean';

const QUEST: Record<keyof QuestDto, Field> = {
  id: 'string', kind: 'string', name: 'string', text: 'string', done: 'number', total: 'number', complete: 'boolean', reward: 'string',
};
const COLLECTIBLE: Record<keyof CollectibleDto, Field> = {
  key: 'string', kind: 'string', sectionid: 'number', cmid: 'number', unlocked: 'boolean', found: 'boolean',
};
const LOOK: Record<keyof LookDto, Field> = { hat: 'string', outfit: 'string', pet: 'string' };
const TROPHY: Record<keyof TrophyDto, Field> = { badgeid: 'number', name: 'string', image: 'string', timeissued: 'number' };
const SCALARS = { enabled: 'boolean', xp: 'number', level: 'number', peaklevel: 'number', levelstart: 'number', levelnext: 'number' } as const;
const QUEST_KINDS = new Set<string>(['section', 'video', 'quiz', 'page', 'badge', 'course']);
const COLLECTIBLE_KINDS = new Set<string>(['gem', 'crystal', 'star']);

/** Throws unless the value has exactly the get_rewards wire shape (no missing, extra or mistyped fields). */
export function assertRewardsDto(value: unknown): asserts value is RewardsDto {
  const lists = { quests: QUEST, collectibles: COLLECTIBLE, trophies: TROPHY };
  const o = record(value, 'rewards', [...Object.keys(SCALARS), ...Object.keys(lists), 'unlocks', 'look']);
  for (const [k, t] of Object.entries(SCALARS)) {
    field(o[k], t, k);
  }
  for (const [k, spec] of Object.entries(lists)) {
    list(o[k], k).forEach((item, i) => shaped(item, spec, `${k}[${i}]`));
  }
  list(o.unlocks, 'unlocks').forEach((item, i) => field(item, 'string', `unlocks[${i}]`));
  shaped(o.look, LOOK, 'look');
}

/** Maps the get_rewards reply to domain objects. */
export function toRewards(dto: RewardsDto): Rewards {
  return {
    enabled: dto.enabled,
    xp: dto.xp,
    level: dto.level,
    peakLevel: dto.peaklevel,
    levelStart: dto.levelstart,
    levelNext: dto.levelnext,
    quests: dto.quests.map(toQuest),
    collectibles: dto.collectibles.map(toCollectible),
    unlocks: [...dto.unlocks],
    look: toLook(dto.look),
    trophies: dto.trophies.map(toTrophy),
  };
}

/** Maps domain rewards back to the get_rewards wire shape. */
export function toRewardsDto(r: Rewards): RewardsDto {
  return {
    enabled: r.enabled,
    xp: r.xp,
    level: r.level,
    peaklevel: r.peakLevel,
    levelstart: r.levelStart,
    levelnext: r.levelNext,
    quests: r.quests.map((q) => ({ id: q.id, kind: q.kind, name: q.name, text: q.text, done: q.done, total: q.total,
      complete: q.complete, reward: q.reward ?? '' })),
    collectibles: r.collectibles.map((c) => ({ key: c.key, kind: c.kind, sectionid: c.sectionId, cmid: c.cmId ?? 0,
      unlocked: c.unlocked, found: c.found })),
    unlocks: [...r.unlocks],
    look: toLookDto(r.look),
    trophies: r.trophies.map((t) => ({ badgeid: t.badgeId, name: t.name, image: t.imageUrl, timeissued: t.timeIssued })),
  };
}

/** Maps a set_look reply or argument between wire ('' = none) and domain (null = none). */
export function toLook(dto: LookDto): Look {
  return { hat: dto.hat || null, outfit: dto.outfit || null, pet: dto.pet || null };
}

export function toLookDto(look: Look): LookDto {
  return { hat: look.hat ?? '', outfit: look.outfit ?? '', pet: look.pet ?? '' };
}

function toQuest(dto: QuestDto): Quest {
  return {
    id: dto.id,
    kind: QUEST_KINDS.has(dto.kind) ? (dto.kind as QuestKind) : 'section',
    name: dto.name,
    text: dto.text,
    done: dto.done,
    total: dto.total,
    complete: dto.complete,
    reward: dto.reward || null,
  };
}

function toCollectible(dto: CollectibleDto): Collectible {
  return {
    key: dto.key,
    kind: COLLECTIBLE_KINDS.has(dto.kind) ? (dto.kind as CollectibleKind) : 'gem',
    sectionId: dto.sectionid,
    cmId: dto.cmid || null,
    unlocked: dto.unlocked,
    found: dto.found,
  };
}

function toTrophy(dto: TrophyDto): Trophy {
  return { badgeId: dto.badgeid, name: dto.name, imageUrl: dto.image, timeIssued: dto.timeissued };
}

function record(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${path} is not an object`);
  }
  const got = Object.keys(value).sort().join(',');
  const want = [...keys].sort().join(',');
  if (got !== want) {
    throw new TypeError(`${path} has fields ${got}, expected ${want}`);
  }
  return value as Record<string, unknown>;
}

function shaped(value: unknown, spec: Record<string, Field>, path: string): void {
  const o = record(value, path, Object.keys(spec));
  for (const [k, t] of Object.entries(spec)) {
    field(o[k], t, `${path}.${k}`);
  }
}

function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${path} is not a list`);
  }
  return value;
}

function field(value: unknown, type: Field, path: string): void {
  if (typeof value !== type) {
    throw new TypeError(`${path} is ${typeof value}, expected ${type}`);
  }
}
