import { expect, test, type Page } from '@playwright/test';
import { installRFixture } from './r-experience.fixture';

const tabs = [
  ['Now', '/'],
  ['Activity', '/trips'],
  ['Insights', '/insights'],
  ['Car', '/vehicle-health'],
] as const;

// Each URL keeps exactly one tab active; Settings is its own area.
const activeTab: Array<[string, typeof tabs[number][0]]> = [
  ['/', 'Now'],
  ['/trips', 'Activity'],
  ['/trips/trip-1', 'Activity'],
  ['/insights/cost', 'Insights'],
  ['/insights/battery', 'Insights'],
  ['/insights/lifetime', 'Insights'],
  ['/insights', 'Insights'],
  ['/charging/charge-1', 'Activity'],
  ['/battery', 'Insights'],
  ['/battery/phantom-drain', 'Insights'],
  ['/efficiency', 'Insights'],
  ['/vehicle-health', 'Car'],
];

// Removed pages keep old links working.
const redirects: Array<[string, RegExp]> = [
  ['/explore', /\/insights$/],
  ['/d/dashboard', /\/insights$/],
  ['/admin/dashboards', /\/insights$/],
  ['/settings/charts/new', /\/insights$/],
  ['/settings/charts/chart-1', /\/insights$/],
  ['/settings/themes/old-theme', /\/settings$/],
];

