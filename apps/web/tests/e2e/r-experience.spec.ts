import { expect, test, type Request } from '@playwright/test';
import { installRFixture } from './r-experience.fixture';

const orbitPackUrl = /\/r2-orbit(?:-[^/?]+)?\.bin(?:\?|$)/;

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
        ...['vehicles','dashboards','charts','units','places','charging','external','api','jobs','raw','backup','account','authentication'].map(section => `/settings?section=${section}`),
        '/d/dashboard', '/d/trips', '/admin/dashboards', '/connect', '/connect/otp?challenge_id=challenge-1',
      ];
      for (const path of paths) {
        await page.goto(path);
        await expect(page.locator('.r-app'), path).toBeVisible();
        await expect(page.locator('h1').first(), path).toBeVisible();
        await expect(page.locator('html')).toHaveClass(new RegExp(mode));
        const primary = page.getByRole('navigation', { name: 'Primary navigation' });
        await expect(primary.getByRole('link')).toHaveText(['Now', 'Activity', 'Insights', 'Car']);
        for (const name of ['Now', 'Activity', 'Insights', 'Car']) {
          await expect(primary.getByRole('link', { name, exact: true })).toBeVisible();
        }
        await expect(page.getByRole('link', { name: 'Explore', exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: /^Switch to (light|dark) mode$/ })).toHaveCount(0);
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

test('vehicle rotation loads once on interaction, has no hint text or toy buttons, and works with reduced motion', async ({ page }) => {
  await installRFixture(page, { mode: 'dark' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const packs: string[] = [];
  page.on('request', request => { if (request.resourceType() === 'fetch' && orbitPackUrl.test(request.url())) packs.push(request.url()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Parked at Home' })).toBeVisible();
  const orbit = page.getByRole('slider', { name: 'Your R2, Catalina Cove. Use arrow keys to turn.' });
  await expect(orbit).toBeVisible();
  await expect(page.getByText(/Drag to turn|double-tap/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(Front|Reset vehicle view|Replay vehicle rotation)$/ })).toHaveCount(0);
  expect(packs).toHaveLength(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await orbit.focus();
  await page.keyboard.press('Home');
  await expect(orbit).toHaveAttribute('aria-valuenow', '325');
  await expect(page.locator('.r-orbit canvas')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(orbit).toHaveAttribute('aria-valuenow', '335');
  const box = (await orbit.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(orbit).not.toHaveAttribute('aria-valuenow', '335');
  await orbit.dblclick();
  await expect(orbit).toHaveAttribute('aria-valuenow', '280');
  await page.getByRole('link', { name: 'Insights', exact: true }).click();
  await page.getByRole('link', { name: 'Now', exact: true }).click();
  await expect(page.locator('.r-orbit canvas')).toBeVisible();
  expect(packs).toHaveLength(1);
});

test('settings navigation, search, units and compatibility URLs have no interface chooser', async ({ page }) => {
  const fixture = await installRFixture(page, { role: 'super_user' });
  await page.goto('/settings');
  await page.getByLabel('Find a setting').fill('time');
  await expect(page.getByRole('button', { name: /Units & time/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^API Access/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Units & time/ }).click();
  await expect(page).toHaveURL(/section=units/);
  await expect(page.getByLabel('Application time zone')).toBeVisible();
  await page.getByRole('button', { name: 'All settings', exact: true }).click();
  await expect(page.getByLabel('Find a setting')).toBeVisible();
  await page.goto('/settings?section=appearance');
  await expect(page.getByLabel('Application time zone')).toBeVisible();
  await expect(page.getByText('Appearance mode', { exact: true })).toHaveCount(0);
  await page.goto('/settings/themes/old-theme');
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByLabel('Find a setting')).toBeVisible();
  await expect(page.getByRole('radio', { name: /Classic|RAD/ })).toHaveCount(0);
  expect(fixture.writes).toEqual([]);
});

test('changing vehicle clears old readings until the selected vehicle snapshot arrives', async ({ page }) => {
  await installRFixture(page, { secondVehicle: true, statusDelay: 1500 });
  await page.goto('/');
  await expect(page.locator('.now-energy')).toContainText('68%');
  await page.getByLabel('Select vehicle', { exact: true }).click();
  await page.getByRole('option', { name: /Other vehicle/ }).click();
  await expect(page.locator('.now-vehicle').first()).toContainText('Other vehicle');
  await expect(page.locator('.now-energy')).not.toContainText('68%');
  await expect(page.locator('.now-energy')).toContainText('20%');
  await expect(page.getByRole('slider')).toHaveCount(0);
});

for (const width of [390, 1280]) {
  test(`chart editor keeps its focused workflow in the R theme at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installRFixture(page, { role: 'super_user', populatedAdmin: true, mode: 'dark' });
    await page.goto('/settings/charts/new');
    await expect(page.locator('.r-editor')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'New chart', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Chart editor sections' })).toBeVisible();
    for (const section of ['curves', 'display', 'advanced', 'basics']) {
      await page.getByRole('button', { name: section, exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    await page.getByRole('button', { name: 'Back to charts' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /keep editing/i }).click();
    await expect(page.getByRole('heading', { name: 'New chart', exact: true })).toBeVisible();
  });
}

for (const width of [390, 1280]) {
  test(`main trip map supports tap, drag and keyboard inspection at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const mapErrors: string[] = [];
    page.on('console', message => { if (message.text().includes('maplibre.error')) mapErrors.push(message.text()); });
    await installRFixture(page, { populatedTrip: true });
    await page.goto('/trips/trip-1');
    const canvas = page.getByLabel('Inspect trip route. Tap or drag to select a point; arrow keys move along the route.');
    await expect(canvas).toBeVisible();
    const time = page.getByRole('slider', { name: 'Drive time' });
    await expect(time).toBeEnabled();
    await time.focus();
    await page.keyboard.press('End');
    await expect(time).toHaveValue('30');
    await page.keyboard.press('Home');
    await expect(time).toHaveValue('0');
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + box.width * .7, box.y + box.height * .3);
    await expect(time).not.toHaveValue('0');
    const selected = await time.inputValue();
    await page.mouse.move(box.x + box.width * .7, box.y + box.height * .3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .3, box.y + box.height * .7, { steps: 12 });
    await page.mouse.up();
    await expect(time).not.toHaveValue(selected);
    await page.getByRole('button', { name: 'Pan map', exact: true }).click();
    await expect(page.getByLabel('Pan trip map', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Inspect route', exact: true }).click();
    await expect(canvas).toBeVisible();
    expect(mapErrors).toEqual([]);
  });
}

test('failed rotation pauses until the owner turns the car again', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installRFixture(page);
  let failedLoads = 0;
  await page.route(orbitPackUrl, async route => {
    if (route.request().resourceType() !== 'fetch') return route.fallback();
    failedLoads++;
    return route.fulfill({ status: 503, body: 'Unavailable' });
  });
  await page.goto('/');
  const orbit = page.getByRole('slider', { name: /Use arrow keys to turn/ });
  await orbit.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.r-orbit [role="status"]')).toHaveText('Rotation unavailable. Drag or press an arrow key to try again.');
  await expect(orbit).toHaveAccessibleDescription('Rotation unavailable. Drag or press an arrow key to try again.');
  await expect(page.locator('.r-orbit-poster')).toBeVisible();
  await page.waitForTimeout(700);
  expect(failedLoads).toBe(1);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => failedLoads).toBe(2);
});

test('cached vehicle readings retain visible browser reconnection status', async ({ page }) => {
  await installRFixture(page);
  await page.routeWebSocket('**/v1/vehicles/live**', socket => socket.close());
  await page.goto('/');
  await expect(page.locator('.now-energy')).toContainText('68%');
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
