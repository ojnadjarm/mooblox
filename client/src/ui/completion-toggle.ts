import { CompletionTracking, isDone, type Activity } from '../domain/types';
import { injectStyle, UI_FONT } from './style';

const CSS = `
.mooblox-done { min-height: 44px; padding: 0 16px; border-radius: 999px; border: 3px solid #fff; background: transparent; color: #fff;
  font: 800 16px ${UI_FONT}; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; }
.mooblox-done[aria-pressed="true"] { background: #2fbf4a; }
.mooblox-done:disabled { opacity: .6; cursor: progress; }
.mooblox-done svg { width: 18px; height: 18px; }
`;

const TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

/** "Mark as done" button for an activity with manual completion; none for any other. */
export function completionToggle(a: Activity, save: (done: boolean) => Promise<void>): HTMLElement[] {
  if (!a.available || a.completion.tracking !== CompletionTracking.Manual) {
    return [];
  }
  injectStyle('mooblox-done-style', CSS);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mooblox-done';
  let done = isDone(a.completion);
  const render = (): void => {
    button.setAttribute('aria-pressed', String(done));
    button.innerHTML = `${TICK}<span>${done ? 'Done' : 'Mark as done'}</span>`;
  };
  render();
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await save(!done);
      done = !done;
    } catch (e) {
      console.error('mooblox: manual completion failed', e);
    } finally {
      button.disabled = false;
      render();
    }
  });
  return [button];
}
