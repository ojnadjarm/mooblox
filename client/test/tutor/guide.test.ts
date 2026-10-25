import { AnimationClip, Object3D, PerspectiveCamera, Quaternion, QuaternionKeyframeTrack, Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { focus } from '../../src/player/attention';
import { Avatar } from '../../src/player/avatar';
import { actClips, fallClip, jumpClip, sitClip } from '../../src/player/clips';
import { Guide, DEFAULT_GUIDE_STRINGS } from '../../src/tutor/guide';

/** A stand-in DOM element: enough for the bubble. */
function element(): Record<string, unknown> {
  return { style: {}, hidden: false, textContent: '', offsetWidth: 200, offsetHeight: 80, clientWidth: 1280, clientHeight: 720, appendChild: () => {}, addEventListener: () => {}, setAttribute: () => {}, querySelector: () => element() };
}

/** The Kenney rig's nodes with its loops, the pack's two emotes and our acts. */
function rig(): { root: Object3D; clips: AnimationClip[] } {
  const root = new Object3D();
  const bone = (name: string, parent: Object3D): Object3D => {
    const o = new Object3D();
    o.name = name;
    parent.add(o);
    return o;
  };
  const torso = bone('torso', bone('root', root));
  for (const n of ['arm-left', 'arm-right', 'head']) bone(n, torso);
  const q = new Quaternion().toArray();
  const loop = (name: string, d: number) => new AnimationClip(name, d, [new QuaternionKeyframeTrack('arm-left.quaternion', [0, d], [...q, ...q])]);
  return { root, clips: [loop('idle', 1.33), loop('walk', 0.67), loop('sprint', 0.5), jumpClip(), fallClip(), sitClip(), loop('emote-yes', 0.67), loop('emote-no', 0.67), ...actClips()] };
}

describe('the Guide', () => {
  beforeEach(() => vi.stubGlobal('document', { getElementById: () => ({}), createElement: element, head: element() }));
  afterEach(() => vi.unstubAllGlobals());

  it('greets an arriving player with a wave first, then talks with its hands twice, and again for each new line', () => {
    const space = new Object3D();
    const { root, clips } = rig();
    space.add(root);
    const guide = new Guide(new Avatar(root, clips, 3), new PerspectiveCamera(), element() as unknown as HTMLElement, DEFAULT_GUIDE_STRINGS, () => {});
    guide.say({ text: 'Hi!', activityId: null });
    const far = new Vector3(0, 0, 20);
    for (let i = 0; i < 60; i++) guide.update(1 / 60, far);
    expect(guide.avatar.acting).toBeNull();
    const near = new Vector3(0, 0, 3);
    Object.assign(focus, { owner: null, space, x: 0, y: 0, z: 3 });
    try {
      const acts: string[] = [];
      for (let i = 0; i < 60 * 9; i++) {
        guide.update(1 / 60, near);
        const a = guide.avatar.acting;
        if (a && a !== acts[acts.length - 1]) acts.push(a);
        else if (!a && acts[acts.length - 1] !== '-') acts.push('-');
      }
      expect(acts.filter((a) => a !== '-').slice(0, 3)).toEqual(['wave', 'talk', 'talk']);
      expect(acts.filter((a) => a === 'talk')).toHaveLength(2);
      guide.say({ text: 'Next!', activityId: 7 });
      let talked = false;
      for (let i = 0; i < 60 * 3 && !talked; i++) {
        guide.update(1 / 60, near);
        talked = guide.avatar.acting === 'talk';
      }
      expect(talked).toBe(true);
    } finally {
      Object.assign(focus, { owner: null, space: null });
    }
  });
});
