import { expect, test } from '@playwright/test';
import { installRFixture } from './r-experience.fixture';

for (const mode of ['add', 'refresh'] as const) {
  for (const inputMode of ['typed', 'browser-filled-email', 'browser-filled-password'] as const) {
    test(`${mode} Rivian connection submits visible ${inputMode} credentials`, async ({ page }) => {
      await installRFixture(page);
      const credentials = { email: 'driver@example.test', password: ' current-rivian-password &+ ' };
      let submitted: unknown;
      await page.route('**/v1/vehicles/connect', async route => {
        submitted = route.request().postDataJSON();
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ requires_otp: true, challenge_id: 'challenge-fixture', vehicles: [] }),
        });
      });
      const search = mode === 'refresh' ? '?mode=refresh&vehicle_id=owner-vehicle' : '';
      await page.goto(`/connect${search}`);
      const email = page.getByLabel('Rivian email');
      // The first load can wait for the dev server to compile the page.
      await expect(email).toBeVisible({ timeout: 20_000 });
      const password = page.getByLabel('Rivian password');
      if (inputMode === 'typed') {
        await email.fill(credentials.email);
        await password.fill(credentials.password);
      } else {
        await email.fill('previous@example.test');
        await password.fill('previous-fixture-password');
        if (inputMode === 'browser-filled-password') await email.focus();
        await page.evaluate(values => {
          const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
          setValue.call(document.querySelector('input[type="email"]'), values.email);
          setValue.call(document.querySelector('input[type="password"]'), values.password);
        }, credentials);
      }
      await expect(email).toHaveValue(credentials.email);
      await expect(password).toHaveValue(credentials.password);
      await page.getByRole('button', { name: 'Send code', exact: true }).click();
      await expect.poll(() => submitted).toEqual(credentials);
      await expect(page).toHaveURL(/\/connect\/otp\?/);
      const url = new URL(page.url());
      expect(url.searchParams.get('email')).toBe(credentials.email);
      expect(url.searchParams.get('challenge_id')).toBe('challenge-fixture');
      expect(url.searchParams.get('mode')).toBe(mode === 'refresh' ? 'refresh' : null);
      if (mode === 'refresh') {
        expect(url.searchParams.get('vehicle_id')).toBe('owner-vehicle');
      }
    });
  }
}

for (const inputMode of ['typed', 'browser-filled'] as const) {
  test(`Rivian verification submits the visible ${inputMode} code and can retry`, async ({ page }) => {
    await installRFixture(page);
    const submissions: unknown[] = [];
    await page.route('**/v1/vehicles/connect/otp', async route => {
      submissions.push(route.request().postDataJSON());
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'RIVIAN_OTP_REJECTED', message: 'Fixture rejection' } }),
      });
    });
    await page.goto('/connect/otp?challenge_id=challenge-fixture&email=driver%40example.test');
    const code = page.getByLabel('Verification code');
    await expect(code).toBeVisible({ timeout: 20_000 });
    await code.fill('111111');
    if (inputMode === 'typed') {
      await code.fill('654321');
    } else {
      await code.blur();
      await code.evaluate(element => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, '654321');
      });
    }
    await expect(code).toHaveValue('654321');
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await expect.poll(() => submissions).toEqual([{ challenge_id: 'challenge-fixture', otp_code: '654321' }]);
    await expect(page.getByText('Rivian did not accept that verification code. Check it and try again.').first()).toBeVisible();
    await code.fill('234567');
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await expect.poll(() => submissions.at(-1)).toEqual({ challenge_id: 'challenge-fixture', otp_code: '234567' });
  });
}

for (const width of [390, 1280]) for (const mode of ['dark', 'light'] as const) {
  test(`first run walks from welcome to the car and rates at ${width}px in ${mode}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installRFixture(page, { mode });
    let added = false;
    await page.route(/\/v1\/vehicles(\?|$)/, route => route.request().method() === 'POST'
      ? (added = true, route.fulfill({ json: { vehicle_id: 'owner-vehicle', telemetry_status: 'connected' } }))
      : route.fulfill({ json: { vehicles: [] } }));
    await page.route('**/v1/vehicles/connect', route => route.fulfill({ json: {
      status: 'connected', requires_otp: false, challenge_id: null, vehicle_id: null,
      vehicles: [{ id: 'fixture-r2', name: 'Bumble Beee', vin: null, model: 'R2', model_year: 2026 }],
    } }));
    await page.goto('/connect');
    await expect(page.getByRole('heading', { name: 'Your Rivian, understood.' })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.r-rail')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('first-run-welcome.png') });
    await page.getByRole('button', { name: 'Get started' }).click();
    await expect(page.getByRole('heading', { name: 'Connect your Rivian account' })).toBeVisible();
    await page.getByLabel('Rivian email').fill('driver@example.test');
    await page.getByLabel('Rivian password').fill('fixture-password');
    await page.getByRole('button', { name: 'Send code', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Is this your car?' })).toBeVisible();
    await expect(page.getByText('Bumble Beee')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('first-run-car.png') });
    await page.getByRole('button', { name: "Yes, that's my car" }).click();
    await expect(page.getByRole('heading', { name: 'What do you pay to charge?' })).toBeVisible();
    expect(added).toBe(true);
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page.getByRole('heading', { name: "You're all set" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('first-run-done.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
