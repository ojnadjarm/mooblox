import { AnimationClip, Euler, Quaternion, QuaternionKeyframeTrack, Vector3 } from 'three';

/** The avatar states the controller drives. */
export type AvatarState = 'idle' | 'walk' | 'run' | 'jump' | 'fall' | 'sit';

/** Kenney clip per state; `jump`, `fall` and `sit` are ours (the pack has no jump or fall, and its sit is a still pose). */
export const CLIP_FOR: Readonly<Record<AvatarState, string>> = {
  idle: 'idle',
  walk: 'walk',
  run: 'sprint',
  jump: 'jump',
  fall: 'fall',
  sit: 'sit-swing',
};

/** Height of the seat under a sitting kid above its feet origin (m): the hip pivot less half a leg, so root y = seat top - SEAT. */
export const SEAT = 0.8;

const X = new Vector3(1, 0, 0);

/** Roblox-style jump pose: both arms straight up, one knee forward. */
export function jumpClip(): AnimationClip {
  const pose = (node: string, angles: number[]): QuaternionKeyframeTrack => {
    const values = angles.flatMap((a) => new Quaternion().setFromAxisAngle(X, a).toArray());
    return new QuaternionKeyframeTrack(`${node}.quaternion`, [0, 0.12, 0.6], values);
  };
  return new AnimationClip('jump', 0.6, [
    pose('arm-left', [0, -2.9, -2.9]),
    pose('arm-right', [0, -2.9, -2.9]),
    pose('leg-left', [0, -0.6, -0.6]),
    pose('leg-right', [0, 0.25, 0.25]),
  ]);
}

/** Roblox-style fall pose after the apex: arms swing out and up to the sides, legs part, a slight flail. */
export function fallClip(): AnimationClip {
  const t = [0, 0.18, 0.5, 0.82];
  return new AnimationClip('fall', 0.82, [
    turns('arm-left', t, [[-2.9, 0, 0], [-0.5, 0, 1.9], [-0.4, 0, 2.1], [-0.5, 0, 1.9]]),
    turns('arm-right', t, [[-2.9, 0, 0], [-0.5, 0, -1.9], [-0.6, 0, -1.75], [-0.5, 0, -1.9]]),
    turns('leg-left', t, [[-0.6, 0, 0], [-0.35, 0, 0.12], [-0.3, 0, 0.14], [-0.35, 0, 0.12]]),
    turns('leg-right', t, [[0.25, 0, 0], [0.3, 0, -0.12], [0.35, 0, -0.14], [0.3, 0, -0.12]]),
    turns('head', t, [[0, 0, 0], [0.12, 0, 0], [0.14, 0, 0], [0.12, 0, 0]]),
  ]);
}

/** Seated loop: legs out front, the feet kicking up in turn (never down through a bench or the ground), hands on the seat's front edge, a small rock. */
export function sitClip(): AnimationClip {
  const t = [0, 0.6, 1.2, 1.8, 2.4];
  const leg = (a: number): [number, number, number] => [-1.57 - a, 0, 0];
  return new AnimationClip('sit-swing', 2.4, [
    turns('leg-left', t, [leg(0), leg(0.22), leg(0.04), leg(0), leg(0)]),
    turns('leg-right', t, [leg(0), leg(0), leg(0), leg(0.2), leg(0)]),
    turns('arm-left', t, [[-0.45, 0, 0.08], [-0.5, 0, 0.08], [-0.45, 0, 0.08], [-0.5, 0, 0.08], [-0.45, 0, 0.08]]),
    turns('arm-right', t, [[-0.45, 0, -0.08], [-0.5, 0, -0.08], [-0.45, 0, -0.08], [-0.5, 0, -0.08], [-0.45, 0, -0.08]]),
    turns('torso', t, [[0.04, 0, 0], [0.07, 0, 0.02], [0.04, 0, 0], [0.07, 0, -0.02], [0.04, 0, 0]]),
  ]);
}

/** A rotation track on `node` through (x, y, z) Euler poses at `times`. */
function turns(node: string, times: number[], poses: [number, number, number][]): QuaternionKeyframeTrack {
  const q = new Quaternion();
  const values = poses.flatMap(([x, y, z]) => q.setFromEuler(new Euler(x, y, z)).toArray());
  return new QuaternionKeyframeTrack(`${node}.quaternion`, times, values);
}

/** Our idle acts (the pack's emote-yes and emote-no are the others): a wave, a two-pump cheer, a slow stretch. */
export function actClips(): AnimationClip[] {
  const w = [0, 0.18, 0.36, 0.54, 0.72, 0.9, 1.1, 1.3];
  const wave = new AnimationClip('wave', 1.3, [
    turns('arm-right', w, [[0, 0, 0], [-0.3, 0, -2.5], [-0.3, 0, -2.9], [-0.3, 0, -2.4], [-0.3, 0, -2.9], [-0.3, 0, -2.4], [-0.3, 0, -2.6], [0, 0, 0]]),
    turns('head', w, [[0, 0, 0], [-0.08, 0, 0.12], [-0.08, 0, 0.12], [-0.08, 0, 0.12], [-0.08, 0, 0.12], [-0.08, 0, 0.12], [-0.08, 0, 0.1], [0, 0, 0]]),
    turns('torso', w, [[0, 0, 0], [0, 0, 0.06], [0, 0, 0.08], [0, 0, 0.05], [0, 0, 0.08], [0, 0, 0.05], [0, 0, 0.06], [0, 0, 0]]),
  ]);
  const c = [0, 0.15, 0.32, 0.48, 0.65, 0.82, 1.05];
  const up = (a: number): [number, number, number] => [a, 0, 0];
  const cheer = new AnimationClip('cheer', 1.05, [
    turns('arm-left', c, [up(0), up(-2.5), up(-3.05), up(-2.5), up(-3.05), up(-2.6), up(0)]),
    turns('arm-right', c, [up(0), up(-2.5), up(-3.05), up(-2.5), up(-3.05), up(-2.6), up(0)]),
    turns('head', c, [up(0), up(-0.15), up(-0.25), up(-0.15), up(-0.25), up(-0.15), up(0)]),
    turns('torso', c, [up(0), up(0.05), up(-0.08), up(0.05), up(-0.08), up(0), up(0)]),
  ]);
  const s = [0, 0.55, 1.25, 1.8];
  const stretch = new AnimationClip('stretch', 1.8, [
    turns('arm-left', s, [[0, 0, 0], [-0.2, 0, 2.6], [-0.25, 0, 2.75], [0, 0, 0]]),
    turns('arm-right', s, [[0, 0, 0], [-0.2, 0, -2.6], [-0.25, 0, -2.75], [0, 0, 0]]),
    turns('head', s, [[0, 0, 0], [-0.3, 0, 0], [-0.32, 0, 0], [0, 0, 0]]),
    turns('torso', s, [[0, 0, 0], [-0.12, 0, 0], [-0.14, 0, 0], [0, 0, 0]]),
  ]);
  return [wave, cheer, stretch];
}
