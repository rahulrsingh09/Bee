import React from 'react';
import { Clock, Plug, PlugZap, Unplug } from 'lucide-react';
import type { Vehicle, VehicleStatus } from '@riviamigo/types';
import {
  useChargeSessions, useChargingSchedule, useCurrentVehicleStatus, useInsights, usePhantomDrainPeriods,
  useSavedPlaces, useTrips,
} from '@riviamigo/hooks';
import { shiftAppCalendarDays } from '@riviamigo/ui/lib/dateTime';
import { vehicleReading } from '../r-experience/readings';
import { vehicleLockReading } from '../r-experience/vehicleLockReading';
import { RVehicleLockStatus } from '../r-experience/RVehicleLockStatus';
import {
  attentionItems, daysOfRangeSentence, latestPark, nowActivity, nowPlace, nowTitle, plugLabel, plugState,
  scheduleLabel, vehicleConfiguration, weekSummary, weekWindow,
} from './nowModel';
import { NowAttention } from './NowAttention';
import { NowCar } from './NowCar';
import { NowEnergy } from './NowEnergy';
import { NowOdometer } from './NowOdometer';
import { NowStoryRail } from './NowStoryRail';
import { useFirstViewMotion } from './useNowMotion';
import './now.css';

const lockText = (status: VehicleStatus | null) => {
  const locked = vehicleLockReading(status);
  return locked === null ? 'Lock unknown' : locked ? 'Locked' : 'Unlocked';
};

/** Fixed time windows for one page visit, so query keys stay stable while the page is open. */
function useVisitWindows() {
  const [now] = React.useState(() => Date.now());
  return React.useMemo(() => ({
    now, week: weekWindow(now),
    parksFrom: shiftAppCalendarDays(now, -14).toISOString(),
  }), [now]);
}

/**
 * The Now page body for one vehicle: status, car, battery and range, odometer and this week,
 * "Needs a look" and the latest drive, charge and park. No charts and no period picker.
 */
export function NowView({ vehicle, vehicleControl }: { vehicle: Vehicle; vehicleControl?: React.ReactNode }) {
  const animate = useFirstViewMotion();
  const { now, week: thisWeek, parksFrom } = useVisitWindows();
  const snapshot = useCurrentVehicleStatus(vehicle.id);
  const status = !snapshot.isPlaceholderData && snapshot.data?.vehicle_id === vehicle.id ? snapshot.data : null;
  const places = useSavedPlaces();
  const schedule = useChargingSchedule(vehicle.id);
  const insightsQuery = useInsights(vehicle.id, 'now');
  const insights = insightsQuery.isPlaceholderData ? undefined : insightsQuery.data?.insights;
  const weekTrips = useTrips(vehicle.id, thisWeek.from, thisWeek.to, 1, 200);
  const weekCharges = useChargeSessions(vehicle.id, thisWeek.from, thisWeek.to, 1, 200);
  const latestTrips = useTrips(vehicle.id, null, null, 1, 1);
  const latestCharges = useChargeSessions(vehicle.id, null, null, 1, 1);
  const parks = usePhantomDrainPeriods(vehicle.id, parksFrom, thisWeek.to, 5, 1);

  const latestTrip = latestTrips.data?.items?.[0];
  const latestCharge = latestCharges.isPlaceholderData ? undefined : latestCharges.data?.items?.[0];
  const park = parks.isPlaceholderData ? undefined : latestPark(parks.data?.periods);
  const activity = nowActivity(status);
  const plug = plugState(status);
  const scheduled = scheduleLabel(schedule.data, plug);
  const PlugIcon = plug === 'charging' ? PlugZap : plug === 'plugged' ? Plug : Unplug;
  const weekReady = Boolean(weekTrips.data) && !weekCharges.isLoading;
  const week = weekReady ? weekSummary(weekTrips.data?.items, weekCharges.data?.items, now) : null;

  return <div className="now" data-activity={activity}>
    <div className="now-primary">
      <header className="now-header">
        <div className="now-vehicle-row">
          <p className="now-vehicle">{[vehicle.display_name, vehicleConfiguration(vehicle)].filter(Boolean).join(' · ')}</p>
          {vehicleControl}
        </div>
        {vehicle.is_demo && <p className="now-vehicle">Demo vehicle · Illustrative data</p>}
        <h1 className="now-title">{nowTitle(activity, nowPlace(status, places.data, latestTrip))}</h1>
        <ul className="now-chips" aria-label="Vehicle status">
          <li className="now-chip" data-attention={vehicleLockReading(status) === false || undefined}>
            <RVehicleLockStatus status={status} /><span aria-hidden="true">{lockText(status)}</span>
          </li>
          {plug && <li className="now-chip" data-state={plug}><PlugIcon aria-hidden="true" />{plugLabel[plug]}</li>}
          {scheduled && <li className="now-chip"><Clock aria-hidden="true" />{scheduled}</li>}
        </ul>
      </header>
      <NowCar vehicle={vehicle} />
      <NowEnergy battery={vehicleReading(status, 'battery_level')} limit={vehicleReading(status, 'battery_limit')}
        rangeMi={vehicleReading(status, 'range_miles')} daysSentence={daysOfRangeSentence(insights)} animate={animate} />
      {snapshot.isError && <p className="now-context" role="alert">Vehicle readings could not be refreshed.{' '}
        <button type="button" className="now-retry" onClick={() => void snapshot.refetch()}>Retry</button></p>}
    </div>
    <div className="now-secondary">
      <NowOdometer odometerMi={vehicleReading(status, 'odometer_miles')} week={week} animate={animate}
        weekState={weekTrips.isError || weekCharges.isError ? 'error' : week ? 'ready' : 'loading'}
        onRetry={() => { void weekTrips.refetch(); void weekCharges.refetch(); }} />
      <NowAttention items={attentionItems(insights)} />
      <NowStoryRail vehicleId={vehicle.id} trip={latestTrip} charge={latestCharge} park={park} insights={insights}
        now={now} animate={animate}
        loading={latestTrips.isLoading || latestCharges.isLoading || parks.isLoading}
        failed={latestTrips.isError && latestCharges.isError}
        onRetry={() => { void latestTrips.refetch(); void latestCharges.refetch(); void parks.refetch(); }} />
    </div>
  </div>;
}

