import { expect, test } from '@playwright/test';
import { installRFixture } from './r-experience.fixture';

const row = (page: import('@playwright/test').Page, label: string) =>
  page.locator('.r-car-hrow', { has: page.getByText(label, { exact: true }) });

for (const width of [390, 1280]) {
  test(`the Car tab shows the car, health and data health at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = await installRFixture(page, { mode: 'dark' });
    await page.goto('/vehicle-health');
    await expect(page.getByRole('heading', { level: 1, name: 'Car' })).toBeVisible();
    await expect(page.getByText('R2 Performance · Catalina Cove · 21" Tungsten wheels')).toBeVisible();
    await expect(page.getByRole('slider', { name: /Turn the car/ })).toBeVisible();
    for (const name of ['Tires', 'Closures', 'Vehicle health', 'Data health', 'Software history']) {
      await expect(page.getByRole('heading', { level: 2, name, exact: true })).toBeVisible();
    }
    await expect(page.locator('.r-car-spec')).toContainText('12,486 mi');
    await expect(page.locator('.r-car-spec')).toContainText('80%');
    await expect(row(page, 'Brake fluid')).toContainText('Not reported');
    await expect(row(page, 'Software')).toContainText('Up to date');
    await expect(row(page, 'Missed charges')).toContainText('None found');
    await expect(row(page, 'Missed charges')).toContainText('69 parked periods checked');
    await expect(page.getByRole('img', { name: /Data samples per day for the last 30 days/ })).toBeVisible();
    await expect(page.getByText(/Parallax/)).toHaveCount(0);

    await page.getByRole('button', { name: 'Recover missed charges' }).click();
    await expect(page.getByRole('button', { name: 'Recovering…' })).toBeDisabled();
    await expect(page.getByText('Recovering missed charges from Rivian…')).toBeVisible();
    // The status poll sees the finished recovery.
    await expect(page.getByText(/^Last recovery/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Recover missed charges' })).toBeEnabled();
    expect(fixture.writes).toContain('POST /v1/vehicles/owner-vehicle/backfill');
    await expect(page.getByRole('link', { name: 'Reconnect Rivian' })).toHaveAttribute('href', '/settings');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}

test('the Car tab never says None found when the missed-charge check fails', async ({ page }) => {
  await installRFixture(page, { chargeGaps: 'error' });
  await page.goto('/vehicle-health');
  await expect(row(page, 'Missed charges')).toContainText('Not checked');
  await expect(row(page, 'Missed charges')).not.toContainText('None found');
});

test('the Car tab counts possible missed charges and keeps the live-stream notice', async ({ page }) => {
  await installRFixture(page, { chargeGaps: 2, parallaxQuiet: true });
  await page.goto('/vehicle-health');
  await expect(row(page, 'Missed charges')).toContainText('2 possible');
  await expect(page.locator('.r-health-notice')).toContainText('Rivian’s live stream sent no data after');
});
