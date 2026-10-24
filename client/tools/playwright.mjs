// Loads playwright-core from PLAYWRIGHT_CORE or the global Playwright MCP install (no npm dependency).
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export async function loadChromium() {
  const guess = join(dirname(dirname(process.execPath)), 'lib/node_modules/@playwright/mcp/node_modules/playwright-core/index.mjs');
  const path = process.env.PLAYWRIGHT_CORE ?? guess;
  if (!existsSync(path)) {
    throw new Error(`playwright-core not found at ${path}; set PLAYWRIGHT_CORE`);
  }
  return (await import(path)).chromium;
}
