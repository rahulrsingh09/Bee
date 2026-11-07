import React from 'react';
import { formatMiles } from '@riviamigo/ui/lib/utils';
import { splitUnit } from './nowModel';
import { useArrived, useCountUp } from './useNowMotion';

/** Battery % and range heroes, the limit bar and the "enough for about N days" sentence. */
export function NowEnergy({ battery, limit, rangeMi, daysSentence, animate }: {
  battery: number | null; limit: number | null; rangeMi: number | null; daysSentence: string | null; animate: boolean;
}) {
  const shownBattery = useCountUp(battery, animate);
  const shownRange = useCountUp(rangeMi, animate);
  const arrived = useArrived(animate);
  const range = shownRange == null ? null : splitUnit(formatMiles(shownRange));
  const finalRange = rangeMi == null ? null : formatMiles(rangeMi);
  const context = [limit != null ? `Limit ${Math.round(limit)}%` : null, daysSentence].filter(Boolean).join(' · ');
  const fill = battery == null ? 0 : Math.min(100, Math.max(0, battery)) / 100;
  return <section className="now-energy" aria-label="Battery and range">
    <div className="now-energy-heroes">
      <div className="now-hero">
        <span className="now-label">Battery</span>
        {battery == null ? <span className="now-hero-missing">No reading yet</span>
          : <strong className="now-hero-value" aria-label={`${Math.round(battery)}%`}>
            <span aria-hidden="true">{Math.round(shownBattery ?? battery)}</span><small aria-hidden="true">%</small>
          </strong>}
      </div>
      <div className="now-hero now-hero-end">
        <span className="now-label">Range</span>
        {finalRange == null || !range ? <span className="now-hero-missing">No reading yet</span>
          : <strong className="now-hero-value" aria-label={finalRange}>
            <span aria-hidden="true">{range.value}</span><small aria-hidden="true">{range.unit}</small>
          </strong>}
      </div>
    </div>
    {battery != null && <div className="now-limit-track" role="img"
      aria-label={limit != null ? `Battery ${Math.round(battery)}%, limit ${Math.round(limit)}%` : `Battery ${Math.round(battery)}%`}>
      <span className="now-limit-fill" style={{ transform: `scaleX(${arrived ? fill : 0})` }} data-animate={animate || undefined} />
      {limit != null && <span className="now-limit-marker" style={{ left: `${Math.min(100, Math.max(0, limit))}%` }} />}
    </div>}
    {context && <p className="now-context">{context}</p>}
  </section>;
}
