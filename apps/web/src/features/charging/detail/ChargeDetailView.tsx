import React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Pencil } from 'lucide-react';
import { useChargeCurve, useChargeSession, useInsights, useSavedPlaces } from '@riviamigo/hooks';
import { describeChargeCurve } from '@riviamigo/dashboards';
import type { ChargeSession, ChargeShapeValues, InsightScope, UsualDcBandValues } from '@riviamigo/types';
import { Button, Skeleton } from '@riviamigo/ui/primitives';
import { getUnitPreferences } from '@riviamigo/ui/lib/utils';
import { formatAppDate, formatAppTime } from '@riviamigo/ui/lib/dateTime';
import {
  averagePowerKw, buildChargeCurve, chargeKind, chargeKindLabel, chargeTitle, costDisplay, formatKw, formatMinutes,
  heroLine, matchSavedPlace, pointContext, timeRangeText,
} from './chargeDetailModel';
import { BatteryBar, ChargeCard, ChargeTile, type ChargeTileProps } from './ChargeStats';
import { ChargeCurveCard } from './ChargeCurveCard';
import { ChargeCostBox } from './ChargeCostBox';
import { ChargeLocationEditor } from './ChargeLocationEditor';
import { ChargeSourceDetails } from './ChargeSourceDetails';

function useDistanceUnit() {
  const [unit, setUnit] = React.useState(() => getUnitPreferences().distance_unit);
  React.useEffect(() => {
    const update = () => setUnit(getUnitPreferences().distance_unit);
    window.addEventListener('rm-units-change', update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener('rm-units-change', update);
      window.removeEventListener('storage', update);
    };
  }, []);
  return unit;
}

export interface ChargeDetailViewProps {
  sessionId: string;
  vehicleId: string;
  canManage: boolean;
}

