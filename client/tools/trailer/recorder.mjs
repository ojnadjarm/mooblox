// Frame recorder: screenshots of the page, one per virtual frame, piped into an ffmpeg H.264 plate (CRF 12).
import { spawn } from 'node:child_process';
import { once } from 'node:events';

export class Recorder {
  /** `cdp` = a CDP session on the page; `fps` = virtual frames per second. */
  constructor(cdp, fps = 60) {
    this.cdp = cdp;
    this.fps = fps;
  }

  /** Opens `file` for frames. */
  open(file) {
    this.ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(this.fps), '-c:v', 'png', '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
    this.count = 0;
  }

  /** Takes the current frame. */
  async grab() {
    const { data } = await this.cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
    this.count++;
    if (!this.ff.stdin.write(Buffer.from(data, 'base64'))) await once(this.ff.stdin, 'drain');
  }

  /** Finishes the plate; resolves with the frame count. */
  async close() {
    this.ff.stdin.end();
    const [code] = await once(this.ff, 'close');
    if (code !== 0) throw new Error(`ffmpeg exited ${code}`);
    return this.count;
  }
}
