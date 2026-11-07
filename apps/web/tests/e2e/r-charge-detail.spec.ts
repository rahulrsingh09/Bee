// Charge detail: a DC charge with a per-minute curve, the curve story, and cost entry by total and by rate.
// Synthetic data only. Set P4_EVIDENCE_DIR to save screenshots.
import { expect, test, type Page } from '@playwright/test';
import type { Insight } from '@riviamigo/types';
import { installRFixture } from './r-experience.fixture';

const EVIDENCE_DIR = process.env.P4_EVIDENCE_DIR;
const SOC = [40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71];
const KW = [60, 100, 102.7, 105.3, 108, 107.5, 107, 106.5, 106, 105.5, 105, 102.5, 100, 97.4, 94.9, 92.4, 89.9, 87.3, 84.8, 82.3, 79.8, 77.2, 74.7, 72.2, 69.7, 67.1, 64.6, 62.1, 59.6, 57, 54.5, 52];
const T = [0, 0.73, 1.31, 1.87, 2.42, 2.96, 3.51, 4.06, 4.61, 5.16, 5.71, 6.28, 6.86, 7.45, 8.06, 8.68, 9.32, 9.98, 10.66, 11.36, 12.09, 12.83, 13.6, 14.4, 15.22, 16.08, 16.97, 17.89, 18.85, 19.85, 20.9, 22];

const insights: Insight[] = [
  {
    id: 'charge_shape:charge:charge-dc', kind: 'charge_shape', severity: 'info', baseline: null, sample_size: 32, evidence: [],
    values: { peak_kw: 108, peak_soc: 44, peak_minute: 2.42, low_kw: 52, low_soc: 71, phases: [
      { name: 'climb', start_min: 0, end_min: 2, from_kw: 60, to_kw: 108 },
      { name: 'peak', start_min: 2, end_min: 6, from_kw: 108, to_kw: 105 },
      { name: 'taper', start_min: 6, end_min: 22, from_kw: 105, to_kw: 52 },
    ] },
  },
  {
    id: 'usual_dc_band:charge:charge-dc', kind: 'usual_dc_band', severity: 'info', sample_size: 3, evidence: [],
    baseline: { method: 'p10_p90', window: 'earlier_dc_charges', count: 3 },
    values: { bands: SOC.map((soc, index) => ({ soc, p10_kw: KW[index]! * 0.9 - 6, p90_kw: KW[index]! * 1.1 + 6, sessions: 3 })), sessions: 3, within_band_pct: 94, compared_bins: 32 },
  },
];

/** A DC charge with no price, its curve (API row shape), PATCH and Places. Registered after the fixture, so it wins. */
async function installDcCharge(page: Page, places: Array<Record<string, unknown>> = []) {
  const session: Record<string, unknown> = {
    id: 'charge-dc', vehicle_id: 'owner-vehicle', started_at: '2026-11-07T00:08:00Z', ended_at: '2026-11-07T00:30:00Z',
    location_name: 'Bellevue', charger_type: 'dc', energy_added_kwh: 28.6, duration_min: 22, soc_start: 40, soc_end: 71,
    peak_power_kw: 108, cost_usd: null, cost_method: 'unknown', cost_rate_per_kwh: null, network_vendor: 'Tesla',
    is_public: true, rivian_city: 'Bellevue', location_lat: 47.61, location_lng: -122.2, range_added_km: 148.06,
    source: 'rivian_api', telemetry_sample_count: 0,
  };
  const patches: Array<Record<string, unknown>> = [];
  const placeWrites: Array<{ method: string; body: Record<string, unknown> }> = [];
  await page.route(/\/v1\/charging\/charge-dc(\?|$)/, (route) => route.fulfill({ json: session }));
  await page.route(/\/v1\/charging\/sessions\/charge-dc\/curve/, (route) => route.fulfill({
    json: SOC.map((soc, index) => ({ minutes_elapsed: T[index], charge_rate_kw: KW[index], soc, sample_source: 'parallax_charge_curve_points', power_method: 'recorded' })),
  }));
  await page.route(/\/v1\/vehicles\/[^/]+\/charging-sessions\/charge-dc$/, async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    patches.push(body);
    if (body.cost_mode === 'manual') {
      Object.assign(session, { cost_usd: body.cost_usd, cost_method: 'user_manual', cost_override_mode: 'manual',
        cost_rate_per_kwh: Number(body.cost_usd) / 28.6 });
    }
    await route.fulfill({ json: session });
  });
  await page.route(/\/v1\/places$/, async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      placeWrites.push({ method: 'POST', body });
      return route.fulfill({ json: { id: 'place-new', latitude: 47.61, longitude: -122.2, radius_m: 75, is_home: false, is_work: false, address: body.address, charging: null, ...body } });
    }
    if (places.length && route.request().method() === 'GET') return route.fulfill({ json: { places } });
    return route.fallback();
  });
  await page.route(/\/v1\/places\/[^/?]+$/, async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback();
    const body = route.request().postDataJSON() as Record<string, unknown>;
    placeWrites.push({ method: 'PUT', body });
    const id = new URL(route.request().url()).pathname.split('/').pop();
    return route.fulfill({ json: { ...places.find((place) => place.id === id), ...body, id } });
  });
  return { patches, placeWrites };
}

