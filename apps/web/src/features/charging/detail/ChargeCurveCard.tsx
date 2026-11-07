import React from 'react';
import type { ChargePhase, ChargeShapeValues, UsualDcBandValues } from '@riviamigo/types';
import { cn } from '@riviamigo/ui/lib/utils';
import {
  PHASE_LABELS, bandCaption, formatKw, formatPct, nearestIndexByMinute, phaseKw, phaseSentence, phaseSpan,
  socAtMinute, type ChargeCurveModel, type ChargeKind,
} from './chargeDetailModel';
import { ChargeCard } from './ChargeStats';

type Axis = 'soc' | 'time';

const HEIGHT = 220;
const LEFT = 34;
const RIGHT = 10;
const TOP = 24;
const BOTTOM = HEIGHT - 28;
const MORPH_MS = 600;
const DRAW_MS = 2200;
/** Intro steps: 1 line draws (climb), 2 peak marker, 3 taper shading, 4 lowest point and usual band. */
const STAGE_DELAYS = [0, 800, 1700, 2400] as const;
const STAGE_PHASE: Record<number, ChargePhase['name']> = { 1: 'climb', 2: 'peak', 3: 'taper', 4: 'taper' };

function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function niceMax(value: number) {
  const step = value > 80 ? 40 : value > 20 ? 10 : 2;
  return { max: Math.max(step, Math.ceil((value * 1.08) / step) * step), step };
}

