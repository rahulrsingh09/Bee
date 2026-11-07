import React from 'react';
import { formatMiles } from '@riviamigo/ui/lib/utils';
import { splitUnit, weekLine, type WeekSummary } from './nowModel';
import { useArrived } from './useNowMotion';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** Digits roll from 0 to their value on the first view; separators stay still. */
export function RollingNumber({ text, animate }: { text: string; animate: boolean }) {
  const arrived = useArrived(animate);
  return <span className="now-roll" aria-hidden="true" data-animate={animate || undefined}>
    {[...text].map((char, index) => /\d/.test(char)
      ? <span key={index} className="now-roll-window">
        <span className="now-roll-column" style={{ transform: `translateY(${arrived ? -10 * Number(char) : 0}%)` }}>
          {DIGITS.map(digit => <span key={digit}>{digit}</span>)}
        </span>
      </span>
      : <span key={index} className="now-roll-separator">{char}</span>)}
  </span>;
}

export function NowOdometer({ odometerMi, week, weekState, animate, onRetry }: {
  odometerMi: number | null; week: WeekSummary | null; weekState: 'loading' | 'error' | 'ready'; animate: boolean;
  onRetry: () => void;
}) {
  const arrived = useArrived(animate);
  const odometer = odometerMi == null ? null : splitUnit(formatMiles(odometerMi, 0));
  const max = Math.max(1, ...(week?.days.map(day => day.miles) ?? [0]));
  return <section className="now-card now-odometer" aria-labelledby="now-odometer-title">
    <h2 id="now-odometer-title" className="now-label">Odometer</h2>
    {odometer ? <p className="now-odometer-value">
      <span className="sr-only">{odometer.value} {odometer.unit}</span>
      <RollingNumber text={odometer.value} animate={animate} />
      <small aria-hidden="true">{odometer.unit}</small>
    </p> : <p className="now-hero-missing">No odometer reading yet</p>}
    {weekState === 'loading' && <p className="now-context" role="status" aria-busy="true">Loading this week…</p>}
    {weekState === 'error' && <p className="now-context" role="alert">This week could not be loaded.{' '}
      <button type="button" className="now-retry" onClick={onRetry}>Retry</button></p>}
    {week && weekState === 'ready' && <>
      <p className="now-context">{weekLine(week)}</p>
      <div className="now-week" role="img"
        aria-label={`Miles per day: ${week.days.map(day => `${day.label} ${formatMiles(day.miles)}`).join(', ')}`}>
        {week.days.map(day => <span key={day.key} className="now-week-day" data-today={day.today || undefined}>
          <span className="now-week-bar"><span style={{ transform: `scaleY(${arrived ? Math.max(day.miles > 0 ? 0.04 : 0, day.miles / max) : 0})` }}
            data-animate={animate || undefined} /></span>
          <span className="now-week-label" aria-hidden="true">{day.label}</span>
        </span>)}
      </div>
    </>}
  </section>;
}
