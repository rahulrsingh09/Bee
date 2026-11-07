import React from 'react';

/** One data story per browser session. Later visits show final values at once. */
export const NOW_MOTION_SESSION_KEY = 'rm-now-motion-seen';

function prefersReducedMotion() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

/** True only on the first Now view of the session and when the owner allows motion. */
export function useFirstViewMotion() {
  const [animate] = React.useState(() => {
    if (prefersReducedMotion()) return false;
    try { return window.sessionStorage.getItem(NOW_MOTION_SESSION_KEY) !== '1'; } catch { return false; }
  });
  React.useEffect(() => {
    try { window.sessionStorage.setItem(NOW_MOTION_SESSION_KEY, '1'); } catch { /* storage can be unavailable */ }
  }, []);
  return animate;
}

/** Counts from 0 to the first known value when `animate` is true; afterwards it follows the value directly. */
export function useCountUp(value: number | null, animate: boolean, duration = 900) {
  const [shown, setShown] = React.useState<number | null>(animate ? (value == null ? null : 0) : value);
  const counted = React.useRef(!animate);
  React.useEffect(() => {
    if (value == null) { setShown(null); return; }
    if (counted.current) { setShown(value); return; }
    counted.current = true;
    const began = performance.now();
    let frame = 0;
    const tick = (time: number) => {
      const progress = Math.min(1, (time - began) / duration);
      setShown(value * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); setShown(value); };
  }, [value, duration]);
  return shown;
}

/** Becomes true once, on the next frame after mount (the trigger for CSS transitions to their final state). */
export function useArrived(animate: boolean) {
  const [arrived, setArrived] = React.useState(!animate);
  React.useEffect(() => {
    if (arrived) return;
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setArrived(true)));
    return () => cancelAnimationFrame(frame);
  }, [arrived]);
  return arrived;
}

/** Becomes true once the element is visible. Without IntersectionObserver it is true at once. */
export function useSeenOnce<T extends Element>(enabled: boolean) {
  const ref = React.useRef<T>(null);
  const [seen, setSeen] = React.useState(!enabled || typeof IntersectionObserver === 'undefined');
  React.useEffect(() => {
    if (seen || !ref.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setSeen(true); observer.disconnect(); }
    }, { threshold: 0.4 });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [seen]);
  return [ref, seen] as const;
}
