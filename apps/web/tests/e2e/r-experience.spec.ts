import { expect, test, type Page, type Request } from '@playwright/test';
import { installRFixture } from './r-experience.fixture';


/** A request for the bundled orbit frames, masks or poster. Dev-server module imports (`?import`) are not image loads. */
function bundledOrbitAsset(request: Request) {
  const url = new URL(request.url());
  return /\/r2-(orbit|hero)/.test(url.pathname) && !url.searchParams.has('import');
}

/** A small PNG for every owner image (data URL decoded). The protected image cache serves it. */
const OWNER_PNG = Buffer.from('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='.split(',')[1]!, 'base64');

/** The fixture R2 with the owner's own Rivian images in several placements. */
async function installOwnerImages(page: Page) {
  const image = (placement: string, design: string) => ({ placement, design, size: 'large', resolution: null,
    url: `/v1/vehicle-image-cache/owner-vehicle/${placement}-${design}.png`, metadata: { source: 'vehicle:photo' } });
  await page.route(/\/v1\/vehicle-image-cache\//, route => route.fulfill({ contentType: 'image/png', body: OWNER_PNG }));
  await page.route(/\/v1\/vehicles(\?|$)/, route => route.fulfill({ json: { vehicles: [{
    id: 'owner-vehicle', user_id: '33333333-3333-4333-8333-333333333333', rivian_vehicle_id: 'fixture-r2', vin: null,
    model: 'R2', year: null, trim: 'Performance', color: 'Catalina Cove', wheel_option: '21" Liquid Tungsten All-Season',
    interior_color: 'Black Crater Signature', battery_capacity_kwh: 88, is_demo: false, display_name: 'Your Rivian',
    created_at: '2026-01-01T00:00:00Z', membership_role: 'owner',
    images: { all: ['overhead', 'rear', 'side', 'front', 'front-three-quarter'].flatMap(placement => ['light', 'dark'].map(design => image(placement, design))) },
  }] } }));
}

for (const width of [390, 1280]) {
  for (const mode of ['dark', 'light'] as const) {
    test(`R routes remain cohesive at ${width}px in ${mode}`, async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      const requests = new Set<Request>();
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => {
        if (/\/v[12]\//.test(request.url())) requests.add(request);
      });
      page.on('requestfinished', request => requests.delete(request));
      page.on('requestfailed', request => requests.delete(request));
      await installRFixture(page, { mode, role: 'super_user', populatedAdmin: true });
      const paths = [
        '/', '/trips', '/charging', '/efficiency', '/battery', '/battery/phantom-drain', '/vehicle-health',
        '/trips/trip-1', '/charging/charge-1', '/explore', '/settings', '/users',
        ...['account', 'sign-in', 'rivian', 'rates', 'backups', 'units'].map(section => `/settings?section=${section}`),
        '/d/dashboard', '/admin/dashboards',
      ];
      for (const path of paths) {
        await page.goto(path);
        await expect(page.locator('.r-app'), path).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('h1').first(), path).toBeVisible();
        await expect(page.locator('html')).toHaveClass(new RegExp(mode));
        const primary = page.getByRole('navigation', { name: 'Primary navigation' });
        await expect(primary.getByRole('link')).toHaveText(['Now', 'Activity', 'Insights', 'Car']);
        for (const name of ['Now', 'Activity', 'Insights', 'Car']) {
          await expect(primary.getByRole('link', { name, exact: true })).toBeVisible();
        }
        await expect(page.getByRole('link', { name: 'Explore', exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: /^Switch to (light|dark) mode$/ })).toHaveCount(1);
        await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), path).toBe(true);
        if (['/', '/settings', '/vehicle-health', '/charging'].includes(path)) {
          await page.screenshot({ path: testInfo.outputPath(`${path.replaceAll('/', '') || 'overview'}.png`), fullPage: true });
          // Restoring the viewport can activate deferred charts after capture.
          await page.evaluate(() => new Promise<void>(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        }
        await expect.poll(() => requests.size).toBe(0);
      }
      expect(errors).toEqual([]);
    });
  }
}

