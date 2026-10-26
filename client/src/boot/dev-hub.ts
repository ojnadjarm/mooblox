import type { CourseListGateway, HubCourse } from '../hub/courses';
import { startHub } from './hub';

const NAMES = ['Volcanoes', 'Ocean friends', 'Space camp', 'Dinosaurs', 'Fractions fun', 'Rainforest', 'Robots 101', 'Music makers', 'Weather watch',
  'Ancient Egypt', 'Plants and seeds', 'Story writing', 'My body', 'Maps and flags', 'Coding with blocks', 'Healthy food'];
const BADGES = ['Island champion', 'Quiz whiz', 'Bookworm', 'Explorer', 'Star reader', 'Team player'];

/** Dev page course list (`?n=` courses, `?done=` finished ones, `?trophies=` badges spread over them): some never visited, some free browse. */
function fakeCourses(n: number, done: number, trophies: number): HubCourse[] {
  const day = 86400;
  const now = Math.floor(Date.now() / 1000);
  return Array.from({ length: n }, (_, i) => {
    const gemstotal = 4 + ((i * 5) % 9);
    return {
      id: 100 + i,
      fullname: i < NAMES.length ? NAMES[i]! : `${NAMES[i % NAMES.length]} ${Math.floor(i / NAMES.length) + 1}`,
      summary: '',
      image: '',
      progress: i < done ? 100 : i % 4 === 3 ? -1 : (i * 37) % 100,
      completed: i < done,
      lastaccess: i % 5 === 4 ? 0 : now - (i % 7) * day - i,
      url: `play.html?id=${100 + i}`,
      xp: i < done ? 160 : (i * 23) % 90,
      level: 1,
      gems: i < done ? gemstotal : (i * 3) % gemstotal,
      gemstotal,
      crystals: i < done ? 3 : i % 3,
      stars: i % 4,
      trophies: Array.from({ length: trophies }, (_, k) => k).filter((k) => k % Math.max(1, n) === i)
        .map((k) => ({ badgeid: 500 + k, name: BADGES[k % BADGES.length]!, image: '', timeissued: now - (trophies - k) * day })),
    };
  });
}

const params = new URLSearchParams(location.search);
const n = Number(params.get('n') ?? 6);
const done = Number(params.get('done') ?? Math.min(1, n));
const trophies = Number(params.get('trophies') ?? 3);
const gateway: CourseListGateway & { savePreference(name: string, value: string): Promise<void> } = {
  getCourses: async () => fakeCourses(n, done, trophies),
  savePreference: async () => undefined,
};
const root = document.getElementById('mooblox-root')!;
const assets = new URL('/assets/', location.href).href;
const deps = { gateway, strings: {}, assets, avatar: params.get('avatar') ?? '', sound: 'off70', from: Number(params.get('from') ?? 0), navigate: (url: string) => (root.dataset['navigated'] = url) };
startHub(root, deps)
  .then((hub) => Object.assign(window, { mooblox: hub }))
  .catch((e: unknown) => console.error('mooblox: hub failed', e));
