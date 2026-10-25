import { Vector3, type PerspectiveCamera } from 'three';
import type { Avatar } from '../player/avatar';
import { TALK } from '../player/idle-acts';
import { injectStyle, UI_FONT } from '../ui/style';
import type { TutorLine } from './tutor';

const CSS = `
.mooblox-bubble { position: absolute; left: 0; top: 0; z-index: 5; box-sizing: border-box; width: max-content;
  max-width: min(300px, calc(100vw - 32px)); padding: 10px 14px 12px; border-radius: 18px; background: #fff; border: 4px solid #ffc21a;
  box-shadow: 0 6px 16px rgba(0, 40, 80, .28); font: 700 16px/1.3 ${UI_FONT}; color: #2b2f3a; pointer-events: auto;
  will-change: transform; }
.mooblox-bubble[hidden] { display: none; }
.mooblox-bubble::after { content: ""; position: absolute; left: 50%; bottom: -14px; margin-left: -10px; border: 10px solid transparent;
  border-top-color: #ffc21a; border-bottom: 0; }
.mooblox-bubble-name { display: inline-block; margin-bottom: 4px; padding: 1px 10px; border-radius: 999px; background: #ffc21a;
  color: #2b2f3a; font-size: 13px; font-weight: 800; letter-spacing: .02em; }
.mooblox-bubble-go { display: block; margin-top: 8px; min-height: 40px; padding: 0 14px; border-radius: 999px; border: 0;
  background: #1e88e5; color: #fff; font: 800 15px ${UI_FONT}; cursor: pointer; }
.mooblox-bubble-go[hidden] { display: none; }
`;

/** Labels the guide shows besides its lines. */
export interface GuideStrings {
  readonly guide: string;
  readonly showme: string;
}

export const DEFAULT_GUIDE_STRINGS: GuideStrings = { guide: 'Guide', showme: 'Show me' };

const HEAD = 3.1;
const TALK_RANGE = 9;
const TURN = 6;
const MARGIN = 12;
/** Talk gestures per line (said, or met again on arrival), and seconds in range before the first (its greeting wave goes first). */
const TALKS = 2;
const TALK_DELAY = 0.6;

/** The "Guide" NPC: an avatar on the plaza with a speech bubble that follows its head. */
export class Guide {
  readonly bubble: HTMLElement;
  private readonly text: HTMLElement;
  private readonly go: HTMLButtonElement;
  private line: TutorLine | null = null;
  /** Talk gestures still to make for the line, and seconds the player has been in range. */
  private talks = 0;
  private near = 0;
  private readonly head = new Vector3();

  constructor(
    readonly avatar: Avatar,
    private readonly camera: PerspectiveCamera,
    private readonly host: HTMLElement,
    strings: GuideStrings,
    onShowMe: (activityId: number) => void,
  ) {
    injectStyle('mooblox-bubble-style', CSS);
    avatar.root.name = 'guide';
    this.bubble = document.createElement('div');
    this.bubble.className = 'mooblox-bubble';
    this.bubble.setAttribute('role', 'status');
    this.bubble.innerHTML = `<span class="mooblox-bubble-name"></span><div class="mooblox-bubble-text"></div>
      <button type="button" class="mooblox-bubble-go"></button>`;
    this.bubble.querySelector('.mooblox-bubble-name')!.textContent = strings.guide;
    this.text = this.bubble.querySelector('.mooblox-bubble-text')!;
    this.go = this.bubble.querySelector('.mooblox-bubble-go')!;
    this.go.textContent = strings.showme;
    this.go.addEventListener('click', () => this.line?.activityId && onShowMe(this.line.activityId));
    host.appendChild(this.bubble);
  }

  say(line: TutorLine): void {
    this.line = line;
    this.text.textContent = line.text;
    this.go.hidden = line.activityId === null;
    this.talks = TALKS;
  }

  /** Animates, turns towards a nearby player, talks with its hands when it has something to say and keeps the bubble over the head; call once per frame. */
  update(dt: number, player: Vector3): void {
    const root = this.avatar.root;
    const near = root.position.distanceTo(player) < TALK_RANGE;
    if (near && this.near === 0) this.talks = TALKS;
    this.near = near ? this.near + dt : 0;
    if (near && this.line && this.talks > 0 && this.near >= TALK_DELAY && this.avatar.acting === null && this.avatar.emote(TALK)) this.talks--;
    this.avatar.update(dt);
    if (near) {
      const target = Math.atan2(player.x - root.position.x, player.z - root.position.z);
      const delta = Math.atan2(Math.sin(target - root.rotation.y), Math.cos(target - root.rotation.y));
      root.rotation.y += delta * Math.min(1, TURN * dt);
    }
    this.head.set(root.position.x, root.position.y + HEAD, root.position.z).project(this.camera);
    const visible = near && this.line !== null && this.head.z < 1 && Math.abs(this.head.x) < 1.1 && Math.abs(this.head.y) < 1.1;
    this.bubble.hidden = !visible;
    if (visible) {
      const w = this.host.clientWidth;
      const h = this.host.clientHeight;
      const bw = this.bubble.offsetWidth;
      const bh = this.bubble.offsetHeight;
      const x = Math.min(w - MARGIN - bw, Math.max(MARGIN, ((this.head.x + 1) / 2) * w - bw / 2));
      const y = Math.max(MARGIN, ((1 - this.head.y) / 2) * h - bh - 16);
      this.bubble.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }
}