function useWidth(ref: React.RefObject<HTMLElement | null>, fallback: number) {
  const [width, setWidth] = React.useState(fallback);
  React.useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const read = () => { if (node.clientWidth > 0) setWidth(node.clientWidth); };
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export interface ChargeCurveCardProps {
  curve: ChargeCurveModel | null;
  shape: ChargeShapeValues | null;
  band: UsualDcBandValues | null;
  chargerLimited: boolean;
  kind: ChargeKind | null;
  /** Peak from the session row, for the empty row. */
  peakKw: number | null | undefined;
  loading: boolean;
}

/** "How it charged": kW against battery % (or time), one y-axis, drawn once, drag to read. */
export function ChargeCurveCard(props: ChargeCurveCardProps) {
  const { curve, loading, peakKw } = props;
  if (!curve) {
    return (
      <ChargeCard title="How it charged" data-charge-curve="empty" aria-busy={loading || undefined}>
        <p className="mt-1 text-[13px] leading-[18px] text-fg-secondary" data-charge-curve-empty>
          {loading
            ? 'Loading the power curve…'
            : `No power curve for this charge${peakKw != null && Number.isFinite(peakKw) && peakKw > 0 ? ` · Peak ${formatKw(peakKw)} kW` : ''}. A curve shows when Rivian sends power readings.`}
        </p>
      </ChargeCard>
    );
  }
  return <ChargeCurvePlot {...props} curve={curve} />;
}

function ChargeCurvePlot({ curve, shape, band, chargerLimited, kind }: ChargeCurveCardProps & { curve: ChargeCurveModel }) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const tipRef = React.useRef<HTMLDivElement>(null);
  const width = useWidth(wrapRef, 358);
  const storyId = React.useId();
  const reduced = React.useMemo(prefersReducedMotion, []);
  const [axis, setAxis] = React.useState<Axis>(curve.socAxis ? 'soc' : 'time');
  const [morph, setMorph] = React.useState(curve.socAxis ? 1 : 0);
  const [stage, setStage] = React.useState(reduced ? 4 : 0);
  const [activePhase, setActivePhase] = React.useState<ChargePhase['name'] | null>(null);
  const [cursor, setCursor] = React.useState<number | null>(null);
  const [tipWidth, setTipWidth] = React.useState(150);
  const morphRef = React.useRef(morph);
  morphRef.current = morph;
  const socAxis = curve.socAxis;
  React.useEffect(() => { if (!socAxis) { setAxis('time'); setMorph(0); } }, [socAxis]);

  // Intro: start when the card is visible; reduced motion shows the final state at once.
  React.useEffect(() => {
    if (reduced) return undefined;
    const node = wrapRef.current;
    const timers: number[] = [];
    const start = () => STAGE_DELAYS.forEach((delay, index) => {
      timers.push(window.setTimeout(() => setStage((current) => Math.max(current, index + 1)), delay + (index === 0 ? 30 : 0)));
    });
    if (!node || typeof IntersectionObserver === 'undefined') {
      start();
      return () => timers.forEach(window.clearTimeout);
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); start(); }
    }, { threshold: 0.35 });
    observer.observe(node);
    return () => { observer.disconnect(); timers.forEach(window.clearTimeout); };
  }, [reduced]);

  // Axis morph: x moves from minute to battery % (or back); the line keeps its points.
  React.useEffect(() => {
    const target = axis === 'soc' ? 1 : 0;
    if (reduced || typeof requestAnimationFrame !== 'function') { setMorph(target); return undefined; }
    const from = morphRef.current;
    if (from === target) return undefined;
    let frame = 0;
    let begin: number | null = null;
    const step = (now: number) => {
      begin ??= now;
      const progress = Math.min(1, (now - begin) / MORPH_MS);
      setMorph(from + (target - from) * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [axis, reduced]);

  const points = curve.points;
  const plotRight = width - RIGHT;
  const bandMax = band?.bands.reduce((max, row) => Math.max(max, row.p90_kw), 0) ?? 0;
  const yScale = niceMax(Math.max(points[curve.peakIndex]!.kw, axis === 'soc' ? bandMax : 0, 1));
  const y = (kw: number) => TOP + ((yScale.max - Math.min(kw, yScale.max)) / yScale.max) * (BOTTOM - TOP);
  const socSpan = Math.max(1, curve.socMax - curve.socMin);
  const xSoc = (soc: number) => LEFT + ((soc - curve.socMin) / socSpan) * (plotRight - LEFT);
  // Minutes count from the session start, as in the API shape; the axis starts at the first reading when it is earlier.
  const timeSpan = Math.max(1, curve.durationMin - curve.startMin);
  const xTime = (minute: number) => LEFT + ((minute - curve.startMin) / timeSpan) * (plotRight - LEFT);
  const xAtMinute = (minute: number) => {
    const soc = socAxis ? socAtMinute(points, minute) : null;
    const timeX = xTime(minute);
    return soc == null ? timeX : timeX + (xSoc(soc) - timeX) * morph;
  };
  // Point x and the line change with the width, the scale and the morph only, not with the drag cursor.
  const xs = React.useMemo(() => points.map((point) => {
    const timeX = xTime(point.minute);
    return point.soc == null || !socAxis ? timeX : timeX + (xSoc(point.soc) - timeX) * morph;
  }), [points, socAxis, morph, width, curve.startMin, curve.durationMin, curve.socMin, curve.socMax]); // eslint-disable-line react-hooks/exhaustive-deps
  const linePath = React.useMemo(
    () => `M${points.map((point, index) => `${xs[index]!.toFixed(1)},${y(point.kw).toFixed(1)}`).join(' L')}`,
    [points, xs, yScale.max], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const peakIndex = shape ? nearestIndexByMinute(points, shape.peak_minute) : curve.peakIndex;
  const lowIndex = React.useMemo(() => {
    if (!shape) return curve.lowIndex;
    let best = peakIndex;
    for (let index = peakIndex; index < points.length; index += 1) {
      if (Math.abs(points[index]!.kw - shape.low_kw) <= Math.abs(points[best]!.kw - shape.low_kw)) best = index;
    }
    return best;
  }, [curve.lowIndex, peakIndex, points, shape]);
  const peakPoint = points[peakIndex]!;
  const lowPoint = points[lowIndex]!;
  const peakSoc = shape?.peak_soc ?? peakPoint.soc;
  const lowSoc = shape?.low_soc ?? lowPoint.soc;
  const showLow = lowIndex !== peakIndex && lowPoint.kw < peakPoint.kw * 0.95;

  const phases = shape?.phases ?? [];
  const taper = phases.find((phase) => phase.name === 'taper');
  const highlighted = phases.find((phase) => phase.name === activePhase);
  const storyPhase = activePhase ?? (stage > 0 ? STAGE_PHASE[stage] : null) ?? null;
  const storyPhaseValue = phases.find((phase) => phase.name === storyPhase) ?? phases[phases.length - 1];
  const story = shape && storyPhaseValue
    ? phaseSentence(storyPhaseValue, shape, chargerLimited)
    : `Peak ${formatKw(peakPoint.kw)} kW${formatPct(peakSoc) ? ` at ${formatPct(peakSoc)}` : ''}.`;

  const bandPath = React.useMemo(() => {
    if (!band || band.bands.length < 2 || !socAxis) return null;
    const rows = band.bands.filter((row) => row.soc >= curve.socMin && row.soc <= curve.socMax).sort((a, b) => a.soc - b.soc);
    if (rows.length < 2) return null;
    const up = rows.map((row) => `${xSoc(row.soc).toFixed(1)},${y(row.p90_kw).toFixed(1)}`);
    const down = rows.map((row) => `${xSoc(row.soc).toFixed(1)},${y(row.p10_kw).toFixed(1)}`).reverse();
    return `M${up.join(' L')} L${down.join(' L')} Z`;
    // xSoc and y depend on width and the scale only.
  }, [band, socAxis, curve.socMin, curve.socMax, width, yScale.max]); // eslint-disable-line react-hooks/exhaustive-deps

  const xTicks = morph >= 0.5 && socAxis
    ? Array.from({ length: 11 }, (_, index) => index * 10).filter((soc) => soc >= curve.socMin - 0.01 && soc <= curve.socMax + 0.01).map((soc) => ({ x: xSoc(soc), label: `${soc}%` }))
    : (() => {
      // Ticks start at the session start (0 min); a reading before it sits left of 0.
      const step = curve.durationMin <= 12 ? 2 : curve.durationMin <= 30 ? 5 : curve.durationMin <= 90 ? 15 : 60;
      return Array.from({ length: Math.floor(curve.durationMin / step) + 1 }, (_, index) => index * step)
        .map((minute) => ({ x: xTime(minute), label: `${minute} min` }));
    })();
  const yTicks = Array.from({ length: Math.floor(yScale.max / yScale.step) + 1 }, (_, index) => index * yScale.step);
  const color = kind === 'ac' ? 'var(--rm-charging-ac)' : 'var(--rm-charging-dc)';

  // The plot rect is read once per drag (or hover), not on each pointermove.
  const rectRef = React.useRef<DOMRect | null>(null);
  React.useEffect(() => { rectRef.current = null; }, [width]);
  const releaseRect = () => { rectRef.current = null; };
  const pick = (clientX: number) => {
    rectRef.current ??= wrapRef.current?.querySelector('svg')?.getBoundingClientRect() ?? null;
    const rect = rectRef.current;
    if (!rect || rect.width <= 0) { rectRef.current = null; return; }
    const sx = ((clientX - rect.left) / rect.width) * width;
    let best = 0;
    for (let index = 1; index < xs.length; index += 1) {
      if (Math.abs(xs[index]! - sx) < Math.abs(xs[best]! - sx)) best = index;
    }
    setCursor((current) => (current === best ? current : best));
  };
  const cursorPoint = cursor == null ? null : points[cursor] ?? null;
  const readout = cursorPoint
    ? [`${formatKw(cursorPoint.kw)} kW`, formatPct(cursorPoint.soc), `${Math.max(0, Math.round(cursorPoint.minute))} min`].filter(Boolean).join(' · ')
    : null;
  React.useLayoutEffect(() => { if (tipRef.current) setTipWidth(tipRef.current.offsetWidth || 150); }, [readout]);
  const cursorX = cursor == null ? null : xs[cursor]!;
  const tipLeft = cursorX == null ? 0 : Math.min(Math.max(cursorX - tipWidth / 2, 0), Math.max(0, width - tipWidth));

  const labelAnchor = (x: number, text: string) => (x + 10 + text.length * 6.6 > plotRight ? { x: x - 10, anchor: 'end' as const } : { x: x + 10, anchor: 'start' as const });
  const peakLabel = `Peak ${formatKw(peakPoint.kw)} kW${formatPct(peakSoc) ? ` at ${formatPct(peakSoc)}` : ''}`;
  const lowLabel = `${formatKw(lowPoint.kw)} kW${formatPct(lowSoc) ? ` at ${formatPct(lowSoc)}` : ''}`;
  const peakAt = labelAnchor(xs[peakIndex]!, peakLabel);
  const lowAt = labelAnchor(xs[lowIndex]!, lowLabel);
  const fade = (on: boolean): React.CSSProperties => ({ opacity: on ? 1 : 0, transition: reduced ? undefined : 'opacity 400ms ease' });

  const taperX1 = taper ? xAtMinute(taper.start_min) : null;
  const taperX2 = taper ? xAtMinute(taper.end_min) : null;
  const highX1 = highlighted ? xAtMinute(highlighted.start_min) : null;
  const highX2 = highlighted ? xAtMinute(highlighted.end_min) : null;
  const sourceLine = curve.estimated
    ? 'Estimated from battery % changes.'
    : 'Source: Rivian charging data, one reading per minute.';

  return (
    <ChargeCard title="How it charged" data-charge-curve="plot" data-stage={stage} data-axis={axis}
      action={socAxis ? (
        <div role="group" aria-label="Chart axis" className="grid shrink-0 grid-cols-2 gap-1 rounded-xl border border-border bg-bg-page/60 p-1">
          {(['soc', 'time'] as const).map((value) => (
            <button key={value} type="button" aria-pressed={axis === value} onClick={() => setAxis(value)}
              className={cn('min-h-9 rounded-lg px-3 text-xs font-medium transition-colors', axis === value ? 'bg-bg-elevated text-fg shadow-sm' : 'text-fg-secondary hover:text-fg')}>
              {value === 'soc' ? 'Battery %' : 'Time'}
            </button>
          ))}
        </div>
      ) : null}>
      <p id={storyId} className="mt-1.5 min-h-9 text-[13px] leading-[18px] text-fg-secondary" data-charge-story>{story}</p>
      <div ref={wrapRef} className="relative mt-2 min-w-0 select-none" data-charge-curve-plot>
        <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} role="img"
          aria-label={`Charging power in kW against ${axis === 'soc' ? 'battery %' : 'time'}. ${peakLabel}.${showLow ? ` Lowest after the peak ${lowLabel}.` : ''}`}
          className="block">
          {yTicks.map((kw) => (
            <g key={kw}>
              <line x1={LEFT} x2={plotRight} y1={y(kw)} y2={y(kw)} stroke="var(--rm-chart-grid)" />
              <text x={LEFT - 6} y={y(kw) + 4} textAnchor="end" fontSize={11} fill="var(--rm-text-secondary)">{kw}</text>
            </g>
          ))}
          <text x={LEFT - 6} y={TOP - 10} textAnchor="end" fontSize={11} fill="var(--rm-text-secondary)">kW</text>
          {xTicks.map((tick) => (
            <text key={tick.label} x={tick.x} y={HEIGHT - 8} textAnchor="middle" fontSize={11} fill="var(--rm-text-secondary)">{tick.label}</text>
          ))}
          {bandPath ? <path d={bandPath} fill="var(--rm-text-secondary)" data-charge-band style={{ opacity: stage >= 4 ? 0.14 * morph : 0, transition: reduced ? undefined : 'opacity 600ms ease' }} /> : null}
          {taperX1 != null && taperX2 != null ? (
            <g style={fade(stage >= 3)} data-charge-taper>
              <rect x={taperX1} y={TOP} width={Math.max(0, taperX2 - taperX1)} height={BOTTOM - TOP} fill={color} opacity={0.08} />
              <text x={taperX1 + 8} y={BOTTOM - 10} fontSize={11} fill={color}>{chargerLimited ? 'Charger limit' : 'Taper as the battery fills'}</text>
            </g>
          ) : null}
          {highX1 != null && highX2 != null ? (
            <rect x={highX1} y={TOP} width={Math.max(2, highX2 - highX1)} height={BOTTOM - TOP} fill="var(--rm-text-primary)" opacity={0.06} data-charge-phase-highlight={activePhase ?? undefined} />
          ) : null}
          <path d={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"
            pathLength={1} strokeDasharray={1} strokeDashoffset={stage >= 1 ? 0 : 1}
            style={{ transition: reduced ? undefined : `stroke-dashoffset ${DRAW_MS}ms cubic-bezier(.4,0,.2,1)` }} data-charge-line />
          <g style={fade(stage >= 2)} data-charge-peak>
            <circle cx={xs[peakIndex]} cy={y(peakPoint.kw)} r={6} fill={color} stroke="var(--rm-bg-surface)" strokeWidth={2} />
            <text x={peakAt.x} y={Math.max(12, y(peakPoint.kw) - 8)} textAnchor={peakAt.anchor} fontSize={12} fontWeight={600} fill="var(--rm-text-primary)">{peakLabel}</text>
          </g>
          {showLow ? (
            <g style={fade(stage >= 4)} data-charge-low>
              <circle cx={xs[lowIndex]} cy={y(lowPoint.kw)} r={6} fill="var(--rm-bg-surface)" stroke={color} strokeWidth={2} />
              <text x={lowAt.x} y={Math.min(BOTTOM - 4, y(lowPoint.kw) + 22)} textAnchor={lowAt.anchor} fontSize={12} fill="var(--rm-text-primary)">{lowLabel}</text>
            </g>
          ) : null}
          {cursorX != null && cursorPoint ? (
            <g data-charge-cursor>
              <line x1={cursorX} x2={cursorX} y1={TOP} y2={BOTTOM} stroke="var(--rm-text-primary)" strokeWidth={1.5} />
              <circle cx={cursorX} cy={y(cursorPoint.kw)} r={5} fill={color} stroke="var(--rm-bg-surface)" strokeWidth={2} />
            </g>
          ) : null}
        </svg>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Read a point on the curve"
          aria-valuemin={0}
          aria-valuemax={points.length - 1}
          aria-valuenow={cursor ?? 0}
          aria-valuetext={readout ?? 'No point selected'}
          data-charge-scrub
          className="absolute inset-0 touch-pan-y rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          onPointerDown={(event) => { releaseRect(); pick(event.clientX); }}
          onPointerMove={(event) => { if (event.pointerType !== 'mouse' || event.buttons > 0 || cursor != null) pick(event.clientX); }}
          onPointerUp={releaseRect}
          onPointerCancel={releaseRect}
          onPointerLeave={releaseRect}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            setCursor((current) => Math.min(points.length - 1, Math.max(0, (current ?? (event.key === 'ArrowRight' ? -1 : points.length)) + (event.key === 'ArrowRight' ? 1 : -1))));
          }}
        />
        {readout ? (
          <div ref={tipRef} role="status" data-charge-tip
            className="pointer-events-none absolute top-0 whitespace-nowrap rounded-lg border border-border bg-bg-elevated px-2.5 py-1 text-xs font-medium tabular-nums text-fg shadow-sm"
            style={{ left: tipLeft }}>
            {readout}
          </div>
        ) : null}
      </div>
      {phases.length ? (
        <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${phases.length}, minmax(0, 1fr))` }} role="group" aria-label="Charge phases">
          {phases.map((phase) => (
            <button
              key={phase.name}
              type="button"
              aria-pressed={activePhase === phase.name}
              aria-describedby={activePhase === phase.name ? storyId : undefined}
              data-charge-phase={phase.name}
              onClick={() => setActivePhase((current) => (current === phase.name ? null : phase.name))}
              className={cn(
                'min-h-11 min-w-0 rounded-xl border bg-bg-elevated/35 px-2 py-2 text-left sm:px-2.5 transition-[opacity,border-color] duration-300 motion-reduce:transition-none',
                activePhase === phase.name ? 'border-border-strong' : 'border-border',
                stage >= ({ climb: 1, peak: 2, taper: 3 } as const)[phase.name] ? 'opacity-100' : 'opacity-40',
              )}
            >
              <span className="block text-xs text-fg-secondary">{PHASE_LABELS[phase.name]}</span>
              <span className="mt-0.5 block whitespace-nowrap text-[13px] font-medium tabular-nums text-fg sm:text-sm">{phaseSpan(phase)}</span>
              <span className="mt-0.5 block whitespace-nowrap text-[11px] tabular-nums text-fg-secondary sm:text-xs">{phaseKw(phase)}</span>
            </button>
          ))}
        </div>
      ) : null}
      <p className="mt-3 text-xs leading-4 text-fg-secondary">
        {bandPath && band ? `${bandCaption(band.sessions, band.within_band_pct)} ` : ''}
        {sourceLine} Drag across the chart to read a point.
      </p>
    </ChargeCard>
  );
}
