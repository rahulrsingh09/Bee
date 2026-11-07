import { beforeEach, describe, expect, it } from 'vitest';
import type { ChargeSession, Insight, PhantomDrainPeriod, Place, Trip, VehicleStatus } from '@riviamigo/types';
import { setAppTimezone } from '@riviamigo/ui/lib/dateTime';
import {
  attentionItems, clockLabel, daysOfRangeSentence, eventTime, latestPark, nowActivity, nowPlace, nowTitle,
  placeAt, plugState, railTitle, routePath, scheduleLabel, spinLabel, splitUnit, vehicleConfiguration,
  weekLine, weekSummary,
} from './nowModel';

const status = (overrides: Partial<VehicleStatus> = {}) => ({
  vehicle_id: 'v', battery_level: 68, range_miles: 218, power_state: 'ready', charger_state: 'disconnected',
  charger_status: 'chrgr_sts_not_connected', speed_mph: 0, latitude: 47.6, longitude: -122.3, last_updated: null,
  ...overrides,
}) as VehicleStatus;

const home: Place = {
  id: 'p1', name: 'Home', latitude: 47.6, longitude: -122.3, radius_m: 100, is_home: true, is_work: false, address: null, charging: null,
};
const trip = (overrides: Partial<Trip> = {}) => ({
  id: 't1', vehicle_id: 'v', started_at: '2026-11-07T10:00:00Z', ended_at: '2026-11-07T10:30:00Z', distance_mi: 20,
  duration_min: 30, energy_used_kwh: 6.4, efficiency_wh_mi: 320, max_speed_mph: 50, drive_mode: null, soc_start: 70, soc_end: 64,
  ...overrides,
}) as Trip;
const charge = (overrides: Partial<ChargeSession>) => ({
  id: 'c1', vehicle_id: 'v', started_at: '2026-11-06T04:00:00Z', ended_at: '2026-11-06T06:00:00Z', location_name: 'Home',
  charger_type: 'ac', energy_added_kwh: 20, duration_min: 120, soc_start: 40, soc_end: 65, peak_power_kw: 11, cost_usd: null,
  ...overrides,
}) as ChargeSession;
const insight = <K extends Insight['kind']>(kind: K, values: Extract<Insight, { kind: K }>['values'], severity: 'info' | 'attention' = 'attention') =>
  ({ id: `${kind}:now`, kind, severity, values, baseline: null, sample_size: 1, evidence: [] }) as unknown as Insight;

const NOW = Date.parse('2026-11-07T15:00:00Z');

beforeEach(() => setAppTimezone('UTC'));

describe('status title', () => {
  it('reads the vehicle state, keeping the last known state when data is stale', () => {
    expect(nowActivity(null)).toBe('waiting');
    expect(nowActivity(status({ power_state: 'charging' }))).toBe('charging');
    expect(nowActivity(status({ power_state: 'drive' }))).toBe('driving');
    expect(nowActivity(status({ power_state: 'ready', gear_status: 'drive', speed_mph: 30 }))).toBe('driving');
    expect(nowActivity(status({ power_state: 'sleep', telemetry_stale: true }))).toBe('parked');
  });

  it('names the saved place at the car, or the end place of the latest drive', () => {
    expect(placeAt(47.6003, -122.3, [home])).toBe('Home');
    expect(placeAt(47.61, -122.3, [home])).toBeNull();
    expect(nowPlace(status(), [home], undefined)).toBe('Home');
    expect(nowPlace(status({ latitude: null, longitude: null }), [], trip({ end_place: 'Office' }))).toBe('Office');
    expect(nowPlace(status({ latitude: 47.7 }), [], trip({ end_place: 'Office', end_lat: 47.6, end_lng: -122.3 }))).toBeNull();
    expect(nowPlace(status({ latitude: null, longitude: null }), [], trip({ end_place: 'Office', ended_at: null }))).toBeNull();
  });

  it('writes one status title per state', () => {
    expect(nowTitle('parked', 'Home')).toBe('Parked at Home');
    expect(nowTitle('parked', null)).toBe('Parked');
    expect(nowTitle('charging', 'Office')).toBe('Charging at Office');
    expect(nowTitle('driving', 'Home')).toBe('Driving');
    expect(nowTitle('waiting', null)).toBe('Waiting for vehicle data');
  });
});

