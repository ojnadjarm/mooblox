import type { MoodleGateway } from './gateway';

/** Touches the Moodle session every `everyMs`; returns the stop function. */
export function keepSessionAlive(
  gateway: Pick<MoodleGateway, 'touchSession'>,
  everyMs: number,
  onError: (e: unknown) => void,
): () => void {
  const id = setInterval(() => {
    gateway.touchSession().catch(onError);
  }, everyMs);
  return () => clearInterval(id);
}