test('the R2 turns through the owner images, has no hint text or toy buttons, and works with reduced motion', async ({ page }) => {
  await installRFixture(page, { mode: 'dark' });
  await installOwnerImages(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const packs: string[] = [];
  page.on('request', request => { if (bundledOrbitAsset(request)) packs.push(request.url()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Your Rivian' })).toBeVisible();
  const orbit = page.getByRole('slider', { name: 'Turn the car. Drag it, or use the left and right arrow keys.' });
  await expect(orbit).toBeVisible();
  await expect(orbit).toHaveAttribute('aria-valuetext', 'Side');
  await expect(page.getByText(/Drag to turn|double-tap/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(Front|Reset vehicle view|Replay vehicle rotation)$/ })).toHaveCount(0);
  await orbit.focus();
  await page.keyboard.press('ArrowRight');
  await expect(orbit).toHaveAttribute('aria-valuetext', 'Rear');
  await page.keyboard.press('ArrowRight');
  await expect(orbit).toHaveAttribute('aria-valuetext', 'Front');
  await page.keyboard.press('Home');
  await expect(orbit).toHaveAttribute('aria-valuetext', 'Side');
  // Reduced motion: the new angle shows at once, with no fade.
  expect(await page.locator('.now-car img.r-orbit-angle').first().evaluate(element => parseFloat(getComputedStyle(element).transitionDuration))).toBe(0);
  const box = (await orbit.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 80, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(orbit).toHaveAttribute('aria-valuetext', 'Front three-quarter');
  await orbit.dblclick();
  await expect(orbit).toHaveAttribute('aria-valuetext', 'Side');
  await page.getByRole('link', { name: 'Insights', exact: true }).click();
  await page.getByRole('link', { name: 'Now', exact: true }).click();
  await expect(orbit).toHaveAttribute('aria-valuetext', 'Side');
  await expect(page.locator('canvas.r-orbit, .r-orbit canvas, .r-orbit-poster')).toHaveCount(0);
  expect(packs).toEqual([]);
});

test('the owner-image turn cross-fades in 180 ms without reduced motion', async ({ page }) => {
  await installRFixture(page, { mode: 'light' });
  await installOwnerImages(page);
  await page.goto('/');
  const layer = page.locator('.now-car img.r-orbit-angle').first();
  await expect(layer).toHaveCount(1);
  expect(await layer.evaluate(element => getComputedStyle(element).transition)).toContain('opacity 0.18s');
});

test('changing vehicle clears old readings until the selected vehicle snapshot arrives', async ({ page }) => {
  await installRFixture(page, { secondVehicle: true, statusDelay: 1500 });
  await page.goto('/');
  await expect(page.locator('.now-batt')).toContainText('68%');
  await page.getByLabel('Select vehicle', { exact: true }).click();
  await page.getByRole('option', { name: /Other vehicle/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Other vehicle');
  await expect(page.locator('.now-batt')).not.toContainText('68%');
  await expect(page.locator('.now-batt')).toContainText('20%');
});

test('an R2 without owner images shows its packaged R2 artwork, never the bundled orbit frames', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installRFixture(page);
  const packs: string[] = [];
  page.on('request', request => { if (bundledOrbitAsset(request)) packs.push(request.url()); });
  await page.goto('/');
  await expect(page.getByRole('slider', { name: 'Turn the car. Drag it, or use the left and right arrow keys.' })).toBeVisible();
  await expect(page.locator('.now-car canvas')).toHaveCount(1);
  await expect.poll(() => packs.some(url => /r2-orbit/.test(url))).toBe(true);
  await expect(page.locator('.r-orbit-angle')).toHaveCount(0);
});

test('cached vehicle readings retain visible browser reconnection status', async ({ page }) => {
  await installRFixture(page);
  await page.routeWebSocket('**/v1/vehicles/live**', socket => socket.close());
  await page.goto('/');
  await expect(page.locator('.now-batt')).toContainText('68%');
  await expect(page.getByText('Reconnecting live updates · Showing last recorded readings.')).toBeVisible();
});

for (const width of [390, 1280]) {
  test(`missed drive is recovered from Trips through Vehicle health at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = await installRFixture(page, { mode: 'dark', tripGaps: true });
    await page.goto('/trips');
    await page.getByRole('link', { name: /1 possible missed drive/ }).click();
    await expect(page).toHaveURL(/\/vehicle-health$/);
    const card = page.getByRole('region', { name: 'Possible missed drive' });
    await expect(card).toContainText('42.9 mi');
    await card.getByRole('button', { name: 'Recover trip' }).click();
    expect(fixture.writes.filter((write) => write.includes('/trip-gaps/'))).toHaveLength(0);
    await card.getByRole('button', { name: 'Confirm recovery' }).click();
    await expect(card).toHaveCount(0);
    expect(fixture.writes).toContain('POST /v1/vehicles/owner-vehicle/trip-gaps/0123456789abcdef0123456789abcdef/recover');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
