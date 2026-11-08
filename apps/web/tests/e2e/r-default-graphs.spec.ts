import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { installGraphFixture } from './r-default-graphs.fixture';

const primary = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'Primary navigation' });

for (const width of [393, 1280]) for (const mode of ['dark', 'light'] as const) {
  test(`default graphs and Insights battery tab ${width} ${mode}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 852 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const fixture = await installGraphFixture(page, { mode });
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('/');
    await expect(page.locator('.now h1')).toBeVisible();
    await expect(page.locator('[data-dashboard-grid]')).toHaveCount(0);
    // R has no custom dashboards; the Overview dashboard URL now opens Insights.
    for (const slug of ['battery', 'charging', 'efficiency']) {
      await page.goto(`/${slug}`);
      const config = JSON.parse(readFileSync(new URL(`../../../../packages/dashboards/src/defaults/${slug}.json`, import.meta.url), 'utf8'));
      const graphs = config.widgets.filter((w: { options?: { showPicker?: boolean } }) => w.options?.showPicker === false);
      for (const widget of graphs) {
        const card = page.locator(`[data-dashboard-grid] > [data-widget-id="${widget.id}"]`);
        // The grid can re-render once while chart data settles; retry the scroll until it holds.
        await expect(async () => card.scrollIntoViewIfNeeded({ timeout: 2000 })).toPass();
        await expect(card.locator(`[data-chart-id="${widget.options.chartId}"]`)).toBeVisible();
        await expect(card.getByText(widget.title, { exact: true })).toBeVisible();
        await expect(card.getByRole('button', { name: 'Chart', exact: true })).toHaveCount(0);
        expect(await card.evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath(`${slug}.png`), fullPage: true });
    }
    await primary(page).getByRole('link', { name: 'Insights', exact: true }).click();
    await page.getByRole('navigation', { name: 'Insights sections' }).getByRole('link', { name: 'Battery', exact: true }).click();
    await expect(page).toHaveURL(/\/insights\/battery$/);
    await expect(primary(page).getByRole('link', { name: 'Insights', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('region', { name: 'Parked loss, last 30 days' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('insights-battery.png'), fullPage: true });
    expect(errors).toEqual([]);
    expect(fixture.writes.filter(w => w.includes('/dashboards'))).toEqual([]);
  });
}

test('small phone primary targets fit and retain accessible names', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await installGraphFixture(page);
  await page.goto('/insights/battery');
  const links = primary(page).getByRole('link');
  await expect(links).toHaveCount(4);
  for (const link of await links.all()) {
    await expect(link.locator('span')).toBeVisible();
    const box = (await link.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    expect(await link.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
  }
  await page.goto('/battery/phantom-drain');
  await expect(page).toHaveURL(/\/insights\/battery$/);
  const sections = page.getByRole('navigation', { name: 'Insights sections' }).getByRole('link');
  await expect(sections).toHaveCount(5);
  for (const link of await sections.all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('efficiency stays reachable from Insights on phone and desktop', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await installGraphFixture(page);
  await page.goto('/explore');
  await expect(page).toHaveURL(/\/insights\/cost$/);
  const navigation = primary(page);
  await expect(navigation.getByRole('link')).toHaveCount(4);
  await page.getByRole('navigation', { name: 'Insights sections' }).getByRole('link', { name: 'Efficiency', exact: true }).click();
  await expect(page).toHaveURL(/\/insights\/efficiency$/);
  await expect(navigation.getByRole('link', { name: 'Insights', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.setViewportSize({ width: 1280, height: 852 });
  await expect(navigation.getByRole('link')).toHaveCount(4);
  await expect(navigation.getByRole('link', { name: 'Insights', exact: true })).toHaveAttribute('aria-current', 'page');
});
