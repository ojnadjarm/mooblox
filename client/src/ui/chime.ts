/** A soft rising three-note chime with a sparkle (Web Audio, no files); silent where audio is blocked. */
export function playChime(context?: BaseAudioContext): void {
  let ctx: BaseAudioContext;
  try {
    ctx = context ?? new AudioContext();
  } catch {
    return;
  }
  const out = ctx.createGain();
  out.gain.value = 0.32;
  out.connect(ctx.destination);
  const t0 = ctx.currentTime + 0.02;
  const notes = [784, 988, 1175, 1568];
  notes.forEach((f, i) => tone(ctx, out, f, t0 + i * 0.11, i === notes.length - 1 ? 0.9 : 0.35));
  if (!context) setTimeout(() => void (ctx as AudioContext).close(), 2000);
}

/** One bell-like note: sine plus a quiet octave, quick attack, smooth decay (no clicks). */
function tone(ctx: BaseAudioContext, out: AudioNode, freq: number, at: number, decay: number): void {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.linearRampToValueAtTime(0.5, at + 0.012);
  gain.gain.setTargetAtTime(0.0001, at + 0.03, decay / 4);
  gain.connect(out);
  for (const [mult, level, type] of [[1, 1, 'sine'], [2, 0.18, 'triangle']] as const) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq * mult;
    const g = ctx.createGain();
    g.gain.value = level;
    osc.connect(g).connect(gain);
    osc.start(at);
    osc.stop(at + decay + 0.3);
  }
}
