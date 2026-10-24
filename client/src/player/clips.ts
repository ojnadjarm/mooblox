import { AnimationClip, Quaternion, QuaternionKeyframeTrack, Vector3 } from 'three';

/** The avatar states the controller drives. */
export type AvatarState = 'idle' | 'walk' | 'run' | 'jump';

/** Kenney clip per state; `jump` is ours (the pack has none). */
export const CLIP_FOR: Readonly<Record<AvatarState, string>> = {
  idle: 'idle',
  walk: 'walk',
  run: 'sprint',
  jump: 'jump',
};

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
