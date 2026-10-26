/** Wire shape of local_mooblox_get_world (see classes/external/get_world.php). */
export interface DateDto {
  label: string;
  timestamp: number;
}

export interface MediaDto {
  type: string;
  mimetype: string;
  src: string;
}

export interface ModuleDto {
  id: number;
  modname: string;
  name: string;
  url: string;
  purpose: string;
  icon: string;
  available: boolean;
  availableinfo: string;
  /** Short lock reason for signs, empty when open. */
  lock?: string;
  completion: number;
  state: number;
  isautomatic: boolean;
  /** Whether Moodle counts it complete (a failed grade counts unless a pass is needed). */
  done?: boolean;
  dates: DateDto[];
  media: MediaDto;
}

export interface SectionDto {
  id: number;
  number: number;
  name: string;
  available: boolean;
  availableinfo: string;
  lock?: string;
  modules: ModuleDto[];
}

export interface WorldDto {
  courseid: number;
  coursename: string;
  firstname: string;
  sections: SectionDto[];
  /** Earliest future restriction date (epoch s), 0 when none. */
  nextchange?: number;
}
