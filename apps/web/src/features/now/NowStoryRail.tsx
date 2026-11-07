import React from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowUpRight } from 'lucide-react';
import type { ChargeSession, Insight, PhantomDrainPeriod, Trip } from '@riviamigo/types';
import { useTripTrack } from '@riviamigo/hooks';
import {
  formatCurrency, formatDuration, formatEfficiency, formatKwh, formatMiles, formatNumber,
} from '@riviamigo/ui/lib/utils';
import { formatAppTime } from '@riviamigo/ui/lib/dateTime';
import { chargeKind, type ChargeKind } from '../charging/detail/chargeDetailModel';
import { eventTime, railTitle, routePath } from './nowModel';
import { useSeenOnce } from './useNowMotion';

const VIZ_W = 240;
const VIZ_H = 96;

/** Draws its mini picture when the card is first visible (first Now view only). */
function StoryCard({ to, params, eyebrow, title, value, context, viz, animate }: {
  to: '/trips/$tripId' | '/charging/$sessionId' | '/battery/phantom-drain';
  params?: Record<string, string>;
  eyebrow: string; title: string; value: string; context: string; viz: React.ReactNode; animate: boolean;
}) {
  const [ref, seen] = useSeenOnce<HTMLLIElement>(animate);
  return <li ref={ref} className="now-story-item">
    <Link to={to} params={params as never} className="now-card now-story" data-draw={animate ? (seen ? 'done' : 'pending') : undefined}>
      <span className="now-label">{eyebrow}</span>
      {viz && <span className="now-story-viz" aria-hidden="true">{viz}{animate && <span className="now-viz-wipe" />}</span>}
      <h3>{title}</h3>
      <strong className="now-story-value">{value}</strong>
      <span className="now-context">{context}</span>
    </Link>
  </li>;
}

function DriveViz({ path }: { path: string }) {
  return <svg viewBox={`0 0 ${VIZ_W} ${VIZ_H}`} className="now-route" focusable="false">
    <path d={path} />
  </svg>;
}

/** A battery bar from `from` to `to`; `kind` sets the mark color. */
function BatterySpan({ from, to, kind }: { from: number; to: number; kind: ChargeKind | 'loss' | 'unknown' }) {
  const low = Math.max(0, Math.min(from, to, 100));
  const high = Math.min(100, Math.max(from, to, 0));
  return <span className="now-span-track" data-kind={kind}>
    <span className="now-span-base" style={{ transform: `scaleX(${low / 100})` }} />
    <span className="now-span-mark" style={{ left: `${low}%`, width: `${high - low}%` }} />
  </span>;
}

/** Title text for the charge kind. The kind uses the charge detail rule (type, then network, then power); null when not known. */
function chargeKindTitle(kind: ChargeKind | null) {
  return kind === 'dc' ? 'DC fast' : kind === 'ac' ? 'AC' : null;
}

export function NowStoryRail({ vehicleId, trip, charge, park, insights, loading, failed, onRetry, now, animate }: {
  vehicleId: string; trip: Trip | undefined; charge: ChargeSession | undefined; park: PhantomDrainPeriod | undefined;
  insights: readonly Insight[] | undefined; loading: boolean; failed: boolean; onRetry: () => void; now: number; animate: boolean;
}) {
  const title = railTitle([trip?.ended_at ?? trip?.started_at, charge?.ended_at ?? charge?.started_at, park?.period_end], now);
  const track = useTripTrack(trip?.id ?? null, vehicleId);
  const route = track.isPlaceholderData ? null : routePath(track.data, VIZ_W, VIZ_H);
  const parkedLoss = insights?.find((insight): insight is Extract<Insight, { kind: 'high_parked_loss' }> => insight.kind === 'high_parked_loss');
  const cards: React.ReactNode[] = [];
  if (trip) {
    const places = `${trip.start_place || trip.start_address || 'Start'} → ${trip.end_place || trip.end_address || 'Destination'}`;
    cards.push(<StoryCard key="drive" to="/trips/$tripId" params={{ tripId: trip.id }} animate={animate}
      eyebrow={`Last drive · ${eventTime(trip.started_at, now)}`} title={places} value={formatMiles(trip.distance_mi, 1)}
      context={[formatDuration(trip.duration_min), trip.efficiency_wh_mi != null ? formatEfficiency(trip.efficiency_wh_mi) : null].filter(Boolean).join(' · ')}
      viz={route ? <DriveViz path={route} /> : null} />);
  }
  if (charge) {
    const kind = chargeKind(charge);
    const kindTitle = chargeKindTitle(kind);
    const battery = charge.soc_start != null && charge.soc_end != null ? `${Math.round(charge.soc_start)}% → ${Math.round(charge.soc_end)}%` : null;
    cards.push(<StoryCard key="charge" to="/charging/$sessionId" params={{ sessionId: charge.id }} animate={animate}
      eyebrow={`Last charge · ${eventTime(charge.started_at, now)}`}
      title={[charge.location_name || 'Charge', kindTitle].filter(Boolean).join(' · ')}
      value={charge.energy_added_kwh != null ? `+${formatKwh(charge.energy_added_kwh)}` : 'Energy not reported'}
      context={[battery, charge.duration_min != null ? formatDuration(charge.duration_min) : null, charge.cost_usd != null ? formatCurrency(charge.cost_usd) : null].filter(Boolean).join(' · ')}
      viz={charge.soc_start != null && charge.soc_end != null ? <BatterySpan from={charge.soc_start} to={charge.soc_end} kind={kind ?? 'unknown'} /> : null} />);
  }
  if (park?.period_start) {
    const sameStart = parkedLoss && Math.abs(Date.parse(parkedLoss.values.started_at) - Date.parse(park.period_start)) < 5 * 60_000;
    const usual = sameStart && parkedLoss.values.ratio != null
      ? `${formatNumber(parkedLoss.values.ratio, 1)}× your usual drain rate` : null;
    const rate = park.drain_pct_per_hour != null ? `${formatNumber(park.drain_pct_per_hour, 2)}% per hour` : null;
    const span = park.period_end
      ? `${eventTime(park.period_start, now)}–${formatAppTime(park.period_end)}` : `Since ${eventTime(park.period_start, now)}`;
    cards.push(<StoryCard key="park" to="/battery/phantom-drain" animate={animate}
      eyebrow="Last park" title={span} value={`Parked loss −${formatNumber(park.soc_lost_pct ?? 0, 1)}%`}
      context={[park.duration_hours != null ? formatDuration(park.duration_hours * 60) : null, usual ?? rate].filter(Boolean).join(' · ')}
      viz={park.soc_start != null && park.soc_end != null ? <BatterySpan from={park.soc_end} to={park.soc_start} kind="loss" /> : null} />);
  }
  return <section className="now-stories" aria-labelledby="now-stories-title">
    <div className="now-section-heading">
      <h2 id="now-stories-title" className="now-section-title">{title}</h2>
      <Link to="/trips" className="now-more">All activity <ArrowUpRight aria-hidden="true" /></Link>
    </div>
    {failed && !cards.length ? <p className="now-context" role="alert">Recent activity could not be loaded.{' '}
      <button type="button" className="now-retry" onClick={onRetry}>Retry</button></p>
      : loading && !cards.length ? <p className="now-context" role="status" aria-busy="true">Loading recent activity…</p>
      : !cards.length ? <p className="now-context">No drives, charges or parks yet.</p>
      : <ul className="now-rail">{cards}</ul>}
  </section>;
}
