/** Wire shapes of local_mooblox_get_rewards, claim_collectible and set_look (see classes/external/). */
export interface QuestDto {
  id: string;
  kind: string;
  name: string;
  text: string;
  done: number;
  total: number;
  complete: boolean;
  /** Item the quest unlocks, empty when none. */
  reward: string;
}

export interface CollectibleDto {
  key: string;
  kind: string;
  sectionid: number;
  /** Activity of a gem, 0 for crystals and stars. */
  cmid: number;
  unlocked: boolean;
  found: boolean;
}

export interface LookDto {
  hat: string;
  outfit: string;
  pet: string;
}

export interface TrophyDto {
  badgeid: number;
  name: string;
  image: string;
  timeissued: number;
}

export interface RewardsDto {
  enabled: boolean;
  xp: number;
  level: number;
  peaklevel: number;
  levelstart: number;
  levelnext: number;
  quests: QuestDto[];
  collectibles: CollectibleDto[];
  unlocks: string[];
  look: LookDto;
  trophies: TrophyDto[];
}

export interface ClaimDto {
  key: string;
  found: number;
}
