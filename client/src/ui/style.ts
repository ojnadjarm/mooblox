/** Adds a stylesheet once per id. */
export function injectStyle(id: string, css: string): void {
  if (!document.getElementById(id)) {
    const style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }
}

/** Plain text of a Moodle HTML snippet (restriction info). */
export function htmlToText(html: string): string {
  const t = document.createElement('template');
  t.innerHTML = html;
  return (t.content.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** The rounded UI font stack shared by every overlay. */
export const UI_FONT = '"Nunito", "Fredoka", "Trebuchet MS", system-ui, sans-serif';
