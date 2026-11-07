import React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Tag } from 'lucide-react';
import {
  useAuth, useBasemapConfig, useInsights, useSavedPlaces, useTripDetailData, useUserPreferences,
} from '@riviamigo/hooks';
import { useDocumentTheme } from '@riviamigo/ui/hooks';
import { CHART_COLORS, TripMapChart, nearestPointIndex, type RichSeries } from '@riviamigo/ui/charts';
import { TripTagBadge } from '@riviamigo/ui/tables';
import { Button, Skeleton } from '@riviamigo/ui/primitives';
import { getUnitPreferences, type UnitPreferences } from '@riviamigo/ui/lib/utils';
import { resolveTripLocation, TRIP_LOCATION_UNAVAILABLE_COPY } from '@riviamigo/ui/lib/tripPresentation';
import { formatAppDate, formatAppTime } from '@riviamigo/ui/lib/dateTime';
import { formatDriveMode } from '@riviamigo/ui/lib/driveMode';
import type { InsightScope, Trip } from '@riviamigo/types';
import { buildTripSpeedProfile, resolveTripDurationSeconds } from '../tripSpeedProfile';
import {
  ELEVATION_CHART_MIN_RANGE_M, averageSpeedMph, buildConditions, buildSpeedBands, buildTimeline,
  cumulativeDistanceMiles, distanceMeasure, efficiencyFromMiPerKwh, efficiencyMeasure, findHomePrice,
  findRouteComparison, formatElapsedMinutes, formatMoney, joinMeasure, minuteSplits, odometerMeasure,
  peakPowerKw, rankText, readoutPowerKw, regenEnergyKwh, routeDifferenceText, routeTitle, speedCoverageText,
  speedMeasure, summarizeElevation, tripCost, type Measure,
} from './tripDetailModel';
import { TripHero, TripReplayControls, TripTile } from './TripStats';
import { SpeedBands, TripCard, TripTimeChart } from './TripCharts';
import { TripTagEditor, useTripTagEditing } from './TripTagEditor';
import { useTripReplay } from './useTripReplay';

const PHONE_MAP_HEIGHT = 330;
const DESKTOP_MAP_HEIGHT = 440;
const DESKTOP_QUERY = '(min-width: 1024px)';

function useUnitPreferencesState(): UnitPreferences {
  const [prefs, setPrefs] = React.useState(getUnitPreferences);
  React.useEffect(() => {
    const update = () => setPrefs(getUnitPreferences());
    window.addEventListener('rm-units-change', update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener('rm-units-change', update);
      window.removeEventListener('storage', update);
    };
  }, []);
  return prefs;
}

function useIsDesktop() {
  const [desktop, setDesktop] = React.useState(() => typeof window !== 'undefined'
    && typeof window.matchMedia === 'function' && window.matchMedia(DESKTOP_QUERY).matches);
  React.useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia(DESKTOP_QUERY);
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  return desktop;
}

function percent(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? null : `${Math.round(value)}%`;
}

export interface TripDetailViewProps {
  tripId: string;
  vehicleId: string;
  canManageTags: boolean;
}

