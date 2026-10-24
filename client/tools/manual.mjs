// Manual completion e2e on the dev page: node tools/manual.mjs -> the toggle marks cm 41 done, closing updates store + prop flag
import { createServer } from 'vite';
import { loadChromium } from './playwright.mjs';

const CM = 41;
const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await (await loadChromium()).launch({ headless: true, args: ['--mute-audio', '--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto(`${server.resolvedUrls.local[0]}?manual=${CM}`);
  await page.waitForFunction(() => window.mooblox?.interaction, null, { timeout: 60000 });
  const state = () => page.evaluate((id) => ({
    store: window.mooblox.store.world.sections.flatMap((s) => s.activities).find((a) => a.id === id).completion.state,
    flag: window.mooblox.props.get(id).state.done,
  }), CM);
  check('starts not done', JSON.stringify(await state()) === '{"store":0,"flag":false}', JSON.stringify(await state()));
  await page.evaluate((id) => {
    const a = window.mooblox.store.world.sections.flatMap((s) => s.activities).find((v) => v.id === id);
    void window.mooblox.interaction.open(a);
  }, CM);
  const toggle = page.locator('.mooblox-panel .mooblox-done');
  await toggle.click();
  await page.waitForFunction(() => document.querySelector('.mooblox-done')?.getAttribute('aria-pressed') === 'true');
  check('toggle says Done', (await toggle.innerText()).trim() === 'Done');
  await page.keyboard.press('Escape');
  await page.waitForFunction((id) => window.mooblox.props.get(id).state.done === true, CM, { timeout: 5000 }).catch(() => {});
  check('close refreshes store and flag', JSON.stringify(await state()) === '{"store":1,"flag":true}', JSON.stringify(await state()));
} finally {
  await browser.close();
  await server.close();
}
const ok = checks.every(Boolean);
console.log(`manual: ${checks.filter(Boolean).length}/${checks.length} ${ok ? 'PASS' : 'FAIL'}`);
process.exit(ok ? 0 : 1);
