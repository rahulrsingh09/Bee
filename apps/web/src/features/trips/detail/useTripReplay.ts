import React from 'react';

/** A full replay takes this long, whatever the trip duration. */
export const REPLAY_DURATION_MS = 10_000;

/** Index of the last sample at or before `elapsed`. `elapsed` values are ascending. */
export function sampleIndexAt(elapsed: number[], target: number) {
  let low = 0;
  let high = elapsed.length - 1;
  if (high < 0) return null;
  if (target <= elapsed[0]!) return 0;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (elapsed[middle]! <= target) low = middle; else high = middle - 1;
  }
  return low;
}

/**
 * Replays the drive: moves the shared sample index from the selected sample
 * (or the start) to the end of the trip in REPLAY_DURATION_MS. The replay
 * never starts by itself. Callers stop it when the owner selects a sample
 * another way (scrubber, map or chart).
 */
export function useTripReplay(
  elapsed: number[],
  activeIndex: number | null,
  onIndexChange: (index: number) => void,
) {
  const [playing, setPlaying] = React.useState(false);
  const frameRef = React.useRef<number | null>(null);
  const lastIndexRef = React.useRef<number | null>(null);
  const onIndexChangeRef = React.useRef(onIndexChange);
  onIndexChangeRef.current = onIndexChange;

  const stop = React.useCallback(() => {
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    lastIndexRef.current = null;
    setPlaying(false);
  }, []);

  React.useEffect(() => stop, [stop]);
  // A new trip or a new sample set ends the replay.
  React.useEffect(() => stop(), [elapsed, stop]);

  const play = React.useCallback(() => {
    if (elapsed.length < 2) return;
    const lastIndex = elapsed.length - 1;
    const startIndex = activeIndex == null || activeIndex >= lastIndex ? 0 : activeIndex;
    const startElapsed = elapsed[startIndex]!;
    const endElapsed = elapsed[lastIndex]!;
    const span = Math.max(1, endElapsed - elapsed[0]!);
    const remainingMs = REPLAY_DURATION_MS * (endElapsed - startElapsed) / span;
    const startedAt = performance.now();
    lastIndexRef.current = startIndex;
    onIndexChangeRef.current(startIndex);
    setPlaying(true);
    const step = (now: number) => {
      const progress = remainingMs <= 0 ? 1 : Math.min(1, (now - startedAt) / remainingMs);
      const index = sampleIndexAt(elapsed, startElapsed + (endElapsed - startElapsed) * progress) ?? lastIndex;
      if (index !== lastIndexRef.current) {
        lastIndexRef.current = index;
        onIndexChangeRef.current(index);
      }
      if (progress >= 1) {
        frameRef.current = null;
        setPlaying(false);
        return;
      }
      frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
  }, [activeIndex, elapsed]);

  const toggle = React.useCallback(() => (playing ? stop() : play()), [play, playing, stop]);
  return { playing, play, stop, toggle };
}