describe('vehicle identity', () => {
  it('uses the real model, trim and color, with no fixed paint name', () => {
    expect(vehicleConfiguration({ model: 'R2', trim: 'Performance', color: 'Launch Green' })).toBe('R2 Performance · Launch Green');
    expect(vehicleConfiguration({ model: 'R1S', trim: 'R1S Adventure', color: null })).toBe('R1S Adventure');
    expect(vehicleConfiguration({ model: 'R2', trim: null, color: null })).toBe('R2');
    expect(spinLabel({ model: 'R2', color: 'Catalina Cove' })).toBe('Your R2, Catalina Cove. Use arrow keys to turn.');
    expect(spinLabel({ model: 'R2', color: null })).toBe('Your R2. Use arrow keys to turn.');
  });
});

describe('status chips', () => {
  it('reads the plug state and hides it when unknown', () => {
    expect(plugState(status())).toBe('unplugged');
    expect(plugState(status({ charger_state: 'Connected', charger_status: 'chrgr_sts_connected' }))).toBe('plugged');
    expect(plugState(status({ power_state: 'charging' }))).toBe('charging');
    expect(plugState(status({ charger_state: null, charger_status: null }))).toBeNull();
    expect(plugState(null)).toBeNull();
  });

  it('shows a scheduled charge only when one is enabled and the car is not charging', () => {
    expect(clockLabel(23 * 60)).toBe('11 PM');
    expect(clockLabel(6 * 60 + 30)).toBe('6:30 AM');
    expect(clockLabel(0)).toBe('12 AM');
    expect(scheduleLabel({ enabled: true, start_time_minutes: 1380 }, 'unplugged')).toBe('Charges 11 PM');
    expect(scheduleLabel({ enabled: false, start_time_minutes: 1380 }, 'unplugged')).toBeNull();
    expect(scheduleLabel({ enabled: true, start_time_minutes: null }, 'plugged')).toBeNull();
    expect(scheduleLabel({ enabled: true, start_time_minutes: 1380 }, 'charging')).toBeNull();
    expect(scheduleLabel(null, null)).toBeNull();
  });
});

describe('insight sentences', () => {
  it('states days of range only when the rule fired', () => {
    expect(daysOfRangeSentence(undefined)).toBeNull();
    expect(daysOfRangeSentence([])).toBeNull();
    const days = (value: number) => [insight('days_of_range', { range_mi: 200, median_daily_mi: 60, days: value, days_with_data: 20 }, 'info')];
    expect(daysOfRangeSentence(days(3.3))).toBe('enough for about 3 days of your usual driving');
    expect(daysOfRangeSentence(days(1.2))).toBe('enough for about 1 day of your usual driving');
    expect(daysOfRangeSentence(days(0.4))).toBe('enough for less than 1 day of your usual driving');
  });

  it('lists stale data, high parked loss and missing prices in that order, and nothing else', () => {
    expect(attentionItems(undefined)).toEqual([]);
    const items = attentionItems([
      insight('missing_price', { count: 3, window_days: 90 }, 'info'),
      insight('high_parked_loss', {
        loss_pct: 4, usual_loss_pct: 1.3, ratio: 3.1, duration_hours: 8.5,
        started_at: '2026-11-07T09:05:00Z', ended_at: '2026-11-07T17:35:00Z',
      }),
      insight('days_of_range', { range_mi: 200, median_daily_mi: 60, days: 3, days_with_data: 20 }, 'info'),
      insight('stale_data', { hours: 7.4, last_seen_at: '2026-11-07T07:36:00Z' }),
    ]);
    expect(items.map(item => [item.title, item.to])).toEqual([
      ['No data for 7 h', '/vehicle-health'],
      ['Parked loss was high', '/battery/phantom-drain'],
      ['3 charges have no price', '/settings'],
    ]);
    expect(items[1]!.detail).toBe('4.0% in 8h 30m · 3.1× your usual loss');
    expect(items[2]!.search).toEqual({ section: 'places' });
    expect(attentionItems([insight('missing_price', { count: 1, window_days: 90 }, 'info')])[0]!.title).toBe('1 charge has no price');
  });
});

