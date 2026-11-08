import { expect, test } from '@playwright/test';
import { installRFixture } from './r-experience.fixture';

for (const width of [390, 1280]) for (const mode of ['dark', 'light'] as const) {
  test(`Settings has only the five R cards at ${width}px in ${mode}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const fixture = await installRFixture(page, { mode, role: 'super_user', ratePlaces: true, activeSessions: 3 });
    await page.goto('/settings');
    // The first load can wait for the dev server to compile the page.
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible({ timeout: 20_000 });
    for (const name of ['Account', 'Sign-in methods', 'Rivian account', 'Charging rates']) {
      await expect(page.getByRole('heading', { level: 2, name, exact: true })).toBeVisible();
    }
    const backups = page.getByRole('region', { name: 'Backups' });
    await expect(backups).toBeVisible();
    await expect(backups.locator('details')).not.toHaveAttribute('open', '');
    for (const removed of ['Units & time', 'API Access', 'Places', 'Jobs', 'External connections', 'Custom dashboards', 'Find a setting']) {
      await expect(page.getByText(removed, { exact: true })).toHaveCount(0);
    }
    await expect(page.getByRole('region', { name: 'Account' }).getByText('Password', { exact: true })).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Password sign-in' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('switch', { name: 'Password sign-in' })).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByLabel('Home · $ per kWh')).toHaveValue('0.189119');
    await expect(page.getByLabel('Office · $ per kWh')).toHaveValue('0');
    for (const button of await page.locator('.r-set-grid :is(button, a):not(.r-switch)').filter({ visible: true }).all()) {
      const box = (await button.boundingBox())!;
      expect(box.height, await button.innerText()).toBeGreaterThanOrEqual(36);
    }
    // A switch is 52 × 32 px; its ::before adds 6 px on each side for a 44 px target.
    for (const toggle of await page.locator('.r-set-grid .r-switch').all()) {
      const target = await toggle.evaluate(element => {
        const before = getComputedStyle(element, '::before');
        return element.getBoundingClientRect().height - 2 * parseFloat(before.top);
      });
      expect(target).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('settings.png'), fullPage: true });
    expect(fixture.writes).toEqual([]);
  });
}

test('Settings saves Home and Office rates to the place cost profiles', async ({ page }) => {
  const fixture = await installRFixture(page, { role: 'super_user', ratePlaces: true });
  const bodies: unknown[] = [];
  page.on('request', request => { if (request.method() === 'PUT' && request.url().includes('/v1/places/')) bodies.push(request.postDataJSON()); });
  await page.goto('/settings');
  await page.getByLabel('Home · $ per kWh').fill('0.21');
  await page.getByRole('button', { name: 'Save rates' }).click();
  await expect(page.getByText('Rates saved. Charge costs update with them.')).toBeVisible();
  expect(fixture.writes).toEqual(['PUT /v1/places/place-home']);
  expect(bodies[0]).toMatchObject({ name: 'Home', is_home: true, charging: { billing_type: 'per_kwh', rate: 0.21 } });
  await page.reload();
  await expect(page.getByLabel('Home · $ per kWh')).toHaveValue('0.21');
});

test('Settings signs out the other devices and recovers missed charges', async ({ page }) => {
  const fixture = await installRFixture(page, { role: 'super_user', activeSessions: 3 });
  await page.route('**/v1/vehicles/owner-vehicle/backfill', route => route.fulfill({ json: { status: 'running' } }));
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Sign out other devices' }).click();
  await expect(page.getByText('Signed out 2 other devices.')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out other devices' }).click();
  await expect(page.getByText('No other device was signed in.')).toBeVisible();
  const rivian = page.getByRole('region', { name: 'Rivian account' });
  await expect(rivian.getByText('Connected', { exact: true })).toBeVisible();
  await expect(rivian.getByRole('link', { name: 'Reconnect' })).toHaveAttribute('href', '/connect?mode=refresh&vehicle_id=owner-vehicle');
  const backfill = page.waitForRequest(request => request.method() === 'POST' && request.url().endsWith('/v1/vehicles/owner-vehicle/backfill'));
  await rivian.getByRole('button', { name: 'Recover now' }).click();
  await backfill;
  expect(fixture.writes).toContain('POST /v1/auth/sessions/revoke-others');
});

test('old Settings section links still open Settings', async ({ page }) => {
  await installRFixture(page, { role: 'super_user' });
  for (const section of ['units', 'api', 'places', 'dashboards', 'authentication', 'vehicles', 'backup']) {
    await page.goto(`/settings?section=${section}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' }), section).toBeVisible();
  }
});