/** Trip detail: map first, a summary sheet with replay, then charts and conditions. */
export function TripDetailView({ tripId, vehicleId, canManageTags }: TripDetailViewProps) {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const isDark = useDocumentTheme();
  const basemap = useBasemapConfig();
  const userPreferences = useUserPreferences();
  const prefs = useUnitPreferencesState();
  const isDesktop = useIsDesktop();
  const detail = useTripDetailData(tripId, vehicleId);
  const places = useSavedPlaces();
  const insights = useInsights(vehicleId, `trip:${tripId}` as InsightScope);

  // Placeholder data from the previous trip must not show under this trip's URL.
  const detailData = detail.data?.trip?.id === tripId ? detail.data : undefined;
  const trip = detailData?.trip;
  const samples = detailData?.samples;
  const tagEditing = useTripTagEditing(trip, vehicleId);

  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);
  React.useEffect(() => setActiveIndex(null), [tripId]);

  const timeline = React.useMemo(() => buildTimeline(trip?.started_at, samples), [trip?.started_at, samples]);
  const elapsed = React.useMemo(() => timeline.map(point => point.elapsed_s), [timeline]);
  const chartPoints = React.useMemo(() => timeline.map(point => ({ ts: point.elapsed_s })), [timeline]);
  const durationSeconds = resolveTripDurationSeconds(trip as (Trip & { duration_seconds?: number | null }) | undefined);
  const replay = useTripReplay(elapsed, activeIndex, setActiveIndex);

  // Every owner selection (map, chart, scrubber) stops the replay first.
  const selectIndex = React.useCallback((index: number | null) => {
    if (replay.playing) replay.stop();
    setActiveIndex(index);
  }, [replay]);

  const mapTrack = React.useMemo(() => timeline.flatMap((point, sampleIndex) =>
    point.lat != null && point.lng != null ? [{ lat: point.lat, lng: point.lng, sampleIndex }] : []), [timeline]);
  const activePoint = activeIndex == null ? null : timeline[activeIndex] ?? null;
  const activeMapPoint = activePoint?.lat != null && activePoint.lng != null
    ? { lat: activePoint.lat, lng: activePoint.lng } : null;

  const speedProfile = React.useMemo(
    () => buildTripSpeedProfile(timeline, durationSeconds, detailData?.sample_interval_seconds ?? 10),
    [detailData?.sample_interval_seconds, durationSeconds, timeline],
  );
  const speedBands = React.useMemo(() => buildSpeedBands(speedProfile.bins, prefs), [prefs, speedProfile.bins]);
  const powerEstimated = (detailData?.power?.source
    ?? (timeline.some(point => point.power_kw != null || point.regen_kw != null) ? 'direct' : 'unavailable')) === 'estimated_soc';
  const regenKwh = React.useMemo(() => (powerEstimated ? null : regenEnergyKwh(timeline)), [powerEstimated, timeline]);
  const peakKw = React.useMemo(() => peakPowerKw(timeline, powerEstimated), [powerEstimated, timeline]);
  const distanceAt = React.useMemo(() => cumulativeDistanceMiles(timeline, trip?.distance_mi), [timeline, trip?.distance_mi]);
  const elevation = React.useMemo(() => summarizeElevation(timeline), [timeline]);
  const comparison = findRouteComparison(insights.data?.insights, tripId);
  const homePrice = findHomePrice(places.data);

  const powerSeries = React.useMemo<RichSeries[]>(() => (powerEstimated
    ? [{ key: 'estimated_net_power', label: 'Estimated power', color: CHART_COLORS.accent, values: timeline.map(point => point.estimated_net_power_kw) }]
    : [
      ...(timeline.some(point => point.power_kw != null)
        ? [{ key: 'power', label: 'Power', color: CHART_COLORS.accent, values: timeline.map(point => point.power_kw) }] : []),
      ...(timeline.some(point => point.regen_kw != null && point.regen_kw !== 0)
        ? [{ key: 'regen', label: 'Regen', color: CHART_COLORS.success, values: timeline.map(point => point.regen_kw) }] : []),
    ]), [powerEstimated, timeline]);
  const elevationSeries = React.useMemo<RichSeries[]>(() => [{
    key: 'elevation', label: 'Elevation', color: CHART_COLORS.teal,
    values: timeline.map(point => point.altitude_m == null ? null : prefs.altitude_unit === 'meters' ? point.altitude_m : point.altitude_m * 3.28084),
  }], [prefs.altitude_unit, timeline]);
  const xSplits = React.useMemo(() => minuteSplits(elapsed.at(-1) ?? durationSeconds), [durationSeconds, elapsed]);

  const start = trip ? resolveTripLocation(trip as unknown as Record<string, unknown>, 'start', places.data ?? []) : null;
  const end = trip ? resolveTripLocation(trip as unknown as Record<string, unknown>, 'end', places.data ?? []) : null;
  const title = start && end ? routeTitle(start, end) ?? TRIP_LOCATION_UNAVAILABLE_COPY : 'Trip';
  const subtitle = trip ? tripSubtitle(trip, durationSeconds) : null;

  const distance = distanceMeasure(trip?.distance_mi, prefs);
  const odometerEnd = odometerMeasure(trip?.end_odometer_mi, prefs);
  const odometerStart = odometerMeasure(trip?.start_odometer_mi, prefs);
  const batteryLine = trip?.soc_start != null && trip.soc_end != null
    ? `battery ${percent(trip.soc_start)} → ${percent(trip.soc_end)}` : null;
  const odometerLine = odometerStart && odometerEnd ? `Odometer ${odometerStart.value} → ${odometerEnd.value} ${odometerEnd.unit}` : null;
  const factsLine = [odometerLine, batteryLine].filter(Boolean).join(' · ');
  const cost = trip ? tripCost(trip, homePrice) : null;
  const averageSpeed = averageSpeedMph(trip?.distance_mi, durationSeconds);

  const tiles: Array<{ label: string; measure: Measure | null; context?: string | null }> = [
    { label: 'Efficiency', measure: efficiencyMeasure(trip?.efficiency_wh_mi, prefs), context: comparison ? routeDifferenceText(comparison) : null },
    { label: 'Energy used', measure: trip?.energy_used_kwh != null ? { value: trip.energy_used_kwh.toFixed(1), unit: 'kWh' } : null,
      context: regenKwh != null && regenKwh >= 0.05 ? `Regen returned ${regenKwh.toFixed(1)} kWh` : null },
    { label: 'Cost', measure: cost != null && homePrice ? { value: formatMoney(cost, homePrice.currency), unit: '' } : null,
      context: homePrice ? `At your home price of ${formatMoney(homePrice.rate, homePrice.currency, 2)}/kWh` : null },
    { label: 'Average speed', measure: speedMeasure(averageSpeed, prefs),
      context: durationSeconds > 0 ? `Over ${formatElapsedMinutes(durationSeconds)}` : null },
  ];

  // Before a selection the readout shows the start of the drive.
  const readoutIndex = activeIndex ?? 0;
  const readoutPoint = timeline[readoutIndex] ?? null;
  const readoutSpeed = speedProfile.recordedValues[readoutIndex] ?? speedProfile.estimates[readoutIndex]?.mph ?? null;
  const readoutKw = readoutPowerKw(readoutPoint, powerEstimated);
  const readoutMiles = distanceAt?.[readoutIndex] ?? null;
  const readout = [
    { label: 'Speed', value: joinMeasure(speedMeasure(readoutSpeed, prefs)) },
    { label: 'Power', value: readoutKw == null || !Number.isFinite(readoutKw) ? null : `${readoutKw.toFixed(1)} kW` },
    { label: 'Battery', value: percent(readoutPoint?.battery_level) },
    { label: 'Distance', value: joinMeasure(distanceMeasure(readoutMiles, prefs)) },
  ];
  const clock = readoutPoint ? formatAppTime(readoutPoint.ts) : null;
  const valueText = readoutPoint
    ? `${formatElapsedMinutes(readoutPoint.elapsed_s)} of ${formatElapsedMinutes(elapsed.at(-1) ?? 0)}, ${clock}` : 'No samples';

  const activeSpeedBand = React.useMemo(() => {
    if (activeIndex == null) return null;
    const speed = speedProfile.recordedValues[activeIndex] ?? speedProfile.estimates[activeIndex]?.mph;
    return speed == null ? null : Math.floor(speed / 10) * 10;
  }, [activeIndex, speedProfile]);

  const conditions = buildConditions({
    timeline,
    outsideSamples: detailData?.outside_temperature?.samples,
    outsideEstimated: detailData?.outside_temperature?.source === 'open_meteo',
    tripOutsideC: trip?.outside_temp_c,
    driveModeLabel: trip?.drive_mode ? formatDriveMode(trip.drive_mode) : null,
    elevation,
    prefs,
  });

  const speedUnit = prefs.speed_unit === 'kmh' ? 'km/h' : 'mph';
  const topBand = speedBands.reduce<typeof speedBands[number] | null>((top, band) => (!top || band.seconds > top.seconds ? band : top), null);
  const coverage = speedCoverageText(speedProfile);
  const loading = detail.isLoading && !detailData;

  const backButton = (
    <button
      type="button"
      aria-label="Back to trips"
      onClick={() => navigate({ to: '/trips' })}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-bg-surface pl-2.5 pr-3.5 text-sm text-fg transition-colors hover:bg-bg-elevated"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Trips
    </button>
  );

  if (detail.isError && !detailData) {
    return (
      <div className="space-y-4">
        {backButton}
        <TripCard title="Couldn’t load this trip" description="The trip data did not load. Try again.">
          <Button type="button" variant="secondary" className="mt-3 min-h-11" onClick={() => void detail.refetch()}>Try again</Button>
        </TripCard>
      </div>
    );
  }

  return (
    <div data-trip-detail className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)] lg:grid-rows-[auto_auto_1fr] lg:gap-x-6">
      <div className="mb-3 lg:col-span-2">{backButton}</div>

      <div
        data-trip-map
        className="-mx-5 min-w-0 min-[901px]:mx-0 lg:col-start-1 lg:row-start-2 [&_.absolute.bottom-1]:bottom-7 min-[901px]:[&_.absolute.bottom-1]:bottom-1"
      >
        {loading ? (
          <Skeleton className="w-full min-[901px]:rounded-2xl" style={{ height: isDesktop ? DESKTOP_MAP_HEIGHT : PHONE_MAP_HEIGHT }} />
        ) : (
          <TripMapChart
            track={mapTrack}
            activePoint={activeMapPoint}
            activePointIndex={mapTrack.findIndex(point => point.sampleIndex === activeIndex)}
            onPointSelect={(point, index) => selectIndex(index == null
              ? nearestPointIndex(timeline, point) : mapTrack[index]?.sampleIndex ?? null)}
            height={isDesktop ? DESKTOP_MAP_HEIGHT : PHONE_MAP_HEIGHT}
            className="w-full overflow-hidden min-[901px]:rounded-2xl"
            mapStyle={isDark ? 'dark' : 'light'}
            mapStylePreference={userPreferences.data?.map_style ?? 'follow-theme'}
            accessToken={accessToken}
            basemapConfig={basemap.data}
            basemapError={basemap.isError ? 'Map configuration unavailable' : null}
            onBasemapRetry={() => void basemap.refetch()}
          />
        )}
      </div>

      <section
        aria-label="Trip summary"
        data-trip-summary
        className="relative z-10 -mx-5 -mt-6 rounded-t-3xl border-t border-border bg-bg-surface px-5 pb-5 pt-5 min-[901px]:mx-0 min-[901px]:mt-4 min-[901px]:rounded-2xl min-[901px]:border lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-2 lg:mt-0 lg:self-start"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border min-[901px]:hidden" aria-hidden="true" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[26px] font-medium leading-8 text-fg">{title}</h1>
            {subtitle ? <p className="mt-1 text-[13px] leading-[18px] text-fg-secondary">{subtitle}</p> : null}
          </div>
          {canManageTags ? (
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 shrink-0 whitespace-nowrap"
              aria-expanded={tagEditing.open}
              onClick={tagEditing.toggle}
              disabled={!trip || tagEditing.pending}
            >
              <Tag className="h-4 w-4" aria-hidden="true" />
              {tagEditing.open ? 'Close tags' : 'Edit tags'}
            </Button>
          ) : null}
        </div>
        {!tagEditing.open && trip?.tags?.length ? (
          <div className="mt-2 flex flex-wrap gap-1">{trip.tags.map(tag => <TripTagBadge key={tag.id} tag={tag} />)}</div>
        ) : null}
        <TripTagEditor vehicleId={vehicleId} canManage={canManageTags} editing={tagEditing} />

        {loading ? (
          <div className="mt-5 space-y-3" aria-busy="true"><Skeleton className="h-12 w-2/3" /><Skeleton className="h-16 w-full" /></div>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-2 gap-4">
              {distance ? <TripHero label="Distance" measure={distance} testId="trip-distance" /> : null}
              {odometerEnd ? <TripHero label="Odometer at end" measure={odometerEnd} testId="trip-odometer" /> : null}
            </div>
            {factsLine ? <p className="mt-2 text-[13px] leading-[18px] text-fg-secondary" data-trip-facts>{capitalize(factsLine)}</p> : null}
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-border pt-4 sm:grid-cols-4 lg:grid-cols-2" data-trip-tiles>
              {tiles.map(tile => <TripTile key={tile.label} {...tile} />)}
            </div>
            <div className="mt-5">
              <TripReplayControls
                playing={replay.playing}
                onToggle={replay.toggle}
                max={timeline.length - 1}
                value={activeIndex}
                onScrub={selectIndex}
                clock={clock}
                valueText={valueText}
                readout={readout}
                disabled={timeline.length < 2}
              />
            </div>
          </>
        )}
      </section>

      <div className="mt-4 min-w-0 space-y-4 lg:col-start-1 lg:row-start-3">
        <TripCard
          title="Power during the drive"
          data-trip-power
          description={powerDescription(peakKw, regenKwh, powerEstimated)}
        >
          <div className="mt-3">
            <TripTimeChart
              points={chartPoints}
              series={powerSeries}
              unit="kW"
              xSplits={xSplits}
              activeIndex={activeIndex}
              onIndexChange={selectIndex}
              height={220}
              loading={loading}
              zeroLine
              emptyTitle="No power readings for this drive."
            />
          </div>
          <p className="mt-2 text-xs leading-4 text-fg-secondary">
            {powerEstimated
              ? 'kW · estimated from battery level changes. Short peaks do not show.'
              : 'kW · below 0 = regen.'}
          </p>
        </TripCard>

        <TripCard
          title="Time at each speed"
          data-trip-speed-profile
          description={speedBands.length ? [
            topBand ? `Most of the drive was ${topBand.label} ${speedUnit}.` : null,
            coverage,
          ].filter(Boolean).join(' ') : null}
        >
          {loading ? <Skeleton className="mt-3 h-24 w-full" />
            : speedBands.length
              ? <SpeedBands bands={speedBands} unit={speedUnit} activeMin={activeSpeedBand} />
              : <p className="mt-2 text-[13px] text-fg-secondary">No speed readings for this drive.</p>}
          {speedProfile.estimatedSeconds > 0 && speedProfile.medianGpsSeconds != null ? (
            <p className="mt-3 text-xs leading-4 text-fg-secondary">
              GPS estimate from location readings about {Math.round(speedProfile.medianGpsSeconds)} s apart. Short stops can be missing.
            </p>
          ) : null}
        </TripCard>

        {elevation && elevation.rangeM > ELEVATION_CHART_MIN_RANGE_M ? (
          <TripCard title="Elevation along the route" data-trip-elevation>
            <div className="mt-3">
              <TripTimeChart
                points={chartPoints}
                series={elevationSeries}
                unit={prefs.altitude_unit === 'meters' ? 'm' : 'ft'}
                xSplits={xSplits}
                activeIndex={activeIndex}
                onIndexChange={selectIndex}
                height={180}
                emptyTitle="No elevation readings for this drive."
              />
            </div>
          </TripCard>
        ) : null}

        <div className={comparison ? 'grid grid-cols-1 gap-4 xl:grid-cols-2' : 'grid grid-cols-1 gap-4'}>
          <TripCard title="Conditions" data-trip-conditions>
            {conditions.length ? (
              <dl className="mt-1">
                {conditions.map(row => (
                  <div key={row.key} className="flex justify-between gap-3 border-t border-border py-3 text-[15px] first:border-t-0">
                    <dt className="text-fg-secondary">{row.label}</dt>
                    <dd className="text-right text-fg">{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : <p className="mt-2 text-[13px] text-fg-secondary">No condition readings for this drive.</p>}
            {detailData?.outside_temperature?.attribution ? (
              <p className="mt-1 text-xs text-fg-secondary">
                Outside estimate:{' '}
                <a className="text-fg underline" href={detailData.outside_temperature.attribution.url} target="_blank" rel="noreferrer">
                  {detailData.outside_temperature.attribution.name}
                </a>
              </p>
            ) : null}
          </TripCard>

          {comparison ? (
            <TripCard
              title="This route over time"
              data-trip-route-history
              description={`${comparison.count} earlier ${comparison.count === 1 ? 'drive' : 'drives'} on this route.`}
            >
              <dl className="mt-2">
                <div className="flex justify-between gap-3 py-3 text-[15px]">
                  <dt className="text-fg-secondary">Your usual</dt>
                  <dd className="text-right text-fg">{joinMeasure(efficiencyFromMiPerKwh(comparison.usual_mi_per_kwh, prefs))}</dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-border py-3 text-[15px]">
                  <dt className="text-fg-secondary">This drive</dt>
                  <dd className="text-right text-fg">
                    {joinMeasure(efficiencyFromMiPerKwh(comparison.this_mi_per_kwh, prefs))} · {rankText(comparison)}
                  </dd>
                </div>
              </dl>
              <p className="text-[13px] leading-[18px] text-fg-secondary">{routeDifferenceText(comparison)}.</p>
            </TripCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function powerDescription(peakKw: number | null, regenKwh: number | null, estimated: boolean) {
  const parts: string[] = [];
  if (peakKw != null && peakKw > 0) parts.push(`Peak ${Math.round(peakKw)} kW.`);
  if (!estimated && regenKwh != null && regenKwh >= 0.05) parts.push(`Regen returned ${regenKwh.toFixed(1)} kWh to the battery.`);
  parts.push('The cursor follows the replay.');
  return parts.join(' ');
}

/** "Thu, Oct 8 · 5:00–5:30 PM". The end time comes from the trip duration. */
export function tripSubtitle(trip: Pick<Trip, 'started_at'>, durationSeconds: number, now = new Date()) {
  const startedAt = Date.parse(trip.started_at);
  if (!Number.isFinite(startedAt)) return null;
  const sameYear = new Date(startedAt).getFullYear() === now.getFullYear();
  const date = formatAppDate(startedAt, { weekday: 'short', month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
  const startTime = formatAppTime(startedAt);
  if (durationSeconds <= 0) return `${date} · ${startTime}`;
  const endTime = formatAppTime(startedAt + durationSeconds * 1000);
  const period = / ?[AP]M$/i.exec(startTime)?.[0];
  const compactStart = period && endTime.endsWith(period) ? startTime.slice(0, -period.length) : startTime;
  return `${date} · ${compactStart}–${endTime}`;
}
