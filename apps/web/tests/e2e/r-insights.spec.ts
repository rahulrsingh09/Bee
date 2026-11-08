// Insights (release 2): five tabs over synthetic data. No live vehicle or account is used.
import { expect, test, type Page } from '@playwright/test';
import { installRFixture } from './r-experience.fixture';

const DAY = 864e5;
const at = (daysAgo: number, hour = 17) => {
  const date = new Date(Date.now() - daysAgo * DAY);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
};
const later = (iso: string, minutes: number) => new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();

const home = { id: 'place-home', name: 'Home', latitude: 47.71355, longitude: -122.20369, radius_m: 75, is_home: true, is_work: false, address: null,
  charging: { id: 'cp-home', name: 'Home charging (PSE Schedule 7)', billing_type: 'per_kwh', rate: 0.189119, session_fee: 0, currency: 'USD', timezone: 'America/Los_Angeles', tou_periods: [] } };
const office = { id: 'place-office', name: 'Office', latitude: 47.61099, longitude: -122.19998, radius_m: 120, is_home: false, is_work: true, address: null,
  charging: { id: 'cp-office', name: 'Office charging (free)', billing_type: 'free', rate: 0, session_fee: 0, currency: 'USD', timezone: 'America/Los_Angeles', tou_periods: [] } };

function data() {
  const trips = Array.from({ length: 24 }, (_, i) => {
    const started = at(24 - i, 15 + (i % 3));
    const miles = [1.4, 8, 14, 22, 36, 64][i % 6]!;
    const odo = 1000 + i * 30;
    return {
      id: `trip-${i + 1}`, vehicle_id: 'owner-vehicle', started_at: started, ended_at: later(started, 40), distance_mi: miles, duration_min: 40,
      energy_used_kwh: miles < 3 ? null : miles * (280 + (i % 5) * 12) / 1000, efficiency_wh_mi: miles < 3 ? null : 280 + (i % 5) * 12,
      max_speed_mph: 60, drive_mode: null, soc_start: 72 - (i % 4) * 5, soc_end: 60 - (i % 4) * 5, start_place: i % 2 ? 'Office' : 'Home',
      end_place: i % 2 ? 'Home' : 'Office', start_odometer_mi: odo, end_odometer_mi: odo + miles, outside_temp_c: 2 + (i % 9) * 2,
    };
  });
  const charge = (id: string, daysAgo: number, over: Record<string, unknown>) => {
    const started = at(daysAgo, 4);
    return { id, vehicle_id: 'owner-vehicle', started_at: started, ended_at: later(started, 180), location_name: 'Home', location_lat: 47.71356,
      location_lng: -122.2037, charger_type: 'AC', energy_added_kwh: 22, duration_min: 180, soc_start: 40, soc_end: 65, peak_power_kw: 11,
      cost_usd: 4.16, cost_method: 'profile', ...over };
  };
  const charges = [
    ...[22, 18, 14, 10, 6, 2].map((d, i) => charge(`charge-home-${i}`, d, {})),
    ...[21, 17, 13, 9, 5, 1].map((d, i) => charge(`charge-office-${i}`, d, { location_name: 'Office', location_lat: 47.611, location_lng: -122.2, cost_usd: 0, energy_added_kwh: 18 })),
    charge('charge-dc-1', 12, { location_name: 'Near Ridgefield', location_lat: 45.81, location_lng: -122.74, charger_type: 'DC', energy_added_kwh: 40, cost_usd: 21.25, soc_start: 22, soc_end: 70, duration_min: 32 }),
    charge('charge-dc-2', 11, { location_name: 'Near Kelso', location_lat: 46.14, location_lng: -122.9, charger_type: 'DC', energy_added_kwh: 30, cost_usd: 18.4, soc_start: 30, soc_end: 66, duration_min: 28 }),
    charge('charge-mill-1', 8, { location_name: 'Mill Creek', location_lat: 47.828, location_lng: -122.212, energy_added_kwh: 4, cost_usd: null, cost_method: 'unknown' }),
  ];
  const curve = (dc: boolean, start: number, end: number) => Array.from({ length: 12 }, (_, i) => ({
    minutes_elapsed: i * (dc ? 3 : 15), soc_pct: Math.min(end, start + i * (end - start) / 9), power_kw: dc ? Math.max(40, 190 - i * 12) : 11,
  }));
  const degradation = Array.from({ length: 25 }, (_, i) => ({ ts: at(24 - i, 12), usable_kwh: 91.4 - (i % 7) * 0.3 + (i === 24 ? 0.1 : 0), rated_kwh: null, capacity_pct: 99 }));
  const periods = [20, 15, 9, 3].map(d => ({
    period_start: at(d, 2), period_end: at(d, 14), duration_hours: 12, sleep_share_pct: 90, state_coverage_pct: 100, soc_start: 70, soc_end: 69.5,
    soc_lost_pct: 0.5, drain_pct_per_hour: 0.04, range_start_mi: null, range_end_mi: null, range_lost_mi: null, range_lost_per_hour_mi: null,
    energy_drained_kwh: null, avg_power_w: null, has_reduced_range: false, validation_status: 'validated', validation_reason: null, sample_count: 40,
    start_sample_at: null, end_sample_at: null, movement_detected: false, overlaps_trip: false, overlaps_charge: false,
  }));
  return { trips, charges, curve, degradation, periods };
}

