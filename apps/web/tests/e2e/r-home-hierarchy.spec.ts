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
  test(`Now puts status, car, battery, odometer, needs-a-look and the story rail in order at ${width}px in ${mode}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const fixture = await installRFixture(page, { mode });
    await installNowData(page);
    await page.goto('/');
    // A longer first wait: other work in the same checkout can make the dev server reload once.
    await expect(page.getByRole('heading', { level: 1, name: 'Parked at Home' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Your Rivian · R2 Performance · Catalina Cove')).toBeVisible();
    const chips = page.getByRole('list', { name: 'Vehicle status' }).getByRole('listitem');
    await expect(chips).toHaveText(['Locked', 'Unplugged', 'Charges 11 PM']);
    await expect(page.getByText('Limit 80% · enough for about 3 days of your usual driving')).toBeVisible();
    await expect(page.getByText(/^This week: 91 mi · 3 drives · 3\.1 mi\/kWh · \$2\.40 energy cost$/)).toBeVisible();
    const attention = page.getByRole('region', { name: 'Needs a look' });
    await expect(attention.getByRole('link', { name: /Parked loss was high/ })).toHaveAttribute('href', '/battery/phantom-drain');
    const stories = page.getByRole('region', { name: 'Today' });
    await expect(stories.getByRole('link', { name: /Last drive/ })).toHaveAttribute('href', '/trips/trip-1');
    await expect(stories.locator('.now-route path')).toHaveAttribute('d', /^M[\d.]+,[\d.]+( L[\d.]+,[\d.]+)+$/);
    await expect(stories.getByRole('link', { name: /Last charge/ })).toHaveAttribute('href', '/charging/charge-1');
    await expect(stories.getByRole('link', { name: /Last park/ })).toContainText('3.1× your usual drain rate');
    expect(await page.getByRole('heading', { level: 2 }).allTextContents()).toEqual(['Odometer', 'Needs a look', 'Today']);

    const box = async (selector: string) => (await page.locator(selector).boundingBox())!;
    const [header, car, energy, odometer, look, rail] = await Promise.all(
      ['.now-header', '.now-car', '.now-energy', '.now-odometer', '.now-attention', '.now-stories'].map(box));
    const chipBoxes = await chips.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON() as DOMRect));
    expect(new Set(chipBoxes.map(chip => Math.round(chip.y))).size).toBe(1);
    expect(Math.max(...chipBoxes.map(chip => chip.bottom))).toBeLessThanOrEqual(car.y);
    expect(car.y).toBeGreaterThanOrEqual(header.y + header.height);
    expect(energy.y).toBeGreaterThanOrEqual(car.y + car.height);
    if (width < 1024) {
      expect(Math.round(car.height)).toBe(230);
      expect(odometer.y).toBeGreaterThan(energy.y + energy.height);
    } else {
      expect(odometer.x).toBeGreaterThan(car.x + car.width);
      expect(odometer.y).toBeLessThan(car.y);
    }
    expect(look.y).toBeGreaterThan(odometer.y + odometer.height);
    expect(rail.y).toBeGreaterThan(look.y + look.height);

    const overlap = await carOverlaps(page);
    expect(overlap.cars).toBeGreaterThan(0);
    expect(overlap.hits).toEqual([]);
    const small = await page.locator('.now').evaluate(root => [...root.querySelectorAll('a, button, [role="slider"], [role="combobox"]')]
      .map(element => ({ name: element.textContent?.trim().slice(0, 30) || element.getAttribute('aria-label'), ...element.getBoundingClientRect().toJSON() }))
      .filter(target => target.height < 44 || target.width < 44));
    expect(small).toEqual([]);
    await expect(page.getByText(/Drag to turn/i)).toHaveCount(0);
    await expect(page.locator('[data-dashboard-grid], [data-chart-id], [data-testid="sensor-chip"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /date range|Chart|Dashboard tools/i })).toHaveCount(0);
    await expect(page.getByPlaceholder(/Search charts/i)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('now-full.png'), fullPage: true });
    expect(fixture.unsupportedRequests).toEqual([]);
    expect(fixture.writes).toEqual([]);
  });
}

test('the data story runs on the first view of a session only, and never with reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await installRFixture(page, { mode: 'dark' });
  await installNowData(page);
  await page.goto('/');
  await expect(page.locator('.now-roll[data-animate]')).toHaveCount(1);
  await expect(page.locator('.now-week-bar > span[data-animate]')).toHaveCount(7);
  const roll = page.locator('.now-roll-column').first();
  await expect.poll(() => roll.evaluate(element => getComputedStyle(element).transitionProperty)).toBe('transform');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.now-odometer-value')).toContainText('12,486');
  await expect(page.locator('[data-animate]')).toHaveCount(0);
  await page.evaluate(() => sessionStorage.clear());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.locator('.now-odometer-value')).toContainText('12,486');
  await expect(page.locator('[data-animate], .now-viz-wipe')).toHaveCount(0);
});

test('the R2 turns through the owner images only: drag changes the angle and Home returns to the side', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const packs: string[] = [];
  page.on('request', request => {
    // Dev-server module imports (`?import`) are not frame or poster loads.
    const url = new URL(request.url());
    if (/\/r2-(orbit|hero)/.test(url.pathname) && !url.searchParams.has('import')) packs.push(request.url());
  });
  await installRFixture(page, { mode: 'dark' });
  await installNowData(page, { ownerArtwork: true });
  await page.goto('/');
  const car = page.locator('.now-car');
  await expect(car).toHaveAttribute('data-mode', 'turn');
  const spin = page.getByRole('slider', { name: 'Your R2, Catalina Cove. Use arrow keys to turn.' });
  await expect(spin).toHaveAttribute('aria-valuetext', 'Side');
  await expect(car.locator('img.r-orbit-angle')).toHaveCount(4);
  await expect(car.locator('img.r-orbit-angle[data-active]')).toHaveAttribute('data-angle', 'side');
  await expect(car.locator('img.r-orbit-angle[data-active]')).toHaveAttribute('src', /^blob:/);
  const area = (await spin.boundingBox())!;
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width / 2 + 110, area.y + area.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(spin).toHaveAttribute('aria-valuetext', 'Rear');
  await expect(car.locator('img.r-orbit-angle[data-active]')).toHaveAttribute('data-angle', 'rear');
  await spin.press('Home');
  await expect(spin).toHaveAttribute('aria-valuetext', 'Side');
  await spin.press('ArrowLeft');
  await expect(spin).toHaveAttribute('aria-valuetext', 'Front three-quarter');
  await spin.dblclick();
  await expect(spin).toHaveAttribute('aria-valuetext', 'Side');
  // No bundled R1S frames, poster or canvas for an R2.
  await expect(page.locator('.now-car canvas, .r-orbit-poster')).toHaveCount(0);
  expect(packs).toEqual([]);
  const overlap = await carOverlaps(page);
  expect(overlap.cars).toBe(1);
  expect(overlap.hits).toEqual([]);
});

test('the old Overview dashboard URL opens Insights, since R has no custom dashboards', async ({ page }) => {
  await installRFixture(page, { populatedAdmin: true });
  await page.goto('/d/dashboard');
  await expect(page).toHaveURL(/\/insights$/);
});
