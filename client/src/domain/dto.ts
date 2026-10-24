/** Wire shape of local_mooblox_get_world (see classes/external/get_world.php). */
export interface DateDto {
  label: string;
  timestamp: number;
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
  completion: number;
  state: number;
  isautomatic: boolean;
  dates: DateDto[];
}

export interface SectionDto {
  id: number;
  number: number;
  name: string;
  available: boolean;
  availableinfo: string;
  modules: ModuleDto[];
}

export interface WorldDto {
  courseid: number;
  coursename: string;
  firstname: string;
  sections: SectionDto[];
}