async function installInsights(page: Page, mode: 'light' | 'dark' = 'dark') {
  const fixture = await installRFixture(page, { mode, timezone: 'America/Los_Angeles', odometer: 1760 });
  const d = data();
  const places = [home, office];
  const writes: string[] = [];
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  // Routes added after the fixture take precedence over it.
  await page.route(/\/v1\/trips(\?|$)/, route => route.fulfill(json({ items: d.trips, total: d.trips.length, page: 1, per_page: 200 })));
  await page.route(/\/v1\/charging(\?|$)/, route => route.fulfill(json({ items: d.charges, total: d.charges.length, page: 1, per_page: 200 })));
  await page.route(/\/v1\/charging\/sessions\/[^/]+\/curve/, route => {
    const id = new URL(route.request().url()).pathname.split('/')[4]!;
    const c = d.charges.find(x => x.id === id)!;
    return route.fulfill(json(d.curve(c.charger_type === 'DC', c.soc_start as number, c.soc_end as number)));
  });
  await page.route(/\/v1\/battery\/degradation/, route => route.fulfill(json(d.degradation)));
  await page.route(/\/v1\/vehicles\/[^/]+\/idle-drain/, route => route.fulfill(json({ vehicle_id: 'owner-vehicle', periods: d.periods })));
  await page.route(/\/v1\/places(\?|$)/, route => route.fulfill(json({ places })));
  await page.route(/\/v1\/vehicles\/[^/]+\/charging-sessions\/[^/]+\/place-tag$/, route => {
    const path = new URL(route.request().url()).pathname;
    writes.push(`${route.request().method()} ${path}`);
    const { tag } = route.request().postDataJSON();
    const anchor = d.charges.find(c => c.id === path.split('/').at(-2))!;
    const target = tag === 'home' ? home : tag === 'office' ? office : null;
    if (target) Object.assign(anchor, { location_lat: target.latitude, location_lng: target.longitude, location_override_mode: 'saved_place', cost_usd: tag === 'office' ? 0 : 0.76, cost_method: 'profile' });
    return route.fulfill(json({ tag, place_id: target?.id ?? null, updated: 1, session_ids: [anchor.id] }));
  });
  return { ...fixture, writes: [...fixture.writes, ...writes], insightWrites: writes };
}

const tabs = ['cost', 'charging', 'battery', 'efficiency', 'lifetime'] as const;

