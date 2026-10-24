import type { ModuleDto, SectionDto, WorldDto } from './dto';
import type { Activity, Section, WorldData } from './types';

/** Maps the get_world reply to domain objects. */
export function toWorld(dto: WorldDto): WorldData {
  return {
    courseId: dto.courseid,
    courseName: dto.coursename,
    firstName: dto.firstname,
    sections: dto.sections.map(toSection),
  };
}

/** Maps domain objects back to the get_world wire shape. */
export function toDto(world: WorldData): WorldDto {
  return {
    courseid: world.courseId,
    coursename: world.courseName,
    firstname: world.firstName,
    sections: world.sections.map((s) => ({
      id: s.id,
      number: s.number,
      name: s.name,
      available: s.available,
      availableinfo: s.availableInfo,
      modules: s.activities.map(toModuleDto),
    })),
  };
}

function toSection(dto: SectionDto): Section {
  return {
    id: dto.id,
    number: dto.number,
    name: dto.name,
    available: dto.available,
    availableInfo: dto.availableinfo,
    activities: dto.modules.map((m) => toActivity(m, dto.id)),
  };
}

function toActivity(dto: ModuleDto, sectionId: number): Activity {
  return {
    id: dto.id,
    sectionId,
    modname: dto.modname,
    name: dto.name,
    url: dto.url,
    purpose: dto.purpose,
    iconUrl: dto.icon,
    available: dto.available,
    availableInfo: dto.availableinfo,
    completion: { tracking: dto.completion, state: dto.state, automatic: dto.isautomatic },
    dates: dto.dates.map((d) => ({ label: d.label, timestamp: d.timestamp })),
  };
}

function toModuleDto(a: Activity): ModuleDto {
  return {
    id: a.id,
    modname: a.modname,
    name: a.name,
    url: a.url,
    purpose: a.purpose,
    icon: a.iconUrl,
    available: a.available,
    availableinfo: a.availableInfo,
    completion: a.completion.tracking,
    state: a.completion.state,
    isautomatic: a.completion.automatic,
    dates: a.dates.map((d) => ({ label: d.label, timestamp: d.timestamp })),
  };
}