// Client-side visit: one full load per test keeps the dev server cost low.
async function visit(page: Page, path: string) {
  await page.evaluate(next => {
    window.history.pushState({}, '', next);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

for (const width of [390, 1280]) for (const mode of ['dark', 'light'] as const) {
  test(`bottom bar or rail with four tabs and Settings at ${width}px in ${mode}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installRFixture(page, { mode });
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Primary navigation' });
    const links = nav.getByRole('link');
    // The first load can wait for the dev server to compile the page.
    await expect(links).toHaveCount(4, { timeout: 20_000 });
    const phone = width < 960;
    let previous = 0;
    for (const [index, [label, href]] of tabs.entries()) {
      const link = links.nth(index);
      await expect(link).toHaveText(label);
      await expect(link).toHaveAttribute('href', href);
      await expect(link.locator('span')).toBeVisible();
      const box = (await link.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      if (phone) { expect(box.x).toBeGreaterThanOrEqual(previous); previous = box.x + box.width; }
      else { expect(box.y).toBeGreaterThanOrEqual(previous); previous = box.y + box.height; }
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    await expect(nav.getByRole('link', { name: 'Now', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('button', { name: `Switch to ${mode === 'dark' ? 'light' : 'dark'} mode` })).toBeVisible();

    const navBox = (await nav.boundingBox())!;
    const railSettings = page.locator('.r-rail-settings');
    const gear = page.locator('.r-gearbtn');
    if (phone) {
      // Bottom bar at the bottom of the screen, gear in the page header, no rail Settings.
      expect(navBox.y).toBeGreaterThan(780);
      expect(navBox.y + navBox.height).toBeLessThanOrEqual(900);
      await expect(railSettings).toBeHidden();
      await expect(gear).toBeVisible();
      const ink = (await page.locator('.r-tab-ink').boundingBox())!;
      const now = (await links.first().boundingBox())!;
      expect(Math.abs(ink.x + ink.width / 2 - (now.x + now.width / 2))).toBeLessThan(2);
      const padding = await page.locator('.r-app').evaluate(element => parseFloat(getComputedStyle(element).paddingBottom));
      expect(padding).toBeGreaterThanOrEqual(navBox.height);
    } else {
      // Left rail: logo at the top, Settings at the bottom, no gear.
      expect(navBox.x).toBeLessThan(232);
      await expect(page.locator('.r-brand .r-logo')).toBeVisible();
      await expect(railSettings).toBeVisible();
      await expect(gear).toBeHidden();
      const settingsBox = (await railSettings.boundingBox())!;
      expect(settingsBox.y).toBeGreaterThan(780);
    }
    await page.screenshot({ path: testInfo.outputPath('now.png') });

    for (const [label, href] of tabs) {
      await nav.getByRole('link', { name: label, exact: true }).click();
      // Insights opens its Cost tab.
      await expect(page).toHaveURL(href === '/insights' ? /\/insights\/cost$/ : new RegExp(`${href === '/' ? '' : href}/?$`));
      await expect(nav.getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    }
    await page.getByRole('link', { name: 'Settings' }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(0);
    await expect(page.locator('.r-gearbtn')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`removed pages redirect and every page keeps one tab at ${width}px in ${mode}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installRFixture(page, { mode });
    for (const [path, target] of redirects) {
      await page.goto(path);
      await expect(page, path).toHaveURL(target, { timeout: 15_000 });
    }
    await page.goto('/explore');
    await expect(page).toHaveURL(/\/insights\/cost$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Insights' })).toBeVisible();
    const sections = page.getByRole('navigation', { name: 'Insights sections' });
    await expect(sections.getByRole('link')).toHaveText(['Cost', 'Charging', 'Battery', 'Efficiency', 'Lifetime']);
    await expect(page.getByRole('link', { name: /Custom dashboards/ })).toHaveCount(0);
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

test('the theme button switches light and dark and saves it', async ({ page }) => {
  const fixture = await installRFixture(page, { mode: 'dark' });
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('html')).toHaveClass(/light/);
  await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible();
  expect(fixture.writes).toContain('PUT /v2/auth/preferences/theme');
});

for (const width of [390, 1280]) {
  test(`a lost Rivian connection shows a banner with Reconnect at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await installRFixture(page, { statusOverrides: { auth_state: 'needs_reauth' } });
    await page.goto('/insights');
    const banner = page.getByRole('alert').filter({ hasText: 'Rivian connection lost.' });
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toContainText('After you reconnect, R recovers the missed charges from Rivian.');
    const reconnect = banner.getByRole('link', { name: 'Reconnect' });
    await expect(reconnect).toHaveAttribute('href', '/connect?mode=refresh&vehicle_id=owner-vehicle');
    const box = (await reconnect.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(36);
    await page.screenshot({ path: testInfo.outputPath('rivian-lost.png') });
    await reconnect.click();
    await expect(page.getByRole('heading', { name: 'Reconnect your Rivian account' })).toBeVisible();
  });
}

test('a sleeping car with an old battery reading shows no banner', async ({ page }) => {
  await installRFixture(page, {
    statusOverrides: { telemetry_stale: true, telemetry_stale_reason: 'battery_stale', last_updated: new Date(Date.now() - 6 * 3_600_000).toISOString() },
  });
  await page.goto('/insights');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Rivian connection lost.')).toHaveCount(0);
});

test('going offline shows the offline banner, and it clears when back online', async ({ page, context }) => {
  await installRFixture(page);
  await page.goto('/insights');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 15_000 });
  await context.setOffline(true);
  await expect(page.getByText("You're offline.")).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText("You're offline.")).toHaveCount(0);
});

for (const width of [390, 1280]) {
  test(`Insights section selection is exclusive at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installRFixture(page);
    await page.goto('/battery');
    await expect(page).toHaveURL(/\/insights\/battery$/);
    const sections = page.getByRole('navigation', { name: 'Insights sections' });
    const battery = sections.getByRole('link', { name: 'Battery', exact: true });
    const efficiency = sections.getByRole('link', { name: 'Efficiency', exact: true });
    await expect(sections.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(battery).toHaveAttribute('aria-current', 'page');
    await efficiency.click();
    await expect(page).toHaveURL(/\/insights\/efficiency$/);
    await expect(sections.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(efficiency).toHaveAttribute('aria-current', 'page');
    await page.reload();
    await expect(sections.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(efficiency).toHaveAttribute('aria-current', 'page');
  });
}