for (const width of [390, 1280]) for (const mode of ['dark', 'light'] as const) {
  test(`every Insights tab renders without overflow at ${width}px in ${mode}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await installInsights(page, mode);
    await page.goto('/insights');
    await expect(page).toHaveURL(/\/insights\/cost$/);
    const sections = page.getByRole('navigation', { name: 'Insights sections' });
    await expect(sections.getByRole('link')).toHaveText(['Cost', 'Charging', 'Battery', 'Efficiency', 'Lifetime']);
    for (const tab of tabs) {
      await sections.getByRole('link', { name: new RegExp(`^${tab}$`, 'i') }).click();
      await expect(page).toHaveURL(new RegExp(`/insights/${tab}$`));
      await expect(sections.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(page.locator('.ri-ins-grid .ri-card').first()).toBeVisible();
      // The five tabs stay on one line.
      const boxes = await sections.getByRole('link').evaluateAll(links => links.map(l => l.getBoundingClientRect().top));
      expect(new Set(boxes.map(Math.round)).size).toBe(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`insights-${tab}.png`), fullPage: true });
    }
    await expect(page.getByRole('link', { name: /dashboard/i })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('Cost shows the total, the unpriced callout and tags a place for every charge there', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const fixture = await installInsights(page);
  await page.goto('/insights/cost');
  await expect(page.getByRole('region', { name: 'Spent on charging' })).toContainText('$64.61');
  await expect(page.getByRole('link', { name: /1 charge has no cost yet/ })).toHaveAttribute('href', '/charging/charge-mill-1');
  const group = page.getByRole('group', { name: 'Tag Mill Creek' });
  await group.getByRole('button', { name: 'Office' }).click();
  const confirm = page.getByRole('group', { name: 'Tag Mill Creek as Office?' });
  await expect(confirm).toContainText('1 charge at Mill Creek moves to Office');
  expect(fixture.insightWrites).toEqual([]);
  await confirm.getByRole('button', { name: 'Tag as Office' }).click();
  await expect(page.getByText('Mill Creek is now tagged Office. 1 charge was updated.')).toBeVisible();
  expect(fixture.insightWrites).toEqual(['POST /v1/vehicles/owner-vehicle/charging-sessions/charge-mill-1/place-tag']);
  // The charge now counts at the Office place.
  await expect(page.getByRole('group', { name: 'Tag Mill Creek' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Places' })).toContainText('7 charges · 112 kWh · free');
  await page.getByRole('button', { name: 'Expand Cost per week' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cost per week' });
  await expect(dialog.getByRole('table')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('a chart shows a tooltip on hover and its table on request', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installInsights(page);
  await page.goto('/insights/charging');
  const card = page.getByRole('region', { name: 'Energy charged per week' });
  await card.locator('path[data-tip]').first().hover();
  await expect(page.locator('.ri-tip')).toContainText('Week of');
  await card.getByRole('button', { name: 'Show as table' }).click();
  await expect(card.getByRole('table')).toBeVisible();
  await expect(page.getByRole('region', { name: 'DC charging curve' }).locator('.ri-legend span')).toHaveCount(2);
});

test('the efficiency unit switch persists after a reload', async ({ page }) => {
  await installInsights(page);
  await page.goto('/insights/efficiency');
  const unit = page.getByRole('group', { name: 'Efficiency unit' });
  await unit.getByRole('button', { name: 'kWh/100 mi' }).click();
  await expect(page.getByRole('region', { name: 'Average efficiency' })).toContainText('kWh/100 mi');
  await page.reload();
  const after = page.getByRole('group', { name: 'Efficiency unit' }).getByRole('button', { name: 'kWh/100 mi' });
  await expect(after).toBeVisible({ timeout: 15_000 });
  await expect(after).toHaveAttribute('aria-pressed', 'true');
});

test('old Battery, Parked loss and Efficiency links open their Insights tab', async ({ page }) => {
  await installInsights(page);
  for (const [from, to] of [['/battery', 'battery'], ['/battery/phantom-drain', 'battery'], ['/efficiency', 'efficiency'], ['/explore', 'cost']] as const) {
    await page.goto(from);
    await expect(page).toHaveURL(new RegExp(`/insights/${to}$`));
    await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Insights', exact: true })).toHaveAttribute('aria-current', 'page');
  }
  await expect(page.getByRole('region', { name: 'Parked loss, last 30 days' })).toHaveCount(0);
  await page.goto('/insights/battery');
  await expect(page.getByRole('region', { name: 'Parked loss, last 30 days' })).toContainText('% / day');
});
