/** Synchronous authority boundary for a single private webhook capture. */
export function createOneShotCaptureLifecycle() {
  let phase = 'open';
  return Object.freeze({
    get phase() { return phase; },
    get unavailable() { return phase !== 'open'; },
    claim() {
      if (phase !== 'open') return false;
      phase = 'claimed';
      return true;
    },
    finish() {
      if (phase === 'finished') return false;
      phase = 'finished';
      return true;
    },
  });
}