describe('this week', () => {
  it('sums drives, efficiency and known charge cost over seven days that end today', () => {
    const summary = weekSummary([
      trip({ started_at: '2026-11-07T08:00:00Z', distance_mi: 30, energy_used_kwh: 9 }),
      trip({ started_at: '2026-11-03T08:00:00Z', distance_mi: 10, energy_used_kwh: null }),
      trip({ started_at: '2026-10-31T08:00:00Z', distance_mi: 999 }),
    ], [
      charge({ started_at: '2026-11-06T04:00:00Z', cost_usd: 2.4 }),
      charge({ started_at: '2026-11-05T04:00:00Z', cost_usd: null }),
      charge({ started_at: '2026-10-20T04:00:00Z', cost_usd: 50 }),
    ], NOW);
    expect(summary.days).toHaveLength(7);
    expect(summary.days.map(day => day.key)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']);
    expect(summary.days.at(-1)).toMatchObject({ today: true, miles: 30, label: 'Sat' });
    expect(summary.days[2]!.miles).toBe(10);
    expect(summary).toMatchObject({ miles: 40, drives: 2, efficiencyWhMi: 300, cost: 2.4 });
    expect(weekLine(summary)).toBe('This week: 40 mi · 2 drives · 3.3 mi/kWh · $2.40 energy cost');
  });

  it('leaves out parts it cannot know', () => {
    const summary = weekSummary([], [charge({ cost_usd: null })], NOW);
    expect(summary).toMatchObject({ drives: 0, efficiencyWhMi: null, cost: null });
    expect(weekLine(summary)).toBe('This week: No drives');
  });
});

describe('story rail', () => {
  it('titles the rail Today only when the latest event is today', () => {
    expect(railTitle(['2026-11-06T10:00:00Z', '2026-11-07T09:00:00Z', null], NOW)).toBe('Today');
    expect(railTitle(['2026-11-06T10:00:00Z', undefined], NOW)).toBe('Latest');
    expect(railTitle([], NOW)).toBe('Latest');
    expect(eventTime('2026-11-06T18:12:00Z', NOW)).toMatch(/^Yesterday /);
  });

  it('takes the newest validated park and draws a route only with two points', () => {
    const period = (overrides: Partial<PhantomDrainPeriod>) => ({
      period_start: '2026-11-07T09:00:00Z', period_end: '2026-11-07T17:00:00Z', soc_lost_pct: 2, validation_status: 'validated', ...overrides,
    }) as PhantomDrainPeriod;
    expect(latestPark([period({ validation_status: 'excluded' }), period({ period_start: '2026-11-06T09:00:00Z' })])?.period_start)
      .toBe('2026-11-06T09:00:00Z');
    expect(latestPark([period({ soc_lost_pct: null })])).toBeUndefined();
    expect(routePath([{ lat: 1, lng: 1 }], 240, 96)).toBeNull();
    const path = routePath([{ lat: 47.6, lng: -122.3 }, { lat: 47.61, lng: -122.29 }, { lat: 47.62, lng: -122.31 }], 240, 96)!;
    const numbers = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(numbers.every(value => value >= 0 && value <= 240)).toBe(true);
    expect(splitUnit('12,486 mi')).toEqual({ value: '12,486', unit: 'mi' });
  });
});
