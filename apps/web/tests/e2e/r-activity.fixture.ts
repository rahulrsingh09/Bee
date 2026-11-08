// Synthetic Activity data layered over the R fixture; no live vehicle or account is used.
import type { Page } from '@playwright/test';
import { installRFixture } from './r-experience.fixture.ts';

const HOME = { lat: 47.6769, lng: -122.206 };
const OFFICE = { lat: 47.6101, lng: -122.2015 };

/** Installs the R fixture, then answers the Activity reads with trips, charges, places and routes. */
export async function installActivityFixture(page: Page, options: Parameters<typeof installRFixture>[1] = {}) {
  const fixture = await installRFixture(page, options);
  const now = Date.now();
  const at = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000).toISOString();
  const route = (from: { lat: number; lng: number }, to: { lat: number; lng: number }, points = 24) =>
    Array.from({ length: points }, (_, index) => {
      const t = index / (points - 1);
      return [from.lng + (to.lng - from.lng) * t + Math.sin(t * Math.PI) * 0.004, from.lat + (to.lat - from.lat) * t] as [number, number];
    });
  const trips = [
    {
      id: 'trip-a', vehicle_id: 'owner-vehicle', started_at: at(2), ended_at: at(1.6), duration_seconds: 24 * 60, distance_miles: 8.7,
      efficiency_wh_per_mile: 324, max_speed_mph: 0, drive_mode: 'all_purpose', soc_start: 70, soc_end: 67,
      start_odometer_mi: 1210.4, end_odometer_mi: 1219.1, start_lat: OFFICE.lat, start_lng: OFFICE.lng, end_lat: HOME.lat, end_lng: HOME.lng,
      start_place: 'Office', end_place: 'Home', start_address: null, end_address: null, outside_temp_c: 11, tags: [],
    },
    {
      id: 'trip-b', vehicle_id: 'owner-vehicle', started_at: at(3), ended_at: at(2.8), duration_seconds: 12 * 60, distance_miles: 1.2,
      efficiency_wh_per_mile: null, max_speed_mph: null, drive_mode: 'all_purpose', soc_start: 71, soc_end: 70,
      start_odometer_mi: 1207.9, end_odometer_mi: 1209.1, start_lat: 47.61, start_lng: -122.19, end_lat: OFFICE.lat, end_lng: OFFICE.lng,
      start_place: null, end_place: 'Office', start_address: null, end_address: null, tags: [],
    },
  ];
  const routes = new Map([['trip-a', route(OFFICE, HOME)], ['trip-b', route({ lat: 47.61, lng: -122.19 }, OFFICE, 8)]]);
  const charges = [
    {
      id: 'charge-home', vehicle_id: 'owner-vehicle', started_at: at(26), ended_at: at(22), location_name: 'Home', charger_type: 'AC',
      energy_added_kwh: 45.8, duration_min: 240, soc_start: 20, soc_end: 70, peak_power_kw: 11.5, cost_usd: 8.66, cost_method: 'profile',
      location_lat: HOME.lat, location_lng: HOME.lng,
    },
    {
      id: 'charge-dc', vehicle_id: 'owner-vehicle', started_at: at(40), ended_at: at(39.6), location_name: null, charger_type: 'DC',
      energy_added_kwh: 40, duration_min: 16, soc_start: 28, soc_end: 72, peak_power_kw: 190, cost_usd: null, cost_method: 'unknown',
      location_lat: 45.8151, location_lng: -122.7426,
    },
  ];
  const places = [
    { id: 'place-home', name: 'Home', latitude: HOME.lat, longitude: HOME.lng, radius_m: 120, is_home: true, is_work: false, address: null,
      charging: { id: 'cp-home', name: 'Home', billing_type: 'per_kwh', rate: 0.189119, session_fee: 0, currency: 'USD', timezone: 'UTC', tou_periods: [] } },
    { id: 'place-office', name: 'Office', latitude: OFFICE.lat, longitude: OFFICE.lng, radius_m: 120, is_home: false, is_work: true, address: null,
      charging: { id: 'cp-office', name: 'Office', billing_type: 'free', rate: 0, session_fee: 0, currency: 'USD', timezone: 'UTC', tou_periods: [] } },
  ];
  const detail = (trip: typeof trips[number]) => {
    const samples = Math.max(2, Math.round(trip.duration_seconds / 60) + 1);
    const line = routes.get(trip.id)!;
    const columns = ['elapsed_s', 'lat', 'lng', 'altitude_m', 'speed_mph', 'power_kw', 'regen_power_kw', 'battery_level', 'outside_temp_c',
      'cabin_temp_c', 'driver_temp_c', 'hvac_active', 'tire_fl_psi', 'tire_fr_psi', 'tire_rl_psi', 'tire_rr_psi'];
    return {
      trip, sample_interval_seconds: 60, outside_temperature: { source: 'unavailable', attribution: null, samples: [] },
      samples: Object.fromEntries(columns.map((name) => [name, Array.from({ length: samples }, (_, index) => {
        const point = line[Math.min(line.length - 1, Math.round((index / (samples - 1)) * (line.length - 1)))]!;
        if (name === 'elapsed_s') return index * 60;
        if (name === 'lat') return point[1];
        if (name === 'lng') return point[0];
        if (name === 'battery_level') return trip.soc_start - ((trip.soc_start - trip.soc_end) * index) / (samples - 1);
        if (name === 'altitude_m') return 40 + Math.sin(index / 3) * 12;
        return null;
      })])),
    };
  };
  const costWrites: unknown[] = [];
  const tagWrites: unknown[] = [];

  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (request.method() === 'GET' && path === '/v1/trips') return json({ items: trips, total: trips.length, page: 1, per_page: 200 });
    if (request.method() === 'GET' && path === '/v1/charging') return json({ items: charges, total: charges.length, page: 1, per_page: 200 });
    if (request.method() === 'GET' && path === '/v1/trips/map') {
      return json({ vehicle_id: 'owner-vehicle', from: at(720), to: at(0), total_trips: trips.length, missing_route_count: 0,
        routes: trips.map((trip) => ({ trip_id: trip.id, tags: [], coordinates: routes.get(trip.id) })) });
    }
    if (request.method() === 'GET' && path === '/v1/places') return json({ places });
    const tripDetail = /^\/v1\/trips\/(trip-[a-z])\/detail$/.exec(path);
    if (tripDetail) {
      const trip = trips.find((item) => item.id === tripDetail[1]);
      if (trip) return json(detail(trip));
    }
    const chargeDetail = /^\/v1\/charging\/(charge-[a-z]+)$/.exec(path);
    if (chargeDetail) {
      const charge = charges.find((item) => item.id === chargeDetail[1]);
      if (charge) return json(charge);
    }
    const curve = /^\/v1\/charging\/sessions\/(charge-[a-z]+)\/curve$/.exec(path);
    if (curve) {
      const charge = charges.find((item) => item.id === curve[1]);
      if (charge) {
        return json(Array.from({ length: 12 }, (_, index) => ({
          minutes_elapsed: (charge.duration_min * index) / 11,
          soc_pct: charge.soc_start + ((charge.soc_end - charge.soc_start) * index) / 11,
          power_kw: charge.charger_type === 'DC' ? 190 - index * 9 : 11, power_method: 'soc_delta', sample_source: 'telemetry',
        })));
      }
    }
    const update = /^\/v1\/vehicles\/owner-vehicle\/charging-sessions\/(charge-[a-z]+)$/.exec(path);
    if (update && request.method() === 'PATCH') {
      const body = request.postDataJSON() as { cost_mode?: string; cost_usd?: number };
      costWrites.push({ id: update[1], ...body });
      const charge = charges.find((item) => item.id === update[1])!;
      if (body.cost_mode === 'manual') Object.assign(charge, { cost_usd: body.cost_usd, cost_method: 'user_manual' });
      return json(charge);
    }
    const tag = /^\/v1\/vehicles\/owner-vehicle\/charging-sessions\/(charge-[a-z]+)\/place-tag$/.exec(path);
    if (tag && request.method() === 'POST') {
      const body = request.postDataJSON() as { tag: 'home' | 'office' | 'other' };
      tagWrites.push({ id: tag[1], ...body });
      const charge = charges.find((item) => item.id === tag[1])!;
      const place = body.tag === 'other' ? null : places.find((item) => (body.tag === 'home' ? item.is_home : item.is_work))!;
      if (place) {
        Object.assign(charge, {
          location_name: place.name, location_lat: place.latitude, location_lng: place.longitude, cost_method: 'profile',
          cost_usd: Math.round(charge.energy_added_kwh * place.charging.rate * 100) / 100,
        });
      }
      return json({ tag: body.tag, place_id: place?.id ?? null, updated: 1, session_ids: [charge.id] });
    }
    return route.fallback();
  });
  return { ...fixture, costWrites, tagWrites };
}