/** Charge detail: place and time, energy added, the power curve, tiles and the cost box. */
export function ChargeDetailView({ sessionId, vehicleId, canManage }: ChargeDetailViewProps) {
  const navigate = useNavigate();
  const distanceUnit = useDistanceUnit();
  const sessionQuery = useChargeSession(sessionId, vehicleId);
  // Placeholder data from the previous charge must not show under this URL.
  const session = sessionQuery.data?.id === sessionId ? sessionQuery.data : undefined;
  const active = session != null && session.ended_at == null;
  const curveQuery = useChargeCurve(sessionId, vehicleId, active);
  const placesQuery = useSavedPlaces();
  const insights = useInsights(vehicleId, `charge:${sessionId}` as InsightScope);
  const [editing, setEditing] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  React.useEffect(() => { setEditing(false); setStatus(null); }, [sessionId]);

  const places = React.useMemo(() => placesQuery.data ?? [], [placesQuery.data]);
  const rawCurve = React.useMemo(() => curveQuery.data ?? [], [curveQuery.data]);
  const curve = React.useMemo(() => (session ? buildChargeCurve(rawCurve, session) : null), [rawCurve, session]);
  const chargerLimited = React.useMemo(() => describeChargeCurve(rawCurve)?.pattern === 'charger_limited', [rawCurve]);
  const list = insights.data?.insights ?? [];
  const shape = (list.find((insight) => insight.kind === 'charge_shape')?.values ?? null) as ChargeShapeValues | null;
  const band = (list.find((insight) => insight.kind === 'usual_dc_band')?.values ?? null) as UsualDcBandValues | null;

  const backButton = (
    <button
      type="button"
      aria-label="Back to charging"
      onClick={() => navigate({ to: '/charging' })}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-bg-surface pl-2.5 pr-3.5 text-sm text-fg transition-colors hover:bg-bg-elevated"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Charging
    </button>
  );

  if (!session) {
    return (
      <div className="space-y-4" data-charge-detail="loading">
        {backButton}
        {sessionQuery.isError ? (
          <ChargeCard title="Couldn’t load this charge">
            <p className="mt-1 text-[13px] text-fg-secondary">The charge data did not load. Try again.</p>
            <Button type="button" variant="secondary" className="mt-3 min-h-11" onClick={() => void sessionQuery.refetch()}>Try again</Button>
          </ChargeCard>
        ) : (
          <div className="space-y-3" aria-busy="true"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-36 w-full" /><Skeleton className="h-72 w-full" /></div>
        )}
      </div>
    );
  }

  const savedPlace = matchSavedPlace(session, places);
  const atHome = savedPlace?.is_home ?? session.location_name?.trim().toLocaleLowerCase() === 'home';
  const kind = chargeKind(session);
  const tag = chargeKindLabel(kind);
  const { title, where } = chargeTitle(session, savedPlace);
  const start = new Date(session.started_at);
  const dateText = formatAppDate(start, { weekday: 'short', month: 'short', day: 'numeric', year: undefined });
  const timeText = session.ended_at
    ? timeRangeText(formatAppTime(start), formatAppTime(new Date(session.ended_at)))
    : `${formatAppTime(start)} · Charging now`;
  const subtitle = [where, dateText, timeText].filter(Boolean).join(' · ');

  const energy = active ? session.live_total_charged_kwh ?? session.energy_added_kwh : session.energy_added_kwh;
  const minutes = active && session.live_time_elapsed_seconds != null ? session.live_time_elapsed_seconds / 60 : session.duration_min;
  const socEnd = active ? session.live_soc_pct ?? session.soc_end : session.soc_end;
  const range = active ? session.live_range_added_km ?? session.range_added_km : session.range_added_km;
  const line = heroLine({ socStart: session.soc_start, socEnd, minutes, rangeKm: range, distanceUnit, live: active });

  const tiles = buildTiles(session, curve, shape, energy, minutes, atHome);
  const unpriced = !active && (session.cost_method === 'unknown' || (session.cost_method == null && session.cost_usd == null));
  const costBoxProps = {
    session, vehicleId, kwh: session.energy_added_kwh, savedPlace, atHome, placeName: title,
    placesReady: placesQuery.isSuccess,
  } as const;

  return (
    <div data-charge-detail className="lg:grid lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)] lg:items-start lg:gap-x-6">
      <div className="mb-3 lg:col-span-2">{backButton}</div>

      <header className="flex items-start justify-between gap-3 lg:col-span-2">
        <div className="min-w-0">
          <h1 className="break-words text-[26px] font-medium leading-8 text-fg">{title}</h1>
          <p className="mt-1 text-[13px] leading-[18px] text-fg-secondary">{subtitle}</p>
          {tag ? (
            <span data-charge-tag={kind}
              className="mt-2.5 inline-flex min-h-6 items-center gap-1.5 rounded-full border border-border bg-bg-surface px-2.5 text-[11px] font-semibold tracking-[.4px] text-fg">
              <span aria-hidden="true" className={kind === 'ac' ? 'h-2 w-2 rounded-full bg-charging-ac' : 'h-2 w-2 rounded-full bg-charging-dc'} />
              {tag}
            </span>
          ) : null}
        </div>
        {canManage ? (
          <Button type="button" variant="secondary" className="min-h-11 shrink-0 whitespace-nowrap" aria-expanded={editing}
            onClick={() => { setEditing((value) => !value); setStatus(null); }}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            {editing ? 'Done' : 'Edit'}
          </Button>
        ) : null}
      </header>

      <div className="mt-4 min-w-0 space-y-4">
        {status ? <p role="status" className="rounded-lg border border-status-positive/30 bg-status-positive/10 px-3 py-2 text-sm text-status-positive">{status}</p> : null}
        {editing ? (
          <div className="space-y-4" data-charge-editor>
            <ChargeCostBox {...costBoxProps} variant="edit" onDone={(message) => { setStatus(message); setEditing(false); }} />
            <ChargeLocationEditor session={session} vehicleId={vehicleId} places={places}
              placesLoading={placesQuery.isLoading || placesQuery.isFetching} placesError={placesQuery.isError}
              onDone={(message) => { setStatus(message); setEditing(false); }} />
          </div>
        ) : null}

        <section aria-label="Energy added" className="rounded-2xl border border-border bg-bg-surface p-4" data-charge-hero>
          <p className="text-xs leading-4 text-fg-secondary">Energy added{active ? ' so far' : ''}</p>
          <p className="mt-1 text-[44px] font-[450] leading-[48px] tracking-[-0.5px] tabular-nums text-fg">
            {energy != null ? Number(energy.toFixed(1)) : '—'}
            <small className="ml-1 text-[15px] font-normal tracking-normal text-fg-secondary">kWh</small>
          </p>
          {line ? <p className="mt-1.5 text-[13px] leading-[18px] text-fg-secondary" data-charge-hero-line>{line}</p> : null}
          {session.soc_start != null && socEnd != null ? <BatteryBar start={session.soc_start} end={socEnd} kind={kind} /> : null}
        </section>

        <ChargeCurveCard curve={curve} shape={shape} band={band} chargerLimited={chargerLimited} kind={kind}
          peakKw={session.peak_power_kw} loading={curveQuery.isLoading} />
      </div>

      <div className="mt-4 min-w-0 space-y-4 lg:mt-4">
        <div className="grid grid-cols-2 gap-3" data-charge-tiles>
          {tiles.map((tile) => <ChargeTile key={tile.label} {...tile} />)}
        </div>
        {canManage && unpriced && !editing ? (
          <ChargeCostBox {...costBoxProps} variant="prompt" onDone={setStatus} />
        ) : null}
        <ChargeSourceDetails session={session} />
      </div>
    </div>
  );
}

