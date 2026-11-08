import { expect, test } from '@playwright/test';
import { installActivityFixture } from './r-activity.fixture.ts';

test.describe('Activity on desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('the split view fixes the header, scrolls each column on its own and opens the newest item', async ({ page }) => {
    await installActivityFixture(page);
    await page.goto('/trips');
    await expect(page.getByRole('heading', { name: 'Activity', level: 1 })).toBeVisible();
    const split = page.locator('[data-activity-split]');
    await expect(split).toBeVisible();
    await expect(page.locator('[data-col="list"]').getByText('Office → Home')).toBeVisible();
    await expect(page.getByText('Short trip')).toBeVisible();
    await expect(page.getByText('Odometer moved 1.3 mi with no trip recorded')).toBeVisible();
    await expect(page.locator('[data-col="detail"] [data-detail-position]')).toHaveText('Trip · 1 of 4');
    await expect(page.locator('[data-col="detail"]').getByRole('heading', { name: 'Office → Home' })).toBeVisible();
    for (const column of ['list', 'detail']) {
      await expect(page.locator(`[data-col="${column}"]`)).toHaveCSS('overflow-y', 'auto');
      await expect(page.locator(`[data-col="${column}"]`)).toHaveCSS('overscroll-behavior-y', 'contain');
    }
    await page.mouse.move(640, 60);
    await page.mouse.wheel(0, 600);
    expect(await page.evaluate(() => { window.scrollTo(0, 400); return window.scrollY; })).toBe(0);
    const bottom = await page.locator('[data-activity-split]').evaluate((element) => element.getBoundingClientRect().bottom);
    expect(bottom).toBeLessThanOrEqual(800);
  });

  test('selecting a trip keeps the list scroll position', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await installActivityFixture(page);
    await page.goto('/trips');
    const list = page.locator('[data-col="list"]');
    await expect(list.getByText('DC fast · Ridgefield')).toBeVisible();
    await list.evaluate((element) => { element.scrollTop = 120; });
    const before = await list.evaluate((element) => element.scrollTop);
    await list.locator('[data-activity-item="trip"]').nth(1).click();
    await expect(page).toHaveURL(/\/trips\/trip-b$/);
    await expect(page.locator('[data-col="detail"] [data-detail-position]')).toHaveText('Trip · 2 of 4');
    await expect(page.locator('[data-col="list"] [aria-current]')).toContainText('Office');
    expect(await page.locator('[data-col="list"]').evaluate((element) => element.scrollTop)).toBe(before);
  });
});

test.describe('Activity on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a trip tap opens the full detail page with replay controls, then Back returns to the list', async ({ page }) => {
    await installActivityFixture(page);
    await page.goto('/trips');
    await page.getByText('Office → Home').click();
    await expect(page).toHaveURL(/\/trips\/trip-a$/);
    await expect(page.locator('[data-activity-detail-page]')).toBeVisible();
    await expect(page.locator('[data-detail-position]')).toHaveText('Trip · 1 of 4');
    await expect(page.locator('[data-trip-hero]')).toContainText('8.7');
    await expect(page.locator('[data-odometer-result]')).toHaveText('Matches the trip');
    await expect(page.getByTestId('trip-battery-chart')).toBeVisible();

    const readout = page.locator('[data-replay-readout]');
    await expect(readout.locator('[data-readout="distance"]')).toHaveText('8.7 mi');
    await page.getByRole('slider', { name: 'Replay position' }).fill('500');
    await expect(readout.locator('[data-readout="distance"]')).not.toHaveText('8.7 mi');
    await expect(page.locator('[data-chart-cursor]')).toBeVisible();
    await page.getByRole('button', { name: '240×' }).click();
    await expect(page.getByRole('button', { name: '240×' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Play replay' }).click();
    await expect(page.getByRole('button', { name: 'Pause replay' })).toBeVisible();
    await page.getByRole('button', { name: 'Pause replay' }).click();
    await expect(page.getByRole('button', { name: 'Play replay' })).toBeVisible();

    await page.getByRole('link', { name: 'Older' }).click();
    await expect(page).toHaveURL(/\/trips\/trip-b$/);
    await expect(page.locator('[data-detail-position]')).toHaveText('Trip · 2 of 4');

    await page.getByRole('button', { name: 'Back to activity' }).click();
    await expect(page).toHaveURL(/\/trips$/);
    await expect(page.locator('[data-activity-list-page]')).toBeVisible();
  });

  test('a charge without a price takes the total paid and shows the place tag', async ({ page }) => {
    const fixture = await installActivityFixture(page);
    await page.goto('/charging/charge-dc');
    await expect(page.getByRole('heading', { name: 'DC fast · Ridgefield' })).toBeVisible();
    await expect(page.locator('[data-charge-cost]')).toHaveText('Not set');
    await expect(page.getByRole('group', { name: 'Tag this place' }).getByRole('button', { name: 'Other' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('The tag applies to every charge at this place.', { exact: false })).toBeVisible();
    await expect(page.locator('[data-power-note]')).toContainText('Estimated from the battery-level change');
    await page.getByLabel('Total paid').fill('18.40');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved $18.40.')).toBeVisible();
    expect(fixture.costWrites).toContainEqual({ id: 'charge-dc', cost_mode: 'manual', cost_usd: 18.4 });
  });

  test('a place tag applies the Home rate to the charge', async ({ page }) => {
    const fixture = await installActivityFixture(page);
    await page.goto('/charging/charge-dc');
    const tags = page.getByRole('group', { name: 'Tag this place' });
    await tags.getByRole('button', { name: 'Home' }).click();
    await expect(page.getByRole('heading', { name: 'DC fast · Home' })).toBeVisible();
    await expect(tags.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-charge-cost]')).toHaveText('$7.56');
    await expect(page.locator('[data-cost-reason]')).toHaveText('Home rate $0.1891 per kWh × 40.0 kWh.');
    expect(fixture.tagWrites).toEqual([{ id: 'charge-dc', tag: 'home' }]);
  });

  test('the charging list opens Activity with the Charges filter', async ({ page }) => {
    await installActivityFixture(page);
    await page.goto('/charging');
    await expect(page).toHaveURL(/\/trips\?f=charges$/);
    await expect(page.locator('[data-activity-summary="charges"]')).toContainText('86');
    await expect(page.getByRole('button', { name: 'Charges' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Add cost')).toBeVisible();
  });
});
