import React from 'react';
import { Pause, Play } from 'lucide-react';
import { cn } from '@riviamigo/ui/lib/utils';
import type { Measure } from './tripDetailModel';

export function MeasureText({ measure, size = 'tile' }: { measure: Measure; size?: 'hero' | 'tile' | 'readout' }) {
  return (
    <span className="tabular-nums">
      {measure.value}
      {measure.unit ? (
        <small className={cn('ml-1 font-normal tracking-normal text-fg-secondary', size === 'hero' ? 'text-[15px]' : 'text-[13px]')}>
          {measure.unit}
        </small>
      ) : null}
    </span>
  );
}

export function TripHero({ label, measure, testId }: { label: string; measure: Measure; testId?: string }) {
  return (
    <div className="min-w-0" data-testid={testId}>
      <p className="text-xs leading-4 text-fg-secondary">{label}</p>
      <p className="mt-1 truncate text-[40px] font-[450] leading-[44px] tracking-[-0.5px] text-fg sm:text-[44px] sm:leading-[46px]">
        <MeasureText measure={measure} size="hero" />
      </p>
    </div>
  );
}

export interface TripTileProps {
  label: string;
  measure: Measure | null;
  context?: string | null;
}

/** A trip number with a label and one optional context line. A tile without a value is not shown. */
export function TripTile({ label, measure, context }: TripTileProps) {
  if (!measure) return null;
  return (
    <div className="min-w-0" data-trip-tile={label}>
      <p className="text-xs leading-4 text-fg-secondary">{label}</p>
      <p className="mt-0.5 text-[22px] font-[450] leading-7 text-fg"><MeasureText measure={measure} /></p>
      {context ? <p className="mt-1 text-[13px] leading-[18px] text-fg-secondary">{context}</p> : null}
    </div>
  );
}

export interface ReadoutItem {
  label: string;
  value: string | null;
}

export interface TripReplayControlsProps {
  playing: boolean;
  onToggle: () => void;
  max: number;
  value: number | null;
  onScrub: (index: number) => void;
  clock: string | null;
  valueText: string;
  readout: ReadoutItem[];
  disabled?: boolean;
}

/** Play button, drive-time scrubber and the readout for the selected moment. */
export function TripReplayControls({
  playing, onToggle, max, value, onScrub, clock, valueText, readout, disabled = false,
}: TripReplayControlsProps) {
  return (
    <div data-trip-replay>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          aria-label={playing ? 'Pause the replay' : 'Replay the drive'}
          aria-pressed={playing}
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-fg text-bg-page transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {playing
            ? <Pause className="h-5 w-5" aria-hidden="true" fill="currentColor" />
            : <Play className="ml-0.5 h-5 w-5" aria-hidden="true" fill="currentColor" />}
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(0, max)}
          step={1}
          value={value ?? 0}
          disabled={disabled}
          aria-label="Drive time"
          aria-valuetext={valueText}
          onChange={(event) => onScrub(Number(event.currentTarget.value))}
          className="h-11 min-w-0 flex-1 cursor-pointer accent-[var(--rm-text-primary)] disabled:cursor-not-allowed"
        />
        <span className="w-[4.75rem] shrink-0 text-right text-[13px] tabular-nums text-fg-secondary" data-trip-replay-clock>
          {clock ?? ''}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-4 gap-2" data-trip-readout>
        {readout.map(item => (
          <div key={item.label} className="min-w-0 rounded-xl bg-bg-elevated px-2.5 py-2">
            <dt className="text-xs leading-4 text-fg-secondary">{item.label}</dt>
            <dd className={cn('mt-0.5 break-words font-medium tabular-nums', item.value ? 'text-[15px] text-fg' : 'text-xs text-fg-secondary')}>
              {item.value ?? 'No reading'}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
