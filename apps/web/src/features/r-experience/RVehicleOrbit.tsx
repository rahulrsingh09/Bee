import React from 'react';
import { AuthenticatedVehicleArtwork, type ResolvedVehicleArtwork } from '@riviamigo/hooks';
import {
  angleForKey, angleStepWidth, createOrbitFrames, DEFAULT_FRAME, FRONT_FRAME, loadArtworkPaint, ORBIT_FRAMES,
  restAngleIndex, settleAngle, wrapAngleIndex, wrapFrame, type Oklab,
} from './orbitFrames';
import heroUrl from './assets/r2-hero.webp';
import '../now/now.css';

const rememberedAngles = new Map<string, number>();

export interface RVehicleOrbitProps {
  vehicleId: string;
  /** Accessible name of the turn control, for example "Your R2, Catalina Cove. Use arrow keys to turn." */
  label?: string;
  /** One slow turn on first visible entry. Off when the owner's own artwork rests on top of the frames. */
  autoTurn?: boolean;
  /** The owner starts to turn the car (drag, double-tap or arrow key). */
  onTurnStart?: () => void;
  /** The car stops at a frame after a turn. */
  onRest?: (frame: number) => void;
  /**
   * URL of the owner's side-profile artwork (same origin or blob). The body of
   * each frame takes the paint sampled from it; without it, or when no paint can
   * be sampled, the frames keep their own paint.
   */
  paintSource?: string | null;
}

/** Double-tap window and distance for "turn to the side view". */
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_PX = 24;

type VehicleAngleImage = NonNullable<ResolvedVehicleArtwork['angles']>['light'][number];

export interface RVehicleAnglesProps {
  /** Accessible name of the turn control, for example "Your R2, Catalina Cove. Use arrow keys to turn." */
  label: string;
  /** The owner's own Rivian images in turning order (at least two). */
  angles: readonly VehicleAngleImage[];
  /** Packaged model artwork for the side image when the owner image cannot load. */
  fallbackSource?: string | null;
}

/**
 * The owner's own Rivian images as a turn control. The car rests on the side image.
 * A drag or the arrow keys step through the angles with a short cross-fade; a released
 * drag rounds to the nearest angle and the set wraps around. A double-tap or Home
 * returns to the side image. Reduced motion shows each angle at once (no fade, no inertia).
 */
export function RVehicleAngles({ label, angles, fallbackSource }: RVehicleAnglesProps) {
  const count = angles.length;
  const rest = restAngleIndex(angles);
  const [index, setIndex] = React.useState(rest);
  const current = React.useRef(rest);
  const lastTap = React.useRef<{ time: number; x: number; y: number } | null>(null);
  const drag = React.useRef<{ id: number; x: number; y: number; start: number; position: number; time: number; velocity: number; moved: boolean } | null>(null);
  const reduced = React.useRef(false);

  React.useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => { reduced.current = media.matches; };
    change();
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);

  const show = React.useCallback((next: number) => {
    const wrapped = wrapAngleIndex(next, count);
    current.current = wrapped;
    setIndex(wrapped);
  }, [count]);

  // A new angle set (theme or vehicle change) rests on its side image again.
  const signature = angles.map(angle => angle.url).join('|');
  React.useEffect(() => { show(rest); }, [signature, rest, show]);

  function finish(event: React.PointerEvent<HTMLDivElement>, cancelled = false) {
    const previous = drag.current;
    if (!previous || previous.id !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (previous.moved) {
      show(settleAngle(previous.position, cancelled || reduced.current ? 0 : previous.velocity, count));
      return;
    }
    if (cancelled) return;
    const tap = lastTap.current;
    const now = performance.now();
    if (tap && now - tap.time < DOUBLE_TAP_MS && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) < DOUBLE_TAP_PX) {
      lastTap.current = null;
      show(rest);
    } else {
      lastTap.current = { time: now, x: event.clientX, y: event.clientY };
    }
  }

  const active = angles[index] ?? angles[0]!;
  return (
    <div className="r-orbit r-orbit-turn">
      <div className="r-orbit-stage" role="slider" tabIndex={0} aria-label={label}
        aria-valuemin={0} aria-valuemax={count - 1} aria-valuenow={index} aria-valuetext={active.label}
        data-angle={active.angle}
        onKeyDown={event => {
          const next = angleForKey(event.key, current.current, count, rest);
          if (next === null) return;
          event.preventDefault();
          show(next);
        }}
        onPointerDown={event => {
          if (!event.isPrimary || event.button !== 0) return;
          drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start: current.current, position: current.current, time: performance.now(), velocity: 0, moved: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          const previous = drag.current;
          if (!previous || previous.id !== event.pointerId) return;
          const dx = event.clientX - previous.x;
          const dy = event.clientY - previous.y;
          if (!previous.moved && Math.abs(dy) > Math.abs(dx) + 6) { finish(event, true); return; }
          if (!previous.moved && Math.abs(dx) < 6) return;
          previous.moved = true;
          const position = previous.start + dx / angleStepWidth(event.currentTarget.clientWidth);
          const now = performance.now();
          previous.velocity = (position - previous.position) / Math.max(1, now - previous.time);
          previous.position = position;
          previous.time = now;
          if (wrapAngleIndex(position, count) !== current.current) show(position);
        }}
        onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)}>
        {angles.map((angle, position) => (
          <AuthenticatedVehicleArtwork key={angle.url} source={angle.url}
            fallbackSource={angle.angle === 'side' ? fallbackSource : null}
            className="r-orbit-angle" data-angle={angle.angle} data-active={position === index || undefined}
            alt="" aria-hidden="true" draggable={false} />
        ))}
      </div>
    </div>
  );
}

