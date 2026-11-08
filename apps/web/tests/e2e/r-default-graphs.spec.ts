import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { installGraphFixture } from './r-default-graphs.fixture';
import { OVERVIEW_DASHBOARD_PATH } from './r-experience.fixture';

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
    // Battery and Efficiency moved to Insights tabs; their old dashboard URLs redirect.
    for (const slug of ['dashboard', 'charging']) {
      await page.goto(slug === 'dashboard' ? OVERVIEW_DASHBOARD_PATH : `/${slug}`);
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

test('removing a pinned graph stays removed after saving the system layout', async ({ page }) => {
  const fixture = await installGraphFixture(page, { role: 'super_user' });
  await page.goto('/d/dashboard?edit=1');
  const widget = page.locator('[data-widget-frame="edit"]').filter({ has: page.locator('[data-chart-id="charge-level"]') });
  await widget.getByRole('button', { name: 'Edit widget settings' }).click();
  await page.getByRole('button', { name: 'Remove component' }).click();
  await page.getByRole('button', { name: 'Delete Widget', exact: true }).click();
  await page.getByRole('button', { name: 'Save dashboard changes' }).click();
  await expect(page.locator('.rgl-editor')).toHaveCount(0);
  await page.goto(OVERVIEW_DASHBOARD_PATH);
  await expect(page.locator('[data-dashboard-grid] > [data-widget-id="d1000001-0000-0000-0000-000000000102"]')).toHaveCount(1);
  await expect(page.locator('[data-dashboard-grid] > [data-widget-id="d1000001-0000-0000-0000-000000000101"]')).toHaveCount(0);
  expect(fixture.writes.filter(w => w.includes('/dashboards/'))).toHaveLength(1);
});

test('charging, vehicle lock and software states stay explicit', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await installGraphFixture(page, { statusOverrides: { charger_state: 'Charging', charger_status: 'chrgr_sts_connected_charging', time_to_end_of_charge_min: 42, doors_locked: false, door_front_left_closed: false, closure_frunk_closed: false, closure_liftgate_closed: false, ota_available_version: '2026.39' } });
  await page.goto(OVERVIEW_DASHBOARD_PATH);
  const energy = page.locator('.r-energy-summary');
  await expect(energy).toHaveAttribute('data-charging', 'true');
  await expect(energy).toContainText('68%');
  await expect(energy).toContainText('218 mi');
  await expect(energy).toContainText('42m');
  await expect(page.getByRole('img', { name: 'Vehicle unlocked', exact: true })).toBeVisible();
  await expect(page.locator('.r-door-status')).toHaveCount(0);
  await expect(page.locator('.r-status-glances')).toContainText('Update 2026.39 available');
  await expect(page.locator('.r-status-glances')).toContainText('410 ft');
  await energy.scrollIntoViewIfNeeded();
  expect(await page.locator('.r-soc-track > span').evaluate(e => getComputedStyle(e, '::after').animationName)).toBe('r-charge-flow');
  await page.screenshot({ path: testInfo.outputPath('charging-mobile.png') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.r-soc-track > span').evaluate(e => getComputedStyle(e, '::after').animationName)).toBe('none');
});
