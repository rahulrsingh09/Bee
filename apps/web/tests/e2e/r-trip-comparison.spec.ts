import { expect, test } from '@playwright/test';
import { installRFixture } from './r-experience.fixture';

for (const width of [393, 1440]) for (const mode of ['dark', 'light'] as const) {
  test(`multi-trip colors, emphasis and units at ${width}px in ${mode}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installRFixture(page, { mode, populatedAnalytics: true, populatedAdmin: true, tripCount: 20, timezone: 'America/Los_Angeles' });
    await page.addInitScript(() => localStorage.setItem('rm-app-timezone', 'America/Los_Angeles'));
    await page.goto('/trips');
    const table = page.locator('[data-widget-id="d5000005-0000-0000-0000-000000000006"]');
    const key = page.getByRole('group', { name: 'Selected route key' });
    const select = async (index: number) => {
      const label = `Route ${String(index).padStart(2, '0')} · Home`;
      await (width === 393 ? table.getByRole('button') : table.getByRole('row')).filter({ hasText: label }).click();
    };
    for (let index = 1; index <= 10; index++) await select(index);
    await expect(key.getByRole('button')).toHaveCount(10);
    const colors = () => key.getByRole('button').evaluateAll(elements => Object.fromEntries(elements.map(element => [
      element.getAttribute('data-route-id')!, getComputedStyle(element.querySelector('path')!).stroke,
    ])));
    const firstDate = await key.getByRole('button').first().locator('span.block').last().textContent();
    expect(firstDate).toBe('Oct 7, 2026, 11:00 PM');
    const firstTrip = (width === 393 ? table.getByRole('button') : table.getByRole('row')).filter({ hasText: 'Route 01 · Home' });
    await expect(firstTrip).toContainText(firstDate!.trim());
    if (width === 1440) {
      const compact = key.locator('../..');
      await compact.evaluate(element => { (element as HTMLElement).style.height = '304px'; });
      await expect.poll(() => compact.evaluate(element => {
        const map = element.querySelector('.maplibregl-map')!.getBoundingClientRect();
        const key = element.querySelector('[data-trip-route-key]')!.getBoundingClientRect();
        return map.bottom <= key.top + 1 && element.scrollHeight <= element.clientHeight + 1;
      })).toBe(true);
      await compact.evaluate(element => { (element as HTMLElement).style.removeProperty('height'); });
    }
    const before = await colors();
    expect(new Set(Object.values(before)).size).toBe(10);
    await key.getByRole('button').nth(7).click();
    await expect(key.getByRole('button').nth(7)).toHaveAttribute('aria-pressed', 'true');
    await expect(key.getByRole('button')).toHaveCount(10);
    await select(2);
    await expect(key.getByRole('button')).toHaveCount(9);
    for (const [id, color] of Object.entries(await colors())) expect(color).toBe(before[id]);
    await select(2);
    const efficiency = page.locator('[data-testid="sensor-chip"]').filter({ hasText: 'Avg Efficiency' }).first();
    await page.getByRole('button', { name: /Toggle efficiency units/ }).click();
    await expect(efficiency).toContainText('304 Wh/mi');
    await expect((width === 393 ? table.getByRole('button') : table.getByRole('row')).filter({ hasText: 'Route 01 · Home' })).toContainText(/250\s*Wh\/mi/);
    await page.getByRole('button', { name: /Toggle efficiency units/ }).click();
    await expect(efficiency).toContainText('3.3 mi/kWh');
    for (let index = 11; index <= 15; index++) await select(index);
    await table.getByRole('button', { name: 'Next', exact: true }).click();
    for (let index = 16; index <= 20; index++) await select(index);
    await expect(key.getByRole('button')).toHaveCount(20);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

const EVIDENCE_DIR = process.env.P3_EVIDENCE_DIR;

/** A realistic 30 min commute: odometer, home price, a route comparison and a hill. */
async function installCommute(page: import('@playwright/test').Page) {
  const minutes = Array.from({ length: 31 }, (_, index) => index);
  const kw = [0, 13.5, 16.5, 6, -9, 3, 15, 18, 15.75, 14.25, -11.25, 4.5, 19.5, 21, 18.75, 17.25, 16.5, -6, 7.5, 18, 20.25, 19.5, 18, -13.5, 3.75, 15.75, 17.25, 14.25, -7.5, -10.5, 0];
  const mph = [0, 12, 22, 18, 8, 14, 26, 31, 33, 30, 12, 16, 34, 38, 36, 35, 33, 20, 24, 36, 40, 39, 37, 15, 18, 32, 34, 30, 14, 8, 0];
  const trip = {
    id: 'trip-1', vehicle_id: 'owner-vehicle', started_at: '2026-10-08T15:12:00Z', ended_at: '2026-10-08T15:42:00Z',
    distance_mi: 15.2, duration_min: 30, energy_used_kwh: 4.5, efficiency_wh_mi: 296, max_speed_mph: 40,
    drive_mode: 'all_purpose', soc_start: 49, soc_end: 44, start_odometer_mi: 12452, end_odometer_mi: 12467,
    start_place: 'Home', end_place: 'Office',
    tags: [{ id: 'tag-1', vehicle_id: 'owner-vehicle', name: 'Daily commute', color_token: 'accent', created_by: 'u', created_at: '', updated_at: '' }],
  };
  await page.route('**/v1/trips/trip-1/detail**', route => route.fulfill({ json: {
    trip, sample_interval_seconds: 60,
    samples: {
      elapsed_s: minutes.map(minute => minute * 60),
      lat: minutes.map(minute => 47.61 + minute * .0012 + Math.sin(minute / 4) * .0008),
      lng: minutes.map(minute => -122.33 + minute * .0016),
      altitude_m: minutes.map(minute => 20 + Math.sin(minute / 9) * 30 + minute * .4),
      speed_mph: mph, power_kw: kw.map(value => Math.max(0, value)), regen_power_kw: kw.map(value => (value < 0 ? value : 0)),
      battery_level: minutes.map(minute => 49 - minute / 6), outside_temp_c: minutes.map(() => 8),
      cabin_temp_c: minutes.map(() => 21), driver_temp_c: minutes.map(() => 21), hvac_active: minutes.map(() => true),
      tire_fl_psi: minutes.map(() => 44), tire_fr_psi: minutes.map(() => 45), tire_rl_psi: minutes.map(() => 44), tire_rr_psi: minutes.map(() => 45),
    },
    outside_temperature: { source: 'vehicle', attribution: null, samples: [] },
  } }));
  await page.route('**/v1/vehicles/owner-vehicle/insights**', route => route.fulfill({ json: { insights: [{
    id: 'route_comparison:trip:trip-1', kind: 'route_comparison', severity: 'info', sample_size: 12,
    baseline: { method: 'median', window: 'earlier_drives_same_route', count: 12 },
    evidence: [{ type: 'trip', id: 'trip-1' }],
    values: { this_mi_per_kwh: 3.4, usual_mi_per_kwh: 3.1, pct_diff: 9.7, rank: 3, count: 12 },
  }] } }));
  await page.route('**/v1/places', route => route.fulfill({ json: { places: [{
    id: 'home', name: 'Home', latitude: 47.61, longitude: -122.33, radius_m: 100, is_home: true, is_work: false, address: null,
    charging: { id: 'home-rate', name: 'Home', billing_type: 'per_kwh', rate: 0.12, session_fee: 0, currency: 'USD', timezone: null, tou_periods: [] },
  }] } }));
}

test('trip detail shows the odometer hero and line from the trip API', async ({ page }) => {
  await installRFixture(page, { mode: 'dark' });
  await installCommute(page);
  await page.goto('/trips/trip-1');
  await expect(page.getByTestId('trip-odometer')).toContainText('12,467mi');
  await expect(page.locator('[data-trip-facts]')).toHaveText('Odometer 12,452 → 12,467 mi · battery 49% → 44%');
});

for (const width of [390, 1280]) for (const mode of ['dark', 'light'] as const) {
  test(`trip detail compares the route and shows cost at ${width}px in ${mode}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await installRFixture(page, { mode, timezone: 'America/Los_Angeles' });
    await page.addInitScript(() => localStorage.setItem('rm-app-timezone', 'America/Los_Angeles'));
    await installCommute(page);
    await page.goto('/trips/trip-1');
    await expect(page.getByRole('heading', { level: 1, name: 'Home → Office' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Thu, Oct 8 · 8:12–8:42 AM')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit tags' })).toBeVisible();
    await expect(page.getByTestId('trip-distance')).toContainText('15.2mi');
    await expect(page.locator('[data-trip-facts]')).toContainText('Odometer 12,452 → 12,467 mi · battery 49% → 44%');
    await expect(page.locator('[data-trip-tile="Efficiency"]')).toContainText('10% better than your usual on this route');
    await expect(page.locator('[data-trip-tile="Cost"]')).toContainText('$0.54');
    await expect(page.locator('[data-trip-tile="Cost"]')).toContainText('At your home price of $0.12/kWh');
    await expect(page.locator('[data-trip-tile="Energy used"]')).toContainText('Regen returned');
    const history = page.locator('[data-trip-route-history]');
    await expect(history).toContainText('12 earlier drives on this route.');
    await expect(history).toContainText('3.1 mi/kWh');
    await expect(history).toContainText('3.4 mi/kWh · 3rd best of 13 drives');
    // The climb is more than 100 ft, so the elevation chart shows.
    await expect(page.getByRole('heading', { name: 'Elevation along the route' })).toBeVisible();
    await expect(page.locator('[data-trip-conditions]')).toContainText('46 °F');
    await expect(page.locator('[data-trip-conditions]')).toContainText('70 °F · climate on');
    await expect(page.locator('[data-trip-conditions]')).toContainText('44–45 psi');
    await expect(page.locator('[data-trip-speed-profile]')).toContainText('Speed recorded for 30 of 30 min.');
    if (width >= 1024) {
      const map = (await page.locator('[data-trip-map]').boundingBox())!;
      const summary = (await page.locator('[data-trip-summary]').boundingBox())!;
      const power = (await page.locator('[data-trip-power]').boundingBox())!;
      expect(summary.x).toBeGreaterThan(map.x + map.width);
      expect(power.x).toBeCloseTo(map.x, 0);
      expect(power.y).toBeGreaterThan(map.y + map.height);
    } else {
      const map = (await page.locator('[data-trip-map]').boundingBox())!;
      const summary = (await page.locator('[data-trip-summary]').boundingBox())!;
      expect(map.x).toBe(0);
      expect(map.width).toBe(width);
      expect(summary.y).toBeLessThan(map.y + map.height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // Let the map draw the route before the capture.
    await expect(page.locator('[data-trip-map] canvas').first()).toBeVisible();
    await page.evaluate(() => new Promise<void>(resolve => setTimeout(() => requestAnimationFrame(() => resolve()), 500)));
    const name = `trip-${width}-${mode}`;
    await page.screenshot({ path: testInfo.outputPath(`${name}-first-screen.png`) });
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
    if (EVIDENCE_DIR) {
      await page.screenshot({ path: `${EVIDENCE_DIR}/${name}-first-screen.png` });
      await page.screenshot({ path: `${EVIDENCE_DIR}/${name}.png`, fullPage: true });
    }
  });
}
