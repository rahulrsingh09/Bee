import { isVehicleCharging } from '@riviamigo/types';
import type {
  ChargeSession, Insight, PhantomDrainPeriod, Place, TrackPoint, Trip, Vehicle, VehicleStatus,
} from '@riviamigo/types';
import { isVehiclePluggedIn } from '@riviamigo/dashboards';
import {
  formatCurrency, formatDuration, formatEfficiencyValue, formatMiles, formatNumber, getEfficiencyUnitLabel,
} from '@riviamigo/ui/lib/utils';
import {
  endOfAppDay, formatAppDate, formatAppDateTime, formatAppTime, getAppDateParts, shiftAppCalendarDays, startOfAppDay,
} from '@riviamigo/ui/lib/dateTime';

/** What the vehicle does now. Stale data keeps the last known state; the top bar and "Needs a look" show the age. */
export type NowActivity = 'waiting' | 'charging' | 'driving' | 'parked';

export function nowActivity(status: VehicleStatus | null | undefined): NowActivity {
  if (!status) return 'waiting';
  if (isVehicleCharging(status)) return 'charging';
  if (/drive|go/.test(status.power_state?.toLowerCase() ?? '')) return 'driving';
  const gear = status.gear_status?.toLowerCase() ?? '';
  if (gear && !gear.includes('park') && (status.speed_mph ?? 0) > 0) return 'driving';
  return 'parked';
}

function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The saved place that contains the point, the nearest one first. */
export function placeAt(lat: number | null | undefined, lng: number | null | undefined, places: readonly Place[] | undefined) {
  if (lat == null || lng == null || !places?.length) return null;
  const hits = places
    .map(place => ({ place, meters: metersBetween({ lat, lng }, { lat: place.latitude, lng: place.longitude }) }))
    .filter(({ place, meters }) => meters <= Math.max(place.radius_m, 50))
    .sort((a, b) => a.meters - b.meters);
  return hits[0]?.place.name ?? null;
}

/**
 * Where the vehicle is: a saved place at the current position, else the end place of the latest
 * finished drive when that drive ended near the current position (or no position is known).
 */
export function nowPlace(status: VehicleStatus | null | undefined, places: readonly Place[] | undefined, latestTrip: Trip | undefined) {
  const saved = placeAt(status?.latitude, status?.longitude, places);
  if (saved) return saved;
  if (!latestTrip?.ended_at) return null;
  const name = latestTrip.end_place || null;
  if (!name) return null;
  if (status?.latitude == null || status.longitude == null || latestTrip.end_lat == null || latestTrip.end_lng == null) {
    return status?.latitude == null ? name : null;
  }
  return metersBetween({ lat: status.latitude, lng: status.longitude }, { lat: latestTrip.end_lat, lng: latestTrip.end_lng }) <= 250 ? name : null;
}

export function nowTitle(activity: NowActivity, place: string | null) {
  if (activity === 'waiting') return 'Waiting for vehicle data';
  if (activity === 'driving') return 'Driving';
  if (activity === 'charging') return place ? `Charging at ${place}` : 'Charging';
  return place ? `Parked at ${place}` : 'Parked';
}

/** Model, trim and color from the vehicle record. Missing parts are left out. */
export function vehicleConfiguration(vehicle: Pick<Vehicle, 'model' | 'trim' | 'color'>) {
  const model = vehicle.model?.trim() || 'Rivian';
  const trim = vehicle.trim?.trim();
  return [trim && !trim.toLowerCase().startsWith(model.toLowerCase()) ? `${model} ${trim}` : trim || model, vehicle.color?.trim()]
    .filter(Boolean).join(' · ');
}

export function spinLabel(vehicle: Pick<Vehicle, 'model' | 'color'>) {
  const model = vehicle.model?.trim() || 'Rivian';
  const color = vehicle.color?.trim();
  return color ? `Your ${model}, ${color}. Use arrow keys to turn.` : `Your ${model}. Use arrow keys to turn.`;
}

export type PlugState = 'charging' | 'plugged' | 'unplugged' | null;

export function plugState(status: VehicleStatus | null | undefined): PlugState {
  if (!status) return null;
  if (isVehicleCharging(status)) return 'charging';
  if (isVehiclePluggedIn(status)) return 'plugged';
  const known = status.charger_state?.toLowerCase() === 'disconnected' || status.charger_status === 'chrgr_sts_not_connected';
  return known ? 'unplugged' : null;
}