function buildTiles(
  session: ChargeSession,
  curve: ReturnType<typeof buildChargeCurve>,
  shape: ChargeShapeValues | null,
  energy: number | null | undefined,
  minutes: number | null | undefined,
  atHome: boolean,
): ChargeTileProps[] {
  const active = session.ended_at == null;
  const curvePeak = curve ? curve.points[curve.peakIndex] : null;
  const peakKw = shape?.peak_kw ?? curvePeak?.kw ?? session.peak_power_kw ?? null;
  const peakContext = shape
    ? pointContext(shape.peak_soc, shape.peak_minute, false)
    : curvePeak ? pointContext(curvePeak.soc, curvePeak.minute, false) : null;
  const lowPoint = curve && curve.lowIndex !== curve.peakIndex ? curve.points[curve.lowIndex] : null;
  const lowKw = shape?.low_kw ?? lowPoint?.kw ?? null;
  const lowAtEnd = curve != null && curve.lowIndex === curve.points.length - 1;
  const lowContext = shape
    ? pointContext(shape.low_soc, lowPoint?.minute ?? null, lowAtEnd)
    : lowPoint ? pointContext(lowPoint.soc, lowPoint.minute, lowAtEnd) : null;
  const average = averagePowerKw(energy, minutes);
  const cost = costDisplay(session, atHome);
  const tiles: ChargeTileProps[] = [
    { label: 'Peak power', value: peakKw != null && peakKw > 0 ? formatKw(peakKw) : null, unit: 'kW', context: peakContext },
    { label: 'Lowest power', value: lowKw != null && peakKw != null && lowKw < peakKw ? formatKw(lowKw) : null, unit: 'kW', context: lowContext },
    { label: 'Average power', value: average != null ? formatKw(average) : null, unit: 'kW', context: minutes != null ? `Over ${formatMinutes(minutes)}` : null },
    { label: 'Cost', value: cost.value, context: cost.context, attention: cost.attention },
  ];
  if (active) {
    if (session.live_power_kw != null) tiles.unshift({ label: 'Power now', value: formatKw(session.live_power_kw), unit: 'kW', context: 'Live' });
    if (session.live_time_remaining_min != null) tiles.push({ label: 'Time left', value: formatMinutes(session.live_time_remaining_min), context: 'Rivian estimate' });
  }
  return tiles;
}
