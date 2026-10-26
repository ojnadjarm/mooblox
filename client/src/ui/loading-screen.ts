/** Fades out and removes the server-drawn loading screen (play.php and index.php), if the page has one. */
export function dismissLoading(doc: Document = document): void {
  const screen = doc.querySelector<HTMLElement>('.local-mooblox-loading');
  if (!screen) return;
  screen.classList.add('is-done');
  setTimeout(() => screen.remove(), 500);
}
