import { expect, test, type Locator } from '@playwright/test';
import { installActivityFixture } from './r-activity.fixture.ts';

const LOST = { statusOverrides: { worker_health: 'error' } } as const;

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  if (!value) throw new Error('no box');
  return value;
}

test.describe('Title row under the Rivian banner on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const [path, heading, row] of [
    ['/trips', 'Activity', '.r-act-top'],
    ['/insights', 'Insights', '.ri-top'],
    ['/vehicle-health', 'Car', '.r-car-heading'],
  ] as const) {
    test(`${heading} keeps the gear and theme buttons beside the title`, async ({ page }) => {
      await installActivityFixture(page, LOST);
      await page.goto(path);
      await expect(page.getByRole('alert')).toContainText('Rivian connection lost.');
      const title = page.getByRole('heading', { level: 1, name: heading });
      await expect(title).toBeVisible();
      const theme = page.getByRole('button', { name: /^Switch to (light|dark) mode$/ });
      await expect(theme).toHaveCount(1);
      await expect(page.locator(row).getByRole('button', { name: /^Switch to (light|dark) mode$/ })).toBeVisible();
      const t = await box(title);
      const b = await box(theme);
      expect(b.y).toBeLessThan(t.y + t.height);
      expect(b.y + b.height).toBeGreaterThan(t.y);
    });
  }

  test('the charge detail page has no gear and theme row, and the cost editor stays in its card', async ({ page }) => {
    await installActivityFixture(page, LOST);
    await page.goto('/charging/charge-dc');
    await expect(page.locator('[data-detail-position]')).toContainText('Charge');
    await expect(page.getByRole('button', { name: /^Switch to (light|dark) mode$/ })).toHaveCount(0);
    const card = await box(page.locator('[data-cost-card]'));
    for (const control of [page.getByRole('button', { name: 'Price per kWh' }), page.locator('[data-cost-card]').getByRole('button', { name: 'Save' })]) {
      const b = await box(control);
      expect(b.x).toBeGreaterThanOrEqual(card.x);
      expect(b.x + b.width).toBeLessThanOrEqual(card.x + card.width + 0.5);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });

  test('the charge detail charts open full screen with Expand', async ({ page }) => {
    await installActivityFixture(page);
    await page.goto('/charging/charge-dc');
    const expand = page.getByRole('button', { name: 'Expand Charge level' });
    await expect(expand).toBeVisible();
    await expand.click();
    const sheet = page.getByRole('dialog', { name: 'Charge level' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId('charge-level-chart-big')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(expand).toBeFocused();
  });
});

test.describe('Place names on Insights', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('a charge with only coordinates shows the nearest town', async ({ page }) => {
    await installActivityFixture(page);
    await page.goto('/insights');
    const places = page.getByRole('region', { name: 'Places' }).or(page.locator('.ri-places'));
    await expect(places.getByText('Ridgefield', { exact: true })).toBeVisible();
    await expect(page.getByText(/-?\d+\.\d{4}, -?\d+\.\d{4}/)).toHaveCount(0);
    await expect(page.getByText('Kirkland', { exact: false }).first()).toBeVisible();
  });
});
