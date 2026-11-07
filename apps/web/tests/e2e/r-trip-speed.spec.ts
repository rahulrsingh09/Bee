import { expect, test } from '@playwright/test';
import { installRFixture } from './r-experience.fixture';

for (const width of [402, 1280]) {
  test(`GPS-only trip speed remains labelled and readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 874 });
    await installRFixture(page, { mode: 'dark', populatedTrip: true, missingTripSpeed: true });
    await page.goto('/trips/trip-1');
    const card = page.locator('[data-trip-speed-profile]');
    await expect(card.getByRole('heading', { name: 'Time at each speed' })).toBeVisible({ timeout: 20_000 });
    await card.scrollIntoViewIfNeeded();
    await expect(card).toContainText('Speed estimated from GPS for 30 of 30 min.');
    await expect(card).toContainText('60 s apart');
    await expect(card.locator('[data-speed-band="0–10"]')).toBeVisible();
    await expect(card.getByRole('list', { name: 'Minutes at each speed, mph' })).toBeVisible();
    await expect(card).not.toContainText('unavailable');

    await page.evaluate(() => {
      const preferences = JSON.parse(localStorage.getItem('rm-unit-preferences')!);
      localStorage.setItem('rm-unit-preferences', JSON.stringify({ ...preferences, mode: 'custom', speed_unit: 'kmh' }));
      window.dispatchEvent(new Event('rm-units-change'));
    });
    await expect(card.getByRole('list', { name: 'Minutes at each speed, km/h' })).toBeVisible();
    await expect(card.locator('[data-speed-band="0–16"]')).toBeVisible();
    // The replay readout uses the GPS estimate when Rivian sends no speed.
    const slider = page.getByRole('slider', { name: 'Drive time' });
    await slider.focus();
    await page.keyboard.press('End');
    await expect(page.locator('[data-trip-readout]')).toContainText('km/h');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test('speed coverage stays inside the trip duration when the end timestamp is late', async ({ page }) => {
  await installRFixture(page, { mode: 'dark', populatedTrip: true });
  // A 30 min drive whose end timestamp is 11 h 30 min after its start.
  const columns = ['lat', 'lng', 'altitude_m', 'power_kw', 'regen_power_kw', 'battery_level', 'outside_temp_c',
    'cabin_temp_c', 'driver_temp_c', 'hvac_active', 'tire_fl_psi', 'tire_fr_psi', 'tire_rl_psi', 'tire_rr_psi'];
  const minutes = Array.from({ length: 31 }, (_, index) => index);
  await page.route('**/v1/trips/trip-1/detail**', route => route.fulfill({ json: {
    trip: {
      id: 'trip-1', vehicle_id: 'owner-vehicle', started_at: '2026-10-08T17:00:00Z', ended_at: '2026-10-09T04:30:00Z',
      distance_mi: 20, duration_min: 30, energy_used_kwh: 6.4, efficiency_wh_mi: 320, max_speed_mph: 50,
      drive_mode: 'all_purpose', soc_start: 75, soc_end: 68, start_place: 'Drive 1', end_place: 'Home',
    },
    sample_interval_seconds: 60,
    samples: {
      elapsed_s: minutes.map(minute => minute * 60),
      speed_mph: minutes.map(() => 40),
      ...Object.fromEntries(columns.map(name => [name, minutes.map(() => null)])),
    },
    outside_temperature: { source: 'unavailable', attribution: null, samples: [] },
  } }));
  await page.goto('/trips/trip-1');
  const card = page.locator('[data-trip-speed-profile]');
  await expect(card).toContainText('Speed recorded for 30 of 30 min.', { timeout: 20_000 });
  await expect(page.locator('main')).not.toContainText(/10h|11h|unavailable/);
  await expect(page.getByText('Thu, Oct 8 · 5:00–5:30 PM')).toBeVisible();
  await expect(page.locator('[data-trip-tile="Average speed"]')).toContainText('40mph');
});