export function RVehicleOrbit({ vehicleId, label = 'Rotate vehicle. Use arrow keys to turn.', autoTurn = true, onTurnStart, onRest, paintSource }: RVehicleOrbitProps) {
  const hintId = React.useId();
  const callbacks = React.useRef({ onTurnStart, onRest });
  callbacks.current = { onTurnStart, onRest };
  const lastTap = React.useRef<{ time: number; x: number; y: number } | null>(null);
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const frame = React.useRef(rememberedAngles.get(vehicleId) ?? DEFAULT_FRAME);
  const [angle, setAngle] = React.useState(frame.current);
  const [ready, setReady] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(false);
  const motion = React.useRef(0);
  const failed = React.useRef(false);
  const draw = React.useRef<(next: number) => void>(() => {});
  const reduced = React.useRef(false);
  const interacted = React.useRef(false);
  const drag = React.useRef<{ id: number; x: number; y: number; frame: number; time: number; velocity: number; moved: boolean } | null>(null);
  const [paint, setPaint] = React.useState<Oklab | null>(null);
  const paintRef = React.useRef<Oklab | null>(null);
  paintRef.current = paint;
  const framesRef = React.useRef<ReturnType<typeof createOrbitFrames> | null>(null);
  const drawn = React.useRef(false);

  React.useEffect(() => {
    setPaint(null);
    if (!paintSource) return;
    let live = true;
    void loadArtworkPaint(paintSource).then(next => { if (live) setPaint(next); });
    return () => { live = false; };
  }, [paintSource]);

  React.useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => {
      reduced.current = media.matches;
      if (media.matches) interacted.current = true;
      cancelAnimationFrame(motion.current);
      setLoading(false);
    };
    change();
    media.addEventListener('change', change);
    const frames = createOrbitFrames();
    frames.setPaint(paintRef.current);
    framesRef.current = frames;
    drawn.current = false;
    let sequence = 0;
    let active = true;
    let rendering = false;
    let requested: number | null = null;
    draw.current = (next) => {
      if (failed.current) return;
      frame.current = next;
      const index = wrapFrame(next);
      rememberedAngles.set(vehicleId, index);
      setAngle(index);
      requested = index;
      if (rendering) return;
      const render = async () => {
        rendering = true;
        setLoading(true);
        const generation = ++sequence;
        try {
          while (requested !== null && active) {
            const target = requested;
            requested = null;
            const image = await frames.get(target);
            if (!active || generation !== sequence) return;
            const context = canvas.current?.getContext('2d');
            if (context) {
              context.clearRect(0, 0, 840, 430);
              context.drawImage(image, 0, 0, 840, 430);
              drawn.current = true;
              setReady(true);
              setError(false);
            }
          }
        } catch {
          if (active) {
            requested = null;
            failed.current = true;
            drag.current = null;
            cancelAnimationFrame(motion.current);
            setError(true);
          }
        } finally {
          if (active) setLoading(false);
          rendering = false;
        }
      };
      void render();
    };
    const restore = rememberedAngles.has(vehicleId);
    if (restore) draw.current(frame.current);
    let entered = !autoTurn;
    const observer = new IntersectionObserver(entries => {
      const visible = entries.some(entry => entry.isIntersecting);
      if (!visible) {
        if (entered) { interacted.current = true; cancelAnimationFrame(motion.current); setLoading(false); }
        return;
      }
      if (entered || restore || reduced.current || interacted.current) return;
      entered = true;
      setLoading(true);
      void frames.get(frame.current).then(() => {
        if (!active || interacted.current || document.hidden) {
          if (active) setLoading(false);
          return;
        }
        const start = frame.current;
        const began = performance.now();
        const tick = (time: number) => {
          if (!active || interacted.current || reduced.current) return;
          const progress = Math.min(1, (time - began) / 3600);
          draw.current(start + ORBIT_FRAMES * (1 - Math.pow(1 - progress, 3)));
          if (progress < 1) motion.current = requestAnimationFrame(tick);
        };
        motion.current = requestAnimationFrame(tick);
      }).catch(() => {
        if (active) { failed.current = true; setError(true); setLoading(false); }
      });
    });
    if (canvas.current) observer.observe(canvas.current.parentElement!);
    const visibility = () => {
      if (document.hidden) { interacted.current = true; cancelAnimationFrame(motion.current); setLoading(false); }
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      active = false;
      sequence++;
      cancelAnimationFrame(motion.current);
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      media.removeEventListener('change', change);
      frames.close();
      if (framesRef.current === frames) framesRef.current = null;
    };
  }, [vehicleId, autoTurn]);

  // A new paint re-tints the frame on screen; frames not drawn yet load tinted.
  React.useEffect(() => {
    framesRef.current?.setPaint(paint);
    if (drawn.current) draw.current(frame.current);
  }, [paint]);

  function animate(target: number, duration: number) {
    interacted.current = true;
    cancelAnimationFrame(motion.current);
    failed.current = false;
    const rest = () => callbacks.current.onRest?.(wrapFrame(frame.current));
    if (reduced.current) { draw.current(target); rest(); return; }
    const start = frame.current;
    const began = performance.now();
    const tick = (time: number) => {
      const progress = Math.min(1, (time - began) / duration);
      draw.current(start + (target - start) * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) motion.current = requestAnimationFrame(tick);
      else rest();
    };
    motion.current = requestAnimationFrame(tick);
  }

  function finish(event: React.PointerEvent<HTMLDivElement>, cancelled = false) {
    const previous = drag.current;
    if (!previous || previous.id !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (cancelled) {
      if (previous.moved) callbacks.current.onRest?.(wrapFrame(frame.current));
      return;
    }
    if (!previous.moved) {
      const tap = lastTap.current;
      const now = performance.now();
      if (tap && now - tap.time < DOUBLE_TAP_MS && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) < DOUBLE_TAP_PX) {
        lastTap.current = null;
        callbacks.current.onTurnStart?.();
        animate(frame.current + ((DEFAULT_FRAME - wrapFrame(frame.current) + 108) % 72 - 36), 650);
      } else {
        lastTap.current = { time: now, x: event.clientX, y: event.clientY };
      }
      return;
    }
    if (!reduced.current) animate(frame.current + Math.max(-12, Math.min(12, previous.velocity * 160)), 500);
    else callbacks.current.onRest?.(wrapFrame(frame.current));
  }

  return (
    <div className="r-orbit">
      <div className="r-orbit-stage" role="slider" tabIndex={0} aria-label={label}
        aria-valuemin={0} aria-valuemax={355} aria-valuenow={angle * 5}
        aria-valuetext={`${angle * 5} degrees`} aria-describedby={error ? hintId : undefined}
        data-loading={(loading && !ready) || undefined}
        onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? frame.current + 2
            : event.key === 'ArrowLeft' ? frame.current - 2
            : event.key === 'Home' ? FRONT_FRAME : event.key === 'End' ? DEFAULT_FRAME : null;
          if (next === null) return;
          event.preventDefault(); interacted.current = true; cancelAnimationFrame(motion.current); failed.current = false;
          callbacks.current.onTurnStart?.(); draw.current(next); callbacks.current.onRest?.(wrapFrame(next));
        }}
        onPointerDown={event => {
          if (!event.isPrimary || event.button !== 0) return;
          interacted.current = true;
          cancelAnimationFrame(motion.current);
          setLoading(false);
          failed.current = false;
          drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, frame: frame.current, time: performance.now(), velocity: 0, moved: false };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          const previous = drag.current;
          if (!previous || previous.id !== event.pointerId) return;
          const dx = event.clientX - previous.x;
          const dy = event.clientY - previous.y;
          if (!previous.moved && Math.abs(dy) > Math.abs(dx) + 6) { finish(event, true); return; }
          if (!previous.moved && Math.abs(dx) < 6) return;
          if (!previous.moved) callbacks.current.onTurnStart?.();
          previous.moved = true;
          const next = previous.frame + dx / Math.max(5, event.currentTarget.clientWidth / ORBIT_FRAMES);
          const now = performance.now();
          previous.velocity = (next - frame.current) / Math.max(1, now - previous.time);
          previous.time = now;
          draw.current(next);
        }}
        onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)}>
        <img src={heroUrl} alt="" draggable={false} className={ready ? 'r-orbit-poster r-orbit-hidden' : 'r-orbit-poster'} />
        <canvas ref={canvas} width={840} height={430} aria-hidden="true" className={ready ? '' : 'r-orbit-hidden'} />
      </div>
      {/* No visible hint: text near the car overlaps it. Screen readers get the failure state. */}
      <span id={hintId} className="sr-only" role="status">{error ? 'Rotation unavailable. Drag or press an arrow key to try again.' : ''}</span>
    </div>
  );
}
