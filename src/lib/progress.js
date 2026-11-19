// Drives the progress bar. It follows the real work, and once the work is done it
// eases to 97% over the time that is left, so every job lasts at least MIN_DURATION_MS.

export const MIN_DURATION_MS = 5000;
export const ZIP_SHARE = 0.35; // share of the bar used while zipping

const clamp01 = (n) => Math.min(1, Math.max(0, n));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// setValue(fraction 0..1) is called every frame with the value to draw
export function createRun(setValue) {
  const startedAt = performance.now();
  let actual = 0; // real progress reported by zip/encrypt
  let shown = 0; // value currently drawn
  let workDone = false;
  let workDoneAt = 0;
  let shownAtWorkDone = 0;
  let running = true;
  let frameId = 0;

  const frame = () => {
    if (!running) return;
    const now = performance.now();
    if (!workDone) {
      shown += (Math.min(0.96, actual) - shown) * 0.2;
    } else {
      const span = Math.max(MIN_DURATION_MS - (workDoneAt - startedAt), 400);
      const t = clamp01((now - workDoneAt) / span);
      shown = Math.max(shown, shownAtWorkDone + (0.97 - shownAtWorkDone) * easeInOutCubic(t));
    }
    setValue(shown);
    frameId = requestAnimationFrame(frame);
  };
  frameId = requestAnimationFrame(frame);

  const stop = () => {
    running = false;
    cancelAnimationFrame(frameId);
  };

  return {
    report(fraction) {
      actual = Math.max(actual, clamp01(fraction));
      if (actual >= 1 && !workDone) {
        workDone = true;
        workDoneAt = performance.now();
        shownAtWorkDone = shown;
      }
    },
    async finish() {
      const remaining = MIN_DURATION_MS - (performance.now() - startedAt);
      if (remaining > 0) await sleep(remaining);
      stop();
      setValue(1);
    },
    stop,
  };
}
