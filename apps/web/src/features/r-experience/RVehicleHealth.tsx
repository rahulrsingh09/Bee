import React from 'react';
import {
  Activity,
  BatteryWarning,
  Cpu,
  Lock,
  LockOpen,
  Radio,
  TriangleAlert,
} from 'lucide-react';
import {
  useAuth,
  useCurrentVehicleStatus,
  useResolvedVehicleSelection,
  useTripGaps,
  useVehicleHealth,
} from '@riviamigo/hooks';
import type { BadgeProps } from '@riviamigo/ui/primitives';
import { SelectPicker, Skeleton } from '@riviamigo/ui/primitives';
import { formatAppDateTime, formatAppTime } from '@riviamigo/ui/lib/dateTime';
import {
  DEFAULT_TARGET_TIRE_PRESSURE_PSI,
  formatTireLabel,
  getTireHealthTone,
  normalizeTireWheels,
} from '@riviamigo/ui/lib/vehicleTires';
import { summarizeStatusAvailability } from '@riviamigo/ui/lib/vehicleStatus';
import {
  dedupeSoftwareHistory,
  formatAcquisitionState,
  getCollectorState,
  getHealthClosureRows,
  getHealthState,
  getThermalState,
  sanitizeUpdateVersion,
  summarizeClosures,
  summarizeDiagnostics,
  summarizeTires,
} from '../health/VehicleHealthPage';
import { NoVehicleState } from '../../components/layout/NoVehicleState';
import { RAppLayout } from './RAppLayout';
import { RSettingsEntry } from './RSettingsNavigation';
import { RMissedDrives } from './RMissedDrives';
import { vehicleLockReading } from './vehicleLockReading';
import './r-health.css';

type Tone = 'good' | 'warn' | 'alert' | 'muted';

function toneOf(variant: NonNullable<BadgeProps['variant']> | undefined): Tone {
  if (variant === 'success') return 'good';
  if (variant === 'warning') return 'warn';
  if (variant === 'danger') return 'alert';
  return 'muted';
}

