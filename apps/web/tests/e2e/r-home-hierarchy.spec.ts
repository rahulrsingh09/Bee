import { expect, test, type Page } from '@playwright/test';
import { installRFixture } from './r-experience.fixture';

/** Now-page reads that the shared fixture does not answer. Times are relative to the test run. */
async function installNowData(page: Page, options: { ownerArtwork?: boolean } = {}) {
  const now = Date.now();
  const hoursAgo = (hours: number) => new Date(now - hours * 3_600_000).toISOString();
  const trips = [
    { id: 'trip-1', started_at: hoursAgo(1.2), ended_at: hoursAgo(0.6), distance_mi: 18.4, duration_min: 34, energy_used_kwh: 5.9, efficiency_wh_mi: 320, start_place: 'Office', end_place: 'Home' },
    { id: 'trip-2', started_at: hoursAgo(26), ended_at: hoursAgo(25.5), distance_mi: 31, duration_min: 30, energy_used_kwh: 9.9, efficiency_wh_mi: 320, start_place: 'Home', end_place: 'Office' },
    { id: 'trip-3', started_at: hoursAgo(74), ended_at: hoursAgo(73), distance_mi: 42, duration_min: 60, energy_used_kwh: 13.4, efficiency_wh_mi: 320, start_place: 'Home', end_place: 'Lake' },
  ].map(trip => ({ ...trip, vehicle_id: 'owner-vehicle', max_speed_mph: 50, drive_mode: 'all_purpose', soc_start: 75, soc_end: 68, tags: [] }));
  const charges = [{
    id: 'charge-1', vehicle_id: 'owner-vehicle', location_name: 'Home', started_at: hoursAgo(14), ended_at: hoursAgo(10),
    energy_added_kwh: 20, duration_min: 240, cost_usd: 2.4, charger_type: 'ac', soc_start: 27, soc_end: 49, peak_power_kw: 11,
  }];
  await page.route(/\/v1\/trips(\?|$)/, route => route.fulfill({ json: { items: trips, total: trips.length, page: 1, per_page: 200 } }));
  await page.route(/\/v1\/charging(\?|$)/, route => route.fulfill({ json: { items: charges, total: 1, page: 1, per_page: 200 } }));
  await page.route(/\/v1\/trips\/trip-1\/track(\?|$)/, route => route.fulfill({ json: Array.from({ length: 24 }, (_, index) => ({
    ts: hoursAgo(1.2 - index / 40), lat: 47.6 + index * .0012 + Math.sin(index / 3) * .001, lng: -122.34 + index * .0018, speed_mph: 30, altitude_m: 20,
  })) }));
  await page.route(/\/v1\/vehicles\/[^/]+\/insights(\?|$)/, route => route.fulfill({ json: { insights: [
    { id: 'days_of_range:now', kind: 'days_of_range', severity: 'info', values: { range_mi: 218, median_daily_mi: 70, days: 3.1, days_with_data: 21 }, baseline: null, sample_size: 21, evidence: [] },
    { id: 'high_parked_loss:now', kind: 'high_parked_loss', severity: 'attention', values: { loss_pct: 4, usual_loss_pct: 1.3, ratio: 3.1, duration_hours: 8.6, started_at: hoursAgo(10), ended_at: hoursAgo(1.4) }, baseline: null, sample_size: 9, evidence: [] },
  ] } }));
  await page.route(/\/v1\/vehicles\/[^/]+\/charging-schedule$/, route => route.fulfill({ json: {
    id: 's1', enabled: true, start_time_minutes: 23 * 60, duration_minutes: 360, amperage: 48, location_lat: null, location_lng: null,
    week_days: null, rivian_updated_at: null, updated_at: hoursAgo(48),
  } }));
  await page.route(/\/v1\/vehicles\/[^/]+\/idle-drain(\?|$)/, route => route.fulfill({ json: { vehicle_id: 'owner-vehicle', periods: [{
    period_start: hoursAgo(10), period_end: hoursAgo(1.4), duration_hours: 8.6, sleep_share_pct: 90, state_coverage_pct: 100,
    soc_start: 72, soc_end: 68, soc_lost_pct: 4, drain_pct_per_hour: .47, range_start_mi: 230, range_end_mi: 218, range_lost_mi: 12,
    range_lost_per_hour_mi: 1.4, energy_drained_kwh: 3.5, avg_power_w: 400, has_reduced_range: false, validation_status: 'validated',
    validation_reason: null, sample_count: 40, start_sample_at: null, end_sample_at: null, movement_detected: false,
  }] } }));
  if (options.ownerArtwork) await page.route(/\/v1\/vehicles(\?|$)/, route => route.fulfill({ json: { vehicles: [{
    id: 'owner-vehicle', user_id: '33333333-3333-4333-8333-333333333333', rivian_vehicle_id: 'fixture-r2', vin: null,
    model: 'R2', year: null, trim: 'Performance', color: 'Catalina Cove', wheel_option: null, interior_color: null,
    battery_capacity_kwh: 88, is_demo: false, display_name: 'Your Rivian', created_at: '2026-01-01T00:00:00Z', membership_role: 'owner',
    images: OWNER_IMAGES,
  }] } }));
  if (options.ownerArtwork) await page.route(/\/v1\/vehicle-image-cache\//, route => route.fulfill({ contentType: 'image/png', body: OWNER_PNG }));
}

/** A small PNG for every owner image (data URL decoded). The protected image cache serves it. */
const OWNER_PNG = Buffer.from('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='.split(',')[1]!, 'base64');
const ownerImage = (placement: string, design: string) => ({ placement, design, size: 'large', resolution: null,
  url: `/v1/vehicle-image-cache/owner-vehicle/${placement}-${design}.png`, metadata: { source: 'vehicle:photo' } });
/** The owner's Rivian images with several placements, in API order (not turning order). */
const OWNER_IMAGES = {
  all: ['overhead', 'side-charging', 'rear', 'side', 'front', 'front-three-quarter'].flatMap(placement => ['light', 'dark'].map(design => ownerImage(placement, design))),
  side: { light: ownerImage('side', 'light').url, dark: ownerImage('side', 'dark').url },
};

/** Boxes of every visible text, chip and dock element that overlap the visible car image. */
async function carOverlaps(page: Page) {
  return page.evaluate(() => {
    const area = document.querySelector('.now-car')!.getBoundingClientRect();
    const clip = (rect: DOMRect) => ({
      left: Math.max(rect.left, area.left), right: Math.min(rect.right, area.right),
      top: Math.max(rect.top, area.top), bottom: Math.min(rect.bottom, area.bottom),
    });
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0;
    };
    const cars = [...document.querySelectorAll('.now-car canvas, .now-car img')].filter(visible)
      .map(element => clip(element.getBoundingClientRect())).filter(box => box.right > box.left && box.bottom > box.top);
    const textual = [...document.querySelectorAll('body *')].filter(element => !element.closest('.now-car')
      && [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent!.trim()));
    // The part of an element that is painted: its box cut by every ancestor that clips overflow.
    const painted = (element: Element) => {
      const rect = element.getBoundingClientRect();
      let box = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (style.position === 'fixed') break;
        if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
        const clipRect = parent.getBoundingClientRect();
        box = { left: Math.max(box.left, clipRect.left), right: Math.min(box.right, clipRect.right),
          top: Math.max(box.top, clipRect.top), bottom: Math.min(box.bottom, clipRect.bottom) };
      }
      return box;
    };
    const others = [...new Set([...document.querySelectorAll('.now-chip, .r-navigation'), ...textual])].filter(visible)
      .map(element => ({ element, rect: painted(element) }))
      .filter(({ rect }) => rect.right - rect.left > 1 && rect.bottom - rect.top > 1);
    const hits: string[] = [];
    for (const car of cars) for (const { element, rect } of others) {
      if (rect.left < car.right && rect.right > car.left && rect.top < car.bottom && rect.bottom > car.top) {
        hits.push(`${element.tagName.toLowerCase()}.${element.className}: ${element.textContent?.trim().slice(0, 40)}`);
      }
    }
    return { cars: cars.length, hits };
  });
}

