import type { CourseListGateway, MapCourse } from '../map/courses';
import { startMap } from './map';

const NAMES = ['Volcanoes', 'Ocean friends', 'Space camp', 'Dinosaurs', 'Fractions fun', 'Rainforest', 'Robots 101', 'Music makers', 'Weather watch',
  'Ancient Egypt', 'Plants and seeds', 'Story writing', 'My body', 'Maps and flags', 'Coding with blocks', 'Healthy food'];

/** Dev page course list (`?n=` courses, `?done=` finished ones): the first course has an image, some are free browse. */
function fakeCourses(n: number, done: number): MapCourse[] {
  const day = 86400;
  const now = Math.floor(Date.now() / 1000);
  return Array.from({ length: n }, (_, i) => ({
    id: 100 + i,
    fullname: i < NAMES.length ? NAMES[i]! : `${NAMES[i % NAMES.length]} ${Math.floor(i / NAMES.length) + 1}`,
    summary: i % 3 === 2 ? '' : 'Explore the island, watch the videos and try the quiz. Every activity you finish fills your ring.',
    image: '',
    progress: i < done ? 100 : i % 4 === 3 ? -1 : (i * 37) % 100,
    completed: i < done,
    lastaccess: i % 5 === 4 ? 0 : now - (i % 7) * day,
    url: `play.html?id=${100 + i}`,
  }));
}

const params = new URLSearchParams(location.search);
const n = Number(params.get('n') ?? 6);
const done = Number(params.get('done') ?? Math.min(1, n));
const gateway: CourseListGateway & { savePreference(name: string, value: string): Promise<void> } = {
  getCourses: async () => fakeCourses(n, done),
  savePreference: async () => undefined,
};
const root = document.getElementById('mooblox-root')!;
const assets = new URL('/assets/', location.href).href;
startMap(root, { gateway, strings: {}, assets, sound: 'off70', navigate: (url) => (root.dataset['navigated'] = url) })
  .then((map) => Object.assign(window, { mooblox: map }))
  .catch((e: unknown) => console.error('mooblox: map failed', e));
