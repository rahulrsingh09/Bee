import { expect, test, type Page } from '@playwright/test';
import { installRFixture } from './r-experience.fixture';

const tabs = [
  ['Now', '/'],
  ['Activity', '/trips'],
  ['Insights', '/insights'],
  ['Car', '/vehicle-health'],
] as const;

// Release 1 mapping: each URL keeps exactly one tab active.
const activeTab: Array<[string, typeof tabs[number][0]]> = [
  ['/', 'Now'],
  ['/trips', 'Activity'],
  ['/trips/trip-1', 'Activity'],
  ['/insights', 'Insights'],
  ['/charging/charge-1', 'Activity'],
  ['/battery', 'Insights'],
  ['/battery/phantom-drain', 'Insights'],
  ['/efficiency', 'Insights'],
  ['/vehicle-health', 'Car'],
  ['/settings', 'Car'],
];

// Client-side visit: one full load per test keeps the dev server cost low.
async function visit(page: Page, path: string) {
  await page.evaluate(next => {
    window.history.pushState({}, '', next);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

for (const width of [390, 1280]) for (const mode of ['dark', 'light'] as const) {
  test(`four tabs share one model and have room at ${width}px in ${mode}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installRFixture(page, { mode });
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Primary navigation' });
    const links = nav.getByRole('link');
    await expect(links).toHaveCount(4);
    let previousRight = 0;
    for (const [index, [label, href]] of tabs.entries()) {
      const link = links.nth(index);
      await expect(link).toHaveText(label);
      await expect(link).toHaveAttribute('href', href);
      await expect(link.locator('span')).toBeVisible();
      const box = (await link.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(previousRight);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      previousRight = box.x + box.width;
    }
    await expect(nav.getByRole('link', { name: 'Now', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Explore' })).toHaveCount(0);

    const header = page.locator('.r-header');
    await expect(header.getByRole('button')).toHaveCount(0);
    await expect(header.getByRole('link', { name: 'Settings' })).toHaveCount(0);
    await expect(header.getByText(/^Updated (just now|\d+ min ago)$/)).toBeVisible();

    const navBox = (await nav.boundingBox())!;
    if (width <= 900) {
      expect(navBox.y).toBeGreaterThan(740);
      expect(navBox.y + navBox.height).toBeLessThanOrEqual(900);
      const padding = await page.locator('.r-main').evaluate(element => parseFloat(getComputedStyle(element).paddingBottom));
      expect(padding).toBeGreaterThanOrEqual(navBox.height + 16);
    } else {
      const logo = (await page.locator('.r-brand').boundingBox())!;
      const freshness = (await page.locator('.r-freshness').boundingBox())!;
      expect(navBox.y).toBeLessThan(100);
      expect(navBox.x).toBeGreaterThanOrEqual(logo.x + logo.width);
      expect(navBox.x + navBox.width).toBeLessThanOrEqual(freshness.x);
    }
    await nav.screenshot({ path: testInfo.outputPath('navigation.png') });
    await page.screenshot({ path: testInfo.outputPath('now.png') });

    for (const [label, href] of tabs) {
      await nav.getByRole('link', { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${href === '/' ? '' : href}/?$`));
      await expect(nav.getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`Explore redirects to Insights and every page keeps one tab at ${width}px in ${mode}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installRFixture(page, { mode });
    await page.goto('/explore');
    await expect(page).toHaveURL(/\/insights$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Insights' })).toBeVisible();
    const hub = page.getByRole('navigation', { name: 'Insights' });
    for (const name of ['Cost', 'Battery', 'Parked loss', 'Efficiency', 'Custom dashboards']) {
      await expect(hub.getByRole('link', { name: new RegExp(`^${name}`) })).toBeVisible();
    }
    await page.screenshot({ path: testInfo.outputPath('insights.png'), fullPage: true });
    const nav = page.getByRole('navigation', { name: 'Primary navigation' });
    for (const [path, label] of activeTab) {
      await visit(page, path);
      await expect(page).toHaveURL(new RegExp(`${path === '/' ? '' : path}$`));
      await expect(nav.getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    }
  });
}

test('stale telemetry shows the warning dot and the no-data age', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await installRFixture(page, {
    statusOverrides: { telemetry_stale: true, last_updated: new Date(Date.now() - 6 * 3_600_000 - 60_000).toISOString() },
  });
  await page.goto('/insights');
  const freshness = page.locator('.r-freshness');
  await expect(freshness).toHaveText('No data for 6 h');
  await expect(freshness).toHaveAttribute('data-state', 'stale');
});

for (const width of [390, 1280]) {
  test(`battery section selection is exclusive at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installRFixture(page);
    await page.goto('/battery');
    const sections = page.getByRole('navigation', { name: 'Battery sections' });
    const overview = sections.getByRole('link', { name: 'Battery overview', exact: true });
    const drain = sections.getByRole('link', { name: 'Parked loss', exact: true });
    await expect(sections.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(overview).toHaveAttribute('aria-current', 'page');
    await drain.click();
    await expect(page).toHaveURL(/\/battery\/phantom-drain$/);
    await expect(sections.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(drain).toHaveAttribute('aria-current', 'page');
    await page.reload();
    await expect(sections.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(drain).toHaveAttribute('aria-current', 'page');
    await overview.click();
    await expect(sections.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(overview).toHaveAttribute('aria-current', 'page');
  });
}