for (const width of [320, 390, 901, 1280, 1920]) for (const mode of ['dark', 'light'] as const) {
  test(`Now shows header, car, battery, tiles, Latest, This week and Last 30 days in order at ${width}px in ${mode}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const fixture = await installRFixture(page, { mode });
    await installNowData(page);
    await page.goto('/');
    // A longer first wait: other work in the same checkout can make the dev server reload once.
    await expect(page.getByRole('heading', { level: 1, name: 'Your Rivian' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.now-chip')).toHaveText('Parked · Home · Locked');
    await expect(page.locator('.now-sub-text')).toHaveText(/^Updated \d{1,2}:\d{2}\s(AM|PM)$/);
    await expect(page.getByRole('img', { name: 'Battery 68 percent, charge limit 80 percent' })).toBeVisible();
    await expect(page.getByText('Limit 80%')).toBeVisible();
    await expect(page.getByRole('link', { name: /Doors/ })).toContainText('Locked');
    await expect(page.getByRole('link', { name: /Tires/ })).toContainText('44–45 psi');
    await expect(page.getByRole('link', { name: /Cabin/ })).toContainText('20°C');
    await expect(page.getByRole('link', { name: /Office → Home/ })).toHaveAttribute('href', '/trips/trip-1');
    await expect(page.locator('.now-lrow .now-route path')).toHaveAttribute('d', /^M[\d.]+,[\d.]+(L[\d.]+,[\d.]+)+$/);
    await expect(page.getByRole('link', { name: /\+20\.0 kWh/ })).toHaveAttribute('href', '/charging/charge-1');
    await expect(page.getByRole('region', { name: 'This week' })).toContainText('Trip');
    await expect(page.getByRole('link', { name: /Charging cost/ })).toHaveAttribute('href', '/insights?tab=cost');
    await expect(page.getByRole('link', { name: /^Efficiency/ })).toHaveAttribute('href', '/insights?tab=efficiency');
    await expect(page.getByRole('link', { name: /Loss while parked/ })).toHaveAttribute('href', '/insights?tab=battery');
    expect(await page.getByRole('heading', { level: 2 }).allTextContents()).toEqual(['Latest', 'This week', 'Last 30 days']);

    const box = async (selector: string) => (await page.locator(selector).first().boundingBox())!;
    const [header, stage, battery, tiles, latest, week, month] = await Promise.all(
      ['.now-top', '.now-stage', '.now-batt', '.now-tiles', '.now-latest', '.now-sum', '.now-more3'].map(box));
    expect(stage.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
    expect(battery.y).toBeGreaterThanOrEqual(stage.y + stage.height);
    expect(tiles.y).toBeGreaterThanOrEqual(battery.y + battery.height);
    if (width < 960) {
      expect(latest.y).toBeGreaterThan(tiles.y + tiles.height);
    } else {
      // Two columns: the right column starts level with the car stage; the 30-day row spans both.
      const latestTitle = await box('.now-side > .now-h2');
      expect(latest.x).toBeGreaterThan(stage.x + stage.width);
      expect(Math.abs(latestTitle.y - stage.y)).toBeLessThanOrEqual(2);
      expect(month.width).toBeGreaterThan(stage.width + latest.width);
    }
    expect(week.y).toBeGreaterThan(latest.y + latest.height);
    expect(month.y).toBeGreaterThan(Math.max(tiles.y + tiles.height, week.y + week.height));

    const overlap = await carOverlaps(page);
    expect(overlap.cars).toBeGreaterThan(0);
    expect(overlap.hits).toEqual([]);
    const small = await page.locator('.now').evaluate(root => [...root.querySelectorAll('a, button, [role="slider"], [role="combobox"]')]
      .map(element => ({ name: element.textContent?.trim().slice(0, 30) || element.getAttribute('aria-label'), ...element.getBoundingClientRect().toJSON() }))
      .filter(target => target.height < 44 || target.width < 44));
    expect(small).toEqual([]);
    await expect(page.getByText(/Drag to turn|Preview|Trial/i)).toHaveCount(0);
    await expect(page.locator('[data-dashboard-grid], [data-chart-id], [data-testid="sensor-chip"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('now-full.png'), fullPage: true });
    expect(fixture.unsupportedRequests).toEqual([]);
    expect(fixture.writes).toEqual([]);
  });
}

test('the battery counts up and fills on view, and shows final values at once with reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await installRFixture(page, { mode: 'dark' });
  await installNowData(page);
  await page.goto('/');
  await expect(page.locator('.now-bar-fill[data-animate]')).toHaveCount(1);
  await expect.poll(() => page.locator('.now-bar-fill').evaluate(element => getComputedStyle(element).transitionProperty)).toBe('width');
  await expect(page.locator('.now-batt .now-big')).toHaveText('68%');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.locator('.now-batt .now-big')).toHaveText('68%');
  await expect(page.locator('[data-animate]')).toHaveCount(0);
});

test('without owner images the bundled turn glides 20 degrees on first view and turns by drag, trackpad and keys', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installRFixture(page, { mode: 'dark' });
  await installNowData(page);
  await page.goto('/');
  const spin = page.getByRole('slider', { name: 'Turn the car. Drag it, or use the left and right arrow keys.' });
  await expect(spin).toBeVisible();
  // The glide starts 20 degrees before the rest view (frame 56, 280 degrees) and settles on it.
  await expect(spin).toHaveAttribute('aria-valuenow', '280', { timeout: 5_000 });
  await expect(page.locator('.now-car canvas')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Front|Side|Replay|Reset/ })).toHaveCount(0);
  await expect(page.locator('.r-orbit-controls')).toHaveCount(0);
  const area = (await spin.boundingBox())!;
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width / 2 - 120, area.y + area.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Number(await spin.getAttribute('aria-valuenow'))).not.toBe(280);
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  const before = Number(await spin.getAttribute('aria-valuenow'));
  await page.mouse.wheel(140, 0);
  await expect.poll(async () => Number(await spin.getAttribute('aria-valuenow'))).not.toBe(before);
  await spin.focus();
  await page.keyboard.press('End');
  await expect(spin).toHaveAttribute('aria-valuenow', '280');
  await page.keyboard.press('Home');
  await expect(spin).toHaveAttribute('aria-valuenow', '325');
  await page.keyboard.press('ArrowLeft');
  await expect(spin).toHaveAttribute('aria-valuenow', '315');
  const overlap = await carOverlaps(page);
  expect(overlap.hits).toEqual([]);
});

test('with reduced motion the bundled turn rests on its view with no glide', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installRFixture(page, { mode: 'light' });
  await installNowData(page);
  await page.goto('/');
  const spin = page.getByRole('slider', { name: 'Turn the car. Drag it, or use the left and right arrow keys.' });
  await expect(spin).toHaveAttribute('aria-valuenow', '280');
  await page.waitForTimeout(600);
  await expect(spin).toHaveAttribute('aria-valuenow', '280');
  await spin.press('ArrowRight');
  await expect(spin).toHaveAttribute('aria-valuenow', '290');
});

test('the owner images from the server turn with a cross-fade instead of the bundled frames', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installRFixture(page, { mode: 'dark' });
  await installNowData(page, { ownerArtwork: true });
  await page.goto('/');
  const car = page.locator('.now-car');
  const spin = car.getByRole('slider');
  await expect(spin).toHaveAttribute('aria-valuetext', 'Side');
  await expect(car.locator('img.r-orbit-angle')).toHaveCount(4);
  await expect(car.locator('img.r-orbit-angle[data-active]')).toHaveAttribute('src', /^blob:/);
  const area = (await spin.boundingBox())!;
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width / 2 + 110, area.y + area.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(spin).toHaveAttribute('aria-valuetext', 'Rear');
  await spin.press('Home');
  await expect(spin).toHaveAttribute('aria-valuetext', 'Side');
  await expect(page.locator('.now-car canvas, .r-orbit-poster')).toHaveCount(0);
});

test('a charging car shows the live charge from real readings', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const fixture = await installRFixture(page, { mode: 'dark', statusOverrides: { power_state: 'charging', charger_state: 'charging', charger_status: 'chrgr_sts_connected_charging' } });
  await installNowData(page);
  const started = new Date(Date.now() - 20 * 60_000).toISOString();
  await page.route(/\/v1\/charging(\?|$)/, route => route.fulfill({ json: { items: [{
    id: 'live-1', vehicle_id: 'owner-vehicle', location_name: 'Ridgefield', started_at: started, ended_at: null, charger_type: 'dc',
    energy_added_kwh: null, duration_min: null, soc_start: 22, soc_end: null, peak_power_kw: 190, cost_usd: null,
  }], total: 1, page: 1, per_page: 1 } }));
  await page.route(/\/v1\/vehicles\/[^/]+\/live-session$/, route => route.fulfill({ json: {
    soc_pct: 36, power_kw: 187.4, energy_kwh: 7.3, range_added_km: 33.8, time_remaining_min: 13, charger_type: 'DCFC', ts: new Date().toISOString(), started_at: started,
  } }));
  await page.route(/\/v1\/charging\/sessions\/live-1\/curve(\?|$)/, route => route.fulfill({ json: [
    { soc_pct: 22, power_kw: 120, minutes_elapsed: 0 }, { soc_pct: 30, power_kw: 182, minutes_elapsed: 6 }, { soc_pct: 36, power_kw: 187, minutes_elapsed: 12 },
  ] }));
  await page.goto('/');
  await expect(page.locator('.now-chip')).toHaveText('Charging · DC fast', { timeout: 15_000 });
  const card = page.getByRole('region', { name: 'Charging now' });
  await expect(card).toContainText('36%');
  await expect(card).toContainText('187 kW');
  await expect(card).toContainText('+7.3 kWh');
  await expect(card).toContainText('13 min');
  await expect(card).toContainText('+21 mi');
  await expect(card.locator('.now-bar[data-charging] .now-bar-fill')).toHaveCount(1);
  await expect(page.getByRole('img', { name: 'Power by battery level so far' })).toBeVisible();
  await expect(page.getByText(/Trial|Preview/)).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('now-charging.png'), fullPage: true });
  expect(fixture.unsupportedRequests).toEqual([]);
});

test('a driving car shows the live map, the trip so far, battery and range', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const fixture = await installRFixture(page, { mode: 'light', odometer: 12507.5, statusOverrides: {
    power_state: 'drive', gear_status: 'drive', speed_mph: 52, latitude: 47.62, longitude: -122.33, battery_level: 74, range_miles: 245,
  } });
  await installNowData(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.now-chip'), errors.join('\n')).toHaveText('Driving · 52 mph', { timeout: 15_000 });
  const card = page.getByRole('region', { name: 'This trip', exact: true });
  await expect(card).toContainText('74%');
  await expect(card).toContainText('245 mi');
  await expect(page.locator('.now-live-map')).toBeVisible();
  await expect.poll(fixture.liveConnections).toBe(1);
  fixture.publishStatus({ latitude: 47.63, longitude: -122.32, speed_mph: 40, battery_level: 73 });
  await expect(page.locator('.now-chip')).toHaveText('Driving · 40 mph');
  await expect(card).toContainText('73%');
  await page.screenshot({ path: testInfo.outputPath('now-driving.png'), fullPage: true });
  expect(fixture.unsupportedRequests).toEqual([]);
});

test('a new car with no trips or charges shows Day one with the setup checklist', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installRFixture(page, { mode: 'dark' });
  await page.route(/\/v1\/trips(\?|$)/, route => route.fulfill({ json: { items: [], total: 0, page: 1, per_page: 1 } }));
  await page.route(/\/v1\/charging(\?|$)/, route => route.fulfill({ json: { items: [], total: 0, page: 1, per_page: 1 } }));
  await page.goto('/');
  await expect(page.getByText('Your first drive shows up here')).toBeVisible();
  const checklist = page.getByRole('region', { name: 'Getting set up' });
  await expect(checklist).toContainText('Car found: Your Rivian');
  await expect(checklist.getByRole('link', { name: 'Check your Home and Office rates' })).toHaveAttribute('href', '/settings');
  await expect(page.getByRole('heading', { name: 'Last 30 days' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('now-day-one.png'), fullPage: true });
});

test('Now shows the loading skeleton until the first reads arrive', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await installRFixture(page, { mode: 'dark' });
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\/v1\/trips(\?|$)/, async route => { await gate; await route.fallback(); });
  await page.goto('/');
  await expect(page.getByLabel('Loading', { exact: true })).toHaveAttribute('aria-busy', 'true');
  release();
  await expect(page.getByRole('heading', { name: 'Latest' })).toBeVisible();
});

test('the old Overview dashboard URL opens Insights, since R has no custom dashboards', async ({ page }) => {
  await installRFixture(page, { populatedAdmin: true });
  await page.goto('/d/dashboard');
  // "/insights" opens its Cost tab.
  await expect(page).toHaveURL(/\/insights\/cost$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Insights' })).toBeVisible();
});

test('a car that is on in park shows the parked view, not Driving', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Prod shape: the power state stays "go" while the gear is in park.
  await installRFixture(page, { mode: 'dark', statusOverrides: { power_state: 'go', gear_status: 'park', speed_mph: 0 } });
  await installNowData(page);
  await page.goto('/');
  await expect(page.locator('.now-chip')).toHaveText('Parked · Home · Locked', { timeout: 15_000 });
  await expect(page.getByRole('region', { name: 'This trip', exact: true })).toHaveCount(0);
  await expect(page.locator('.now-live-map')).toHaveCount(0);
  await expect(page.locator('.now-batt')).toContainText('68%');
  expect(await page.getByRole('heading', { level: 2 }).allTextContents()).toEqual(['Latest', 'This week', 'Last 30 days']);
});

test('Now never shows the Demo R1S next to the real car', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await installRFixture(page, { mode: 'dark', demoVehicle: true });
  await installNowData(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Your Rivian' })).toBeVisible({ timeout: 15_000 });
  // One real vehicle: no picker, and nothing names the demo vehicle.
  await expect(page.getByRole('combobox', { name: 'Select vehicle' }).or(page.getByRole('button', { name: 'Select vehicle' }))).toHaveCount(0);
  await expect(page.getByText('Demo R1S')).toHaveCount(0);
});

test('the Last 30 days cards open their Insights tab', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installRFixture(page, { mode: 'dark' });
  await installNowData(page);
  await page.goto('/');
  for (const [name, tab] of [[/Charging cost/, 'cost'], [/^Efficiency/, 'efficiency'], [/Loss while parked/, 'battery']] as const) {
    await page.getByRole('link', { name }).click();
    await expect(page).toHaveURL(new RegExp(`/insights/${tab}$`), { timeout: 15_000 });
    await page.goBack();
    await expect(page.getByRole('heading', { level: 2, name: 'Last 30 days' })).toBeVisible();
  }
});

