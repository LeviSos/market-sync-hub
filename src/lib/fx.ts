/**
 * Tiny sound + motion helpers for the spinners.
 * Everything is generated with the Web Audio API, so no asset downloads.
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) ctx = new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One short click. `hot` makes it sharper/louder (gamble mode). */
export function playTick(hot = false) {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = hot ? "square" : "triangle";
  osc.frequency.value = hot ? 1400 : 900;
  gain.gain.setValueAtTime(hot ? 0.06 : 0.035, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + (hot ? 0.05 : 0.04));
  osc.connect(gain).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + 0.06);
}

/**
 * Ticks while a wheel/reel is spinning: fast at the start, slower as it settles.
 * Returns a stop function.
 */
export function startTicker(durationMs: number, hot = false) {
  if (typeof window === "undefined") return () => {};
  const start = performance.now();
  let timer = 0;
  const step = () => {
    const p = Math.min(1, (performance.now() - start) / durationMs);
    if (p >= 1) return;
    playTick(hot);
    const min = hot ? 38 : 60;
    const max = hot ? 260 : 320;
    const gap = min + (max - min) * Math.pow(p, 2.2);
    timer = window.setTimeout(step, gap);
  };
  step();
  return () => window.clearTimeout(timer);
}