export const plugLabel: Record<Exclude<PlugState, null>, string> = {
  charging: 'Charging', plugged: 'Plugged in', unplugged: 'Unplugged',
};

/** "11 PM", "6:30 AM" from minutes after midnight. */
export function clockLabel(minutes: number) {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  const suffix = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 || 12;
  return minute ? `${h12}:${String(minute).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}

export function scheduleLabel(schedule: { enabled: boolean; start_time_minutes: number | null } | null | undefined, plug: PlugState) {
  if (!schedule?.enabled || schedule.start_time_minutes == null || plug === 'charging') return null;
  return `Charges ${clockLabel(schedule.start_time_minutes)}`;
}

function insightOf<K extends Insight['kind']>(insights: readonly Insight[] | undefined, kind: K) {
  return insights?.find((insight): insight is Extract<Insight, { kind: K }> => insight.kind === kind);
}

/** "enough for about 3 days of your usual driving", from the days_of_range rule. Null when the rule did not fire. */
export function daysOfRangeSentence(insights: readonly Insight[] | undefined) {
  const days = insightOf(insights, 'days_of_range')?.values.days;
  if (days == null || !Number.isFinite(days) || days < 0) return null;
  if (days < 1) return 'enough for less than 1 day of your usual driving';
  const rounded = Math.round(days);
  return `enough for about ${rounded} ${rounded === 1 ? 'day' : 'days'} of your usual driving`;
}

export interface AttentionItem {
  id: string;
  title: string;
  detail: string;
  to: '/battery/phantom-drain' | '/vehicle-health' | '/settings';
  search?: { section: string };
}

function hoursLabel(hours: number) {
  const whole = Math.max(1, Math.floor(hours));
  return whole < 48 ? `${whole} h` : `${Math.floor(whole / 24)} days`;
}

/** "Needs a look" rows: stale data, high parked loss and charges without a price. Other kinds are not shown here. */
export function attentionItems(insights: readonly Insight[] | undefined): AttentionItem[] {
  const items: AttentionItem[] = [];
  const stale = insightOf(insights, 'stale_data');
  if (stale?.severity === 'attention') items.push({
    id: stale.id, title: `No data for ${hoursLabel(stale.values.hours)}`,
    detail: `Last data ${formatAppDateTime(stale.values.last_seen_at)}. Check the connection.`, to: '/vehicle-health',
  });
  const parked = insightOf(insights, 'high_parked_loss');
  if (parked?.severity === 'attention') {
    const loss = `${formatNumber(parked.values.loss_pct, 1)}% in ${formatDuration(parked.values.duration_hours * 60)}`;
    const ratio = parked.values.ratio != null ? ` · ${formatNumber(parked.values.ratio, 1)}× your usual loss` : '';
    items.push({ id: parked.id, title: 'Parked loss was high', detail: `${loss}${ratio}`, to: '/battery/phantom-drain' });
  }
  const price = insightOf(insights, 'missing_price');
  if (price && price.values.count > 0) items.push({
    id: price.id,
    title: `${price.values.count} ${price.values.count === 1 ? 'charge has' : 'charges have'} no price`,
    detail: `Last ${price.values.window_days} days. Add a home price to see the cost.`,
    to: '/settings', search: { section: 'places' },
  });
  return items;
}

export interface WeekDay { key: string; label: string; miles: number; today: boolean }
export interface WeekSummary {
  days: WeekDay[];
  miles: number;
  drives: number;
  /** Wh/mi over drives with an energy reading; null without one. */
  efficiencyWhMi: number | null;
  /** Sum of known charge costs; null when no charge in the window has a cost. */
  cost: number | null;
}

function dayKey(value: Date | string | number) {
  const parts = getAppDateParts(value);
  return parts ? `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}` : '';
}

/** Seven app-calendar days that end today. */
export function weekWindow(now: number) {
  const first = startOfAppDay(shiftAppCalendarDays(now, -6));
  return { from: first.toISOString(), to: endOfAppDay(now).toISOString(), first };
}

export function weekSummary(trips: readonly Trip[] | undefined, charges: readonly ChargeSession[] | undefined, now: number): WeekSummary {
  const { first } = weekWindow(now);
  const today = dayKey(now);
  const days: WeekDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = shiftAppCalendarDays(first, index);
    return {
      key: dayKey(date), miles: 0, today: dayKey(date) === today,
      label: formatAppDate(date, { year: undefined, month: undefined, day: undefined, weekday: 'short' }),
    };
  });
  const byKey = new Map(days.map(day => [day.key, day]));
  let miles = 0; let drives = 0; let energyMiles = 0; let energyKwh = 0;
  for (const trip of trips ?? []) {
    const day = byKey.get(dayKey(trip.started_at));
    if (!day || !Number.isFinite(trip.distance_mi)) continue;
    day.miles += trip.distance_mi;
    miles += trip.distance_mi;
    drives += 1;
    if (trip.energy_used_kwh != null && trip.energy_used_kwh > 0 && trip.distance_mi > 0) {
      energyMiles += trip.distance_mi;
      energyKwh += trip.energy_used_kwh;
    }
  }
  const priced = (charges ?? []).filter(charge => byKey.has(dayKey(charge.started_at)) && charge.cost_usd != null && Number.isFinite(charge.cost_usd));
  return {
    days, miles, drives,
    efficiencyWhMi: energyMiles > 0 ? energyKwh * 1000 / energyMiles : null,
    cost: priced.length ? priced.reduce((sum, charge) => sum + charge.cost_usd!, 0) : null,
  };
}

/** "This week: 407 mi · 11 drives · 3.1 mi/kWh · $35.10 energy cost". */
export function weekLine(summary: WeekSummary) {
  const parts = summary.drives > 0
    ? [formatMiles(summary.miles), `${summary.drives} ${summary.drives === 1 ? 'drive' : 'drives'}`]
    : ['No drives'];
  if (summary.efficiencyWhMi != null) parts.push(`${formatEfficiencyValue(summary.efficiencyWhMi)} ${getEfficiencyUnitLabel()}`);
  if (summary.cost != null) parts.push(`${formatCurrency(summary.cost)} energy cost`);
  return `This week: ${parts.join(' · ')}`;
}

export function isToday(value: string | null | undefined, now: number) {
  return Boolean(value) && dayKey(value!) === dayKey(now);
}

/** "6:12 PM" today, "Yesterday 6:12 PM", else "Nov 3, 6:12 PM". */
export function eventTime(value: string, now: number) {
  if (isToday(value, now)) return formatAppTime(value);
  if (dayKey(value) === dayKey(shiftAppCalendarDays(now, -1))) return `Yesterday ${formatAppTime(value)}`;
  return formatAppDateTime(value, { year: undefined });
}

/** "Today" when the latest event happened today, else "Latest". */
export function railTitle(times: ReadonlyArray<string | null | undefined>, now: number) {
  const latest = times.filter((time): time is string => Boolean(time)).sort().at(-1);
  return latest && isToday(latest, now) ? 'Today' : 'Latest';
}

/** The newest validated parked period with a battery reading. */
export function latestPark(periods: readonly PhantomDrainPeriod[] | undefined) {
  return periods?.find(period => period.validation_status === 'validated' && period.period_start && period.soc_lost_pct != null);
}

/** Splits "12,486 mi" into the number and the unit. */
export function splitUnit(text: string) {
  const index = text.lastIndexOf(' ');
  return index > 0 ? { value: text.slice(0, index), unit: text.slice(index + 1) } : { value: text, unit: '' };
}

/** SVG path for a drive route in a w × h box, keeping the map aspect. */
export function routePath(points: readonly Pick<TrackPoint, 'lat' | 'lng'>[] | undefined, width: number, height: number, pad = 10) {
  const valid = (points ?? []).filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  if (valid.length < 2) return null;
  const meanLat = valid.reduce((sum, point) => sum + point.lat, 0) / valid.length;
  const xs = valid.map(point => point.lng * Math.cos(meanLat * Math.PI / 180));
  const ys = valid.map(point => point.lat);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(maxX - minX, maxY - minY, 1e-9);
  const scale = Math.min((width - pad * 2) / Math.max(maxX - minX, span * 1e-3), (height - pad * 2) / Math.max(maxY - minY, span * 1e-3));
  const offsetX = (width - (maxX - minX) * scale) / 2;
  const offsetY = (height - (maxY - minY) * scale) / 2;
  return xs.map((x, index) => `${index ? 'L' : 'M'}${(offsetX + (x - minX) * scale).toFixed(1)},${(height - offsetY - (ys[index]! - minY) * scale).toFixed(1)}`).join(' ');
}
