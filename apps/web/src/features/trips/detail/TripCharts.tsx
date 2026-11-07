import React from 'react';
import { CHART_COLORS, RichTimeSeriesChart, type RichSeries } from '@riviamigo/ui/charts';
import { cn } from '@riviamigo/ui/lib/utils';
import { formatElapsedMinutes, type SpeedBand } from './tripDetailModel';

export function TripCard({ title, description, children, className, ...rest }: {
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, 'title'>) {
  const headingId = React.useId();
  return (
    <section aria-labelledby={headingId} className={cn('min-w-0 rounded-2xl border border-border bg-bg-surface p-4', className)} {...rest}>
      <h2 id={headingId} className="text-[15px] font-medium leading-5 text-fg">{title}</h2>
      {description ? <div className="mt-0.5 text-[13px] leading-[18px] text-fg-secondary">{description}</div> : null}
      {children}
    </section>
  );
}

const roundValue = (value: number | null | undefined, unit?: string) =>
  value == null || !Number.isFinite(value) ? 'No reading' : `${Math.round(value)}${unit ? ` ${unit}` : ''}`;

export interface TripTimeChartProps {
  points: Array<{ ts: number }>;
  series: RichSeries[];
  unit: string;
  xSplits: number[] | undefined;
  activeIndex: number | null;
  onIndexChange: (index: number | null) => void;
  height: number;
  loading?: boolean | undefined;
  zeroLine?: boolean;
  emptyTitle: string;
}

/** One-axis trip chart with a minute x-axis ("0 min", "10 min"), linked to the shared sample. */
export function TripTimeChart({
  points, series, unit, xSplits, activeIndex, onIndexChange, height, loading, zeroLine = false, emptyTitle,
}: TripTimeChartProps) {
  const referenceLines = React.useMemo(
    () => (zeroLine ? [{ value: 0, color: CHART_COLORS.muted }] : []),
    [zeroLine],
  );
  return (
    <RichTimeSeriesChart
      points={points}
      series={series}
      loading={loading ?? false}
      height={height}
      xTime={false}
      xUnit="s"
      xSplits={xSplits}
      xValueFormatter={formatElapsedMinutes}
      yUnit={unit}
      yValueFormatter={roundValue}
      showLegend={series.length > 1}
      activeCursorIndex={activeIndex}
      onCursorIndexChange={onIndexChange}
      connectGaps
      referenceLines={referenceLines}
      emptyTitle={emptyTitle}
    />
  );
}

export interface SpeedBandsProps {
  bands: SpeedBand[];
  unit: string;
  activeMin: number | null;
}

/** "Time at each speed": one horizontal bar per speed band, labelled in minutes. */
export function SpeedBands({ bands, unit, activeMin }: SpeedBandsProps) {
  const longest = Math.max(1, ...bands.map(band => band.seconds));
  return (
    <ul className="mt-3 space-y-2" aria-label={`Minutes at each speed, ${unit}`}>
      {bands.map((band) => {
        const minutes = Math.round(band.seconds / 60);
        const active = activeMin === band.min;
        return (
          <li key={band.min} className="grid grid-cols-[4.5rem_minmax(0,1fr)_3.75rem] items-center gap-3 text-[13px] tabular-nums"
            data-speed-band={band.label} data-active={active || undefined}>
            <span className="text-fg-secondary">{band.label} <span className="sr-only">{unit}</span></span>
            <span className="h-3 overflow-hidden rounded-full bg-bg-elevated" aria-hidden="true">
              <span
                className={cn('block h-full rounded-full transition-[width,opacity] duration-300 motion-reduce:transition-none', active ? 'opacity-100' : 'opacity-80')}
                style={{ width: `${Math.max(2, band.seconds / longest * 100)}%`, backgroundColor: CHART_COLORS.accent }}
              />
            </span>
            <span className={cn('text-right', active ? 'font-semibold text-fg' : 'text-fg')}>
              {minutes < 1 && band.seconds > 0 ? '<1 min' : `${minutes} min`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