function relativeAge(value: string | null | undefined) {
  if (!value) return null;
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (!Number.isFinite(minutes)) return null;
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function formatWhen(value: string | null | undefined) {
  return value ? formatAppDateTime(value) : 'Not reported';
}

export function RVehicleHealth() {
  const { setActiveVehicleId } = useAuth();
  const { authReady, effectiveVehicleId, vehicleSelectionReady, vehicles } = useResolvedVehicleSelection();
  const vehicle = vehicles.find((item) => item.id === effectiveVehicleId);
  const { data, isLoading } = useVehicleHealth(effectiveVehicleId);
  const { data: status } = useCurrentVehicleStatus(effectiveVehicleId);
  const { data: gapData } = useTripGaps(effectiveVehicleId);
  const canRecover = vehicle?.membership_role === 'owner' || vehicle?.membership_role === 'manager';

  return (
    <RAppLayout activeKey="health" footer={<RSettingsEntry />}>
      <div className="r-page-heading r-health-heading">
        <div>
          <h1>Vehicle health</h1>
          <p>Connection, readings and software at a glance.</p>
        </div>
        {vehicles.length > 1 ? (
          <SelectPicker
            className="min-w-[11rem]"
            value={effectiveVehicleId ?? ''}
            onChange={(vehicleId) => setActiveVehicleId?.(vehicleId || null)}
            aria-label="Select vehicle"
            options={vehicles.map((item) => ({ value: item.id, label: item.display_name || item.model }))}
          />
        ) : null}
      </div>
      {!authReady || !vehicleSelectionReady ? (
        <HealthSkeleton />
      ) : !effectiveVehicleId ? (
        <NoVehicleState title="No vehicle selected" description="Connect your Rivian account to view vehicle health." />
      ) : isLoading && !data ? (
        <HealthSkeleton />
      ) : (
        <HealthContent
          vehicleId={effectiveVehicleId}
          canRecover={canRecover}
          data={data}
          status={status}
          parallaxQuiet={gapData?.parallax_quiet ?? null}
          targetPsi={Math.round(vehicle?.target_tire_pressure_psi ?? DEFAULT_TARGET_TIRE_PRESSURE_PSI)}
          model={data?.vehicle?.model ?? vehicle?.model ?? null}
        />
      )}
    </RAppLayout>
  );
}

type Health = NonNullable<ReturnType<typeof useVehicleHealth>['data']>;
type Status = ReturnType<typeof useCurrentVehicleStatus>['data'];

function HealthContent({
  vehicleId,
  canRecover,
  data,
  status,
  parallaxQuiet,
  targetPsi,
  model,
}: {
  vehicleId: string;
  canRecover: boolean;
  data: Health | undefined;
  status: Status;
  parallaxQuiet: { last_frame_at: string; moved_at: string } | null;
  targetPsi: number;
  model: string | null;
}) {
  const extended = data?.extended_telemetry;
  const lastEvent = data?.runtime?.last_event_at ?? data?.latest?.ts ?? null;
  const parallaxFrame = extended?.parallax?.last_frame_at ?? null;
  const collector = getCollectorState(data?.runtime?.worker_health ?? null);
  const twelveVolt = getHealthState(data?.latest?.twelve_volt_health ?? null);
  const thermal = getThermalState(data?.latest?.hv_thermal_event ?? null, data?.thermal_events_30d ?? 0);
  const history = dedupeSoftwareHistory(data?.software_history ?? []);
  const currentVersion = data?.current_software_version ?? history.find((entry) => !entry.observed_until)?.version ?? null;
  const update = sanitizeUpdateVersion(data?.latest?.ota_available_version ?? null, currentVersion ?? '');

  const wheels = normalizeTireWheels(status, data?.tires ?? null).map((wheel) => ({
    ...wheel,
    availability: status
      ? summarizeStatusAvailability(status, [`tire_${wheel.position}_psi`, `tire_${wheel.position}_status`, `tire_${wheel.position}_valid`])
      : null,
  }));
  const tires = summarizeTires(wheels, targetPsi);

  const closureValues = {
    closure_frunk_closed: status?.closure_frunk_closed ?? data?.closures?.closure_frunk_closed ?? null,
    closure_liftgate_closed: status?.closure_liftgate_closed ?? data?.closures?.closure_liftgate_closed ?? null,
    closure_tailgate_closed: status?.closure_tailgate_closed ?? data?.closures?.closure_tailgate_closed ?? null,
    door_front_left_closed: status?.door_front_left_closed ?? data?.closures?.door_front_left_closed ?? null,
    door_front_right_closed: status?.door_front_right_closed ?? data?.closures?.door_front_right_closed ?? null,
    door_rear_left_closed: status?.door_rear_left_closed ?? data?.closures?.door_rear_left_closed ?? null,
    door_rear_right_closed: status?.door_rear_right_closed ?? data?.closures?.door_rear_right_closed ?? null,
  };
  const closures = summarizeClosures(getHealthClosureRows(model, closureValues, status));
  const locked = vehicleLockReading(status);
  const closureText = closures.label === 'Secured' ? 'All closed' : closures.label === 'Unavailable' ? 'Not reported' : closures.label;
  const lockText = locked === true ? 'Locked' : locked === false ? 'Unlocked' : 'Lock not reported';
  const doorsTone: Tone = closures.variant === 'warning' || locked === false ? 'warn' : closures.variant === 'success' ? 'good' : 'muted';

  const diagnostics = summarizeDiagnostics(status);
  const reported = diagnostics.rows.filter((row) => !row.state.isMissing);
  const unreported = diagnostics.rows.length - reported.length;

  const connection = collector.variant !== 'success'
    ? { value: collector.label, caption: `Last data ${relativeAge(lastEvent) ?? 'unknown'}`, tone: toneOf(collector.variant) }
    : parallaxQuiet
      ? { value: 'Partial', caption: `Live stream quiet since ${formatAppTime(parallaxQuiet.last_frame_at)}`, tone: 'warn' as Tone }
      : { value: 'Live', caption: `Last data ${relativeAge(lastEvent) ?? 'unknown'}`, tone: 'good' as Tone };

  return (
    <div className="r-health">
      <RMissedDrives vehicleId={vehicleId} canRecover={canRecover} />
      {parallaxQuiet ? (
        <p className="r-health-notice" role="status">
          <TriangleAlert aria-hidden="true" />
          <span>
            Rivian’s live stream has sent nothing since {formatAppDateTime(parallaxQuiet.last_frame_at)}, but the car moved at{' '}
            {formatAppTime(parallaxQuiet.moved_at)}. Riviamigo keeps reconnecting, and records drives from the odometer meanwhile.
          </span>
        </p>
      ) : null}

      <section className="r-health-tiles" aria-label="Status summary">
        <Tile icon={<Radio />} label="Data connection" value={connection.value} caption={connection.caption} tone={connection.tone} />
        <Tile icon={<BatteryWarning />} label="12 V battery" value={twelveVolt.label} caption="Low-voltage battery" tone={toneOf(twelveVolt.variant)} />
        <Tile
          icon={<Activity />}
          label="Battery thermal"
          value={thermal.label}
          caption={`${data?.thermal_events_30d ?? 0} events in 30 days`}
          tone={toneOf(thermal.variant)}
        />
        <Tile
          icon={<Cpu />}
          label="Software"
          value={currentVersion ?? 'Unknown'}
          caption={update ? `Update ${update} available` : 'Up to date'}
          tone={update ? 'warn' : currentVersion ? 'good' : 'muted'}
        />
      </section>

      <div className="r-health-columns">
        <div className="r-health-stack">
        <section className="r-health-card" aria-labelledby="r-health-tires">
          <header>
            <h2 id="r-health-tires">Tires</h2>
            <span className="r-health-chip" data-tone={toneOf(tires.variant)}>{tires.label}</span>
          </header>
          <div className="r-health-tire-grid">
            {wheels.map((wheel) => (
              <div key={wheel.position} className="r-health-tire" data-tone={toneOfTire(getTireHealthTone({ psi: wheel.psi, status: wheel.status, targetPsi }))}>
                <span>{wheel.label}</span>
                <strong>{formatTireLabel(wheel.psi, wheel.status)}</strong>
              </div>
            ))}
          </div>
          <p className="r-health-foot">Target {targetPsi} psi</p>
        </section>

        <section className="r-health-card" aria-labelledby="r-health-doors">
          <header>
            <h2 id="r-health-doors">Doors &amp; locks</h2>
          </header>
          <div className="r-health-row r-health-doors" data-tone={doorsTone}>
            {locked === false ? <LockOpen aria-hidden="true" /> : <Lock aria-hidden="true" />}
            <strong>{closureText} · {lockText}</strong>
          </div>
        </section>
        </div>
        <div className="r-health-stack">
        <section className="r-health-card" aria-labelledby="r-health-signal">
          <header>
            <h2 id="r-health-signal">Signal details</h2>
          </header>
          <ul className="r-health-list">
            <li><span>Last vehicle event</span><span>{formatWhen(lastEvent)}</span></li>
            <li><span>API snapshot</span><span>{formatWhen(data?.latest?.ts)}</span></li>
            <li><span>Live stream</span><span>{formatAcquisitionState(extended)}{parallaxFrame ? ` · ${relativeAge(parallaxFrame)}` : ''}</span></li>
          </ul>
        </section>

        <section className="r-health-card" aria-labelledby="r-health-diagnostics">
          <header>
            <h2 id="r-health-diagnostics">Diagnostics</h2>
            {reported.length > 0 ? (
              <span className="r-health-chip" data-tone={toneOf(diagnostics.overall.variant)}>{diagnostics.overall.label}</span>
            ) : null}
          </header>
          {reported.length > 0 ? (
            <ul className="r-health-list">
              {reported.map((row) => (
                <li key={row.label}>
                  <span>{row.label}</span>
                  <span className="r-health-chip" data-tone={toneOf(row.state.variant)}>{row.state.label}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {unreported > 0 ? (
            <p className="r-health-foot">
              {reported.length > 0 ? `${unreported} more sensors not reported by this vehicle.` : `${unreported} sensors not reported by this vehicle.`}
            </p>
          ) : null}
        </section>

        <section className="r-health-card r-health-software" aria-labelledby="r-health-software">
          <header>
            <h2 id="r-health-software">Software</h2>
            <span className="r-health-chip" data-tone={update ? 'warn' : 'good'}>{currentVersion ?? 'Unknown'}</span>
          </header>
          {history.length > 0 ? (
            <details>
              <summary>History ({history.length})</summary>
              <ul className="r-health-list">
                {history.map((entry) => (
                  <li key={`${entry.version}-${entry.installed_at}`}>
                    <span>{entry.version ?? 'Unknown'}</span>
                    <span>{entry.observed_until ? `Until ${formatAppDateTime(entry.observed_until)}` : `Since ${formatAppDateTime(entry.installed_at)}`}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <p className="r-health-foot">No software history recorded yet.</p>
          )}
        </section>
        </div>
      </div>
    </div>
  );
}

function toneOfTire(tone: ReturnType<typeof getTireHealthTone>): Tone {
  if (tone === 'danger') return 'alert';
  if (tone === 'warning') return 'warn';
  if (tone === 'success') return 'good';
  return 'muted';
}

function Tile({ icon, label, value, caption, tone }: { icon: React.ReactNode; label: string; value: string; caption: string; tone: Tone }) {
  return (
    <div className="r-health-tile" data-tone={tone}>
      <span className="r-health-tile-label">
        <span aria-hidden="true">{icon}</span>
        {label}
      </span>
      <strong>{value}</strong>
      <small>{caption}</small>
    </div>
  );
}

function HealthSkeleton() {
  return (
    <div className="r-health" aria-busy="true">
      <div className="r-health-tiles">
        {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-28 rounded-2xl" />)}
      </div>
      <Skeleton className="h-48 rounded-2xl" />
    </div>
  );
}

