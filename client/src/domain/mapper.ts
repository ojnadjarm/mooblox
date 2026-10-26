import type { MediaDto, ModuleDto, SectionDto, WorldDto } from './dto';
import type { Activity, Media, Section, WorldData } from './types';

/** Maps the get_world reply to domain objects. */
export function toWorld(dto: WorldDto): WorldData {
  return {
    courseId: dto.courseid,
    courseName: dto.coursename,
    firstName: dto.firstname,
    sections: dto.sections.map(toSection),
    nextChange: dto.nextchange ?? 0,
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
      lock: s.lock,
      modules: s.activities.map(toModuleDto),
    })),
    nextchange: world.nextChange,
  };
}

function toSection(dto: SectionDto): Section {
  return {
    id: dto.id,
    number: dto.number,
    name: dto.name,
    available: dto.available,
    availableInfo: dto.availableinfo,
    lock: dto.lock ?? '',
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
    lock: dto.lock ?? '',
    completion: { tracking: dto.completion, state: dto.state, automatic: dto.isautomatic, done: dto.done ?? false },
    dates: dto.dates.map((d) => ({ label: d.label, timestamp: d.timestamp })),
    media: toMedia(dto.media),
  };
}

function toMedia(dto: MediaDto | undefined): Media | null {
  if (dto?.type !== 'file' && dto?.type !== 'link') {
    return null;
  }
  return { type: dto.type, mimetype: dto.mimetype, src: dto.src };
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
    lock: a.lock,
    completion: a.completion.tracking,
    state: a.completion.state,
    isautomatic: a.completion.automatic,
    done: a.completion.done ?? false,
    dates: a.dates.map((d) => ({ label: d.label, timestamp: d.timestamp })),
    media: a.media ? { ...a.media } : { type: '', mimetype: '', src: '' },
  };
}