async function open(page: Page, mode: 'light' | 'dark', width: number, reducedMotion = true, places: Array<Record<string, unknown>> = []) {
  await page.setViewportSize({ width, height: 900 });
  if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  const fixture = await installRFixture(page, { mode, timezone: 'America/Los_Angeles', insights: (scope) => (scope === 'charge:charge-dc' ? insights : []) });
  const charge = await installDcCharge(page, places);
  await page.goto('/charging/charge-dc');
  const heading = (places[0]?.name as string | undefined) ?? 'Tesla Supercharger';
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({ timeout: 20_000 });
  return { fixture, charge };
}

for (const width of [390, 1280]) {
  for (const mode of ['light', 'dark'] as const) {
    test(`a DC charge shows its place, energy, curve story and tiles at ${width}px in ${mode}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const { fixture } = await open(page, mode, width);
      await expect(page.getByText('Bellevue · Fri, Nov 6 · 4:08–4:30 PM')).toBeVisible();
      await expect(page.locator('[data-charge-tag="dc"]')).toHaveText('DC FAST');
      await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
      await expect(page.locator('[data-charge-hero-line]')).toHaveText('40% → 71% in 22 min · about +92 mi of range');
      const card = page.locator('[data-charge-curve="plot"]');
      await expect(card).toHaveAttribute('data-stage', '4');
      await expect(card.getByText('Peak 108 kW at 44%')).toBeVisible();
      await expect(card.locator('[data-charge-story]')).toHaveText('Then a steady taper to 52 kW at 71% as the battery filled.');
      await expect(card.locator('[data-charge-phase]')).toHaveCount(3);
      await expect(card.getByText(/Gray band: your usual DC curve \(3 earlier charges\)/)).toBeVisible();
      await expect(page.locator('[data-charge-tile="Peak power"]')).toContainText('At 44%, 2 min in');
      await expect(page.locator('[data-charge-tile="Average power"]')).toContainText('78');
      await expect(page.locator('[data-charge-tile="Cost"]')).toContainText('No price');
      await expect(page.getByRole('region', { name: 'Add the cost of this charge' })).toBeVisible();

      // Drag across the chart: the tooltip stays inside the card.
      const plot = card.locator('[data-charge-scrub]');
      const box = (await plot.boundingBox())!;
      await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2);
      const tip = card.locator('[data-charge-tip]');
      await expect(tip).toContainText('52 kW · 71% · 22 min');
      const tipBox = (await tip.boundingBox())!;
      const cardBox = (await card.boundingBox())!;
      expect(tipBox.x + tipBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
      await page.mouse.up();

      // The page does not scroll sideways on a phone.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      const body = await page.locator('main').innerText();
      for (const banned of ['SoC', '->']) expect(body).not.toContain(banned);
      if (EVIDENCE_DIR) {
        await page.mouse.move(0, 0);
        await page.screenshot({ path: `${EVIDENCE_DIR}/charge-detail-${width}-${mode}.png`, fullPage: true });
      }
      expect(errors).toEqual([]);
      expect(fixture.unsupportedRequests).toEqual([]);
    });
  }
}

test('the Time toggle morphs the curve to minutes', async ({ page }) => {
  await open(page, 'dark', 390, false);
  const card = page.locator('[data-charge-curve="plot"]');
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute('data-stage', '4', { timeout: 6_000 });
  await card.getByRole('button', { name: 'Time' }).click();
  await expect(card).toHaveAttribute('data-axis', 'time');
  await expect(card.getByText('20 min', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: /Peak/ }).click();
  await expect(card.locator('[data-charge-story]')).toHaveText('Peak 108 kW at 44%. Power stayed above 105 kW for 4 min.');
});

test('an owner enters the total paid and sees the derived rate', async ({ page }) => {
  const { charge } = await open(page, 'dark', 390);
  const box = page.getByRole('region', { name: 'Add the cost of this charge' });
  await box.getByLabel('Total paid (USD)').fill('14.30');
  await expect(box.getByText('= 50¢ per kWh for 28.6 kWh')).toBeVisible();
  if (EVIDENCE_DIR) await box.screenshot({ path: `${EVIDENCE_DIR}/charge-cost-total-390-dark.png` });
  await box.getByRole('button', { name: 'Save cost' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Cost saved.' })).toBeVisible();
  expect(charge.patches).toEqual([{ cost_mode: 'manual', cost_usd: 14.3 }]);
  expect(charge.placeWrites).toEqual([]);
  await expect(page.locator('[data-charge-tile="Cost"]')).toContainText('$14.30Your price · 50¢/kWh');
  await expect(page.getByRole('region', { name: 'Add the cost of this charge' })).toHaveCount(0);
});

test('an owner enters a rate, saves it as a total and keeps the rate for this charger', async ({ page }) => {
  const { charge } = await open(page, 'light', 390);
  const box = page.getByRole('region', { name: 'Add the cost of this charge' });
  await box.getByRole('button', { name: 'Rate per kWh' }).click();
  await box.getByLabel('Rate (USD per kWh)').fill('0.50');
  await expect(box.getByText('= $14.30')).toBeVisible();
  await box.getByRole('checkbox', { name: /Use this rate for my next charges at this charger/ }).check();
  await expect(box.getByText('Adds the saved place “Tesla Supercharger” at this charger with 50¢ per kWh. Automatic charges at this place use this rate.')).toBeVisible();
  if (EVIDENCE_DIR) await box.screenshot({ path: `${EVIDENCE_DIR}/charge-cost-rate-390-light.png` });
  await box.getByRole('button', { name: 'Save cost' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Cost saved. Your next charges at “Tesla Supercharger” use 50¢ per kWh.' })).toBeVisible();
  expect(charge.patches).toEqual([{ cost_mode: 'manual', cost_usd: 14.3 }]);
  expect(charge.placeWrites).toHaveLength(1);
  expect(charge.placeWrites[0]!.body).toMatchObject({
    name: 'Tesla Supercharger', radius_m: 75,
    address: { latitude: 47.61, longitude: -122.2 },
    charging: { billing_type: 'per_kwh', rate: 0.5, session_fee: 0, currency: 'USD' },
  });
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('region', { name: 'Cost' }).getByText('Your price $14.30 · 50¢/kWh')).toBeVisible();
});

const SAVED_PLACE = {
  id: 'place-sc', name: 'Bellevue SC', latitude: 47.61, longitude: -122.2, radius_m: 75, is_home: false, is_work: false, address: null,
  charging: { id: 'cp-1', name: 'Bellevue SC', billing_type: 'per_kwh', rate: 0.42, session_fee: 0, currency: 'USD', timezone: 'America/Los_Angeles', tou_periods: [] },
};

test('a rate for a saved place needs a confirm step that says past automatic charges are priced again', async ({ page }) => {
  const { charge } = await open(page, 'dark', 390, true, [SAVED_PLACE]);
  const box = page.getByRole('region', { name: 'Add the cost of this charge' });
  await box.getByLabel('Total paid (USD)').fill('14,30');
  await expect(box.getByText('= 50¢ per kWh for 28.6 kWh')).toBeVisible();
  await box.getByRole('checkbox', { name: /Use this rate at Bellevue SC/ }).check();
  await box.getByRole('button', { name: 'Save cost' }).click();
  const confirm = box.getByRole('group', { name: 'Confirm the place rate' });
  await expect(confirm).toContainText('This sets Bellevue SC to 50¢/kWh. Past automatic charges at Bellevue SC are priced again with this rate.');
  if (EVIDENCE_DIR) await box.screenshot({ path: `${EVIDENCE_DIR}/charge-cost-confirm-390-dark.png` });
  expect(charge.patches).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await confirm.getByRole('button', { name: 'Save and change Bellevue SC' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Cost saved. Bellevue SC now uses 50¢ per kWh. Past automatic charges there are priced again.' })).toBeVisible();
  expect(charge.patches).toEqual([{ cost_mode: 'manual', cost_usd: 14.3 }]);
  expect(charge.placeWrites).toHaveLength(1);
  expect(charge.placeWrites[0]).toMatchObject({ method: 'PUT', body: { name: 'Bellevue SC', charging: { billing_type: 'per_kwh', rate: 0.5 } } });
});

test('the Home place price is not offered in the cost box', async ({ page }) => {
  const { charge } = await open(page, 'light', 390, true, [{ ...SAVED_PLACE, id: 'place-home', name: 'Home', is_home: true }]);
  const box = page.getByRole('region', { name: 'Add the cost of this charge' });
  await box.getByLabel('Total paid (USD)').fill('14.30');
  await expect(box.getByText('Change the Home price in Settings → Places.')).toBeVisible();
  await expect(box.getByRole('checkbox')).toHaveCount(0);
  await box.getByRole('button', { name: 'Save cost' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Cost saved.' })).toBeVisible();
  expect(charge.placeWrites).toEqual([]);
});
