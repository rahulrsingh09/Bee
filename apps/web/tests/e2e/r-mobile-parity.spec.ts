import { expect, test } from '@playwright/test';
import { installRFixture } from './r-experience.fixture';

test.use({ viewport: { width: 393, height: 659 }, isMobile: true, hasTouch: true });

test('efficiency changes update chart readings immediately', async ({ page }) => {
  await installRFixture(page, { populatedAdmin: true, populatedAnalytics: true });
  await page.goto('/efficiency');
  await expect(page.locator('[data-testid="sensor-chip"]').filter({ hasText: 'Efficiency (net)' }).first()).toContainText('3.1 mi/kWh');
  await page.getByRole('button', { name: /Toggle efficiency units/ }).click();
  await expect(page.locator('[data-testid="sensor-chip"]').filter({ hasText: 'Efficiency (net)' }).first()).toContainText('320 Wh/mi');
});

/** A small PNG for every owner image (data URL decoded). The protected image cache serves it. */
const OWNER_PNG = Buffer.from('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='.split(',')[1]!, 'base64');

test('owner-configured R2 rests on the owner side image and turns by touch through the owner images', async ({ page }) => {
  // Reduced motion: a released drag rounds without inertia, so the end angle is exact.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installRFixture(page, { unknownConfiguration: true });
  const image = (placement: string, design: string) => ({ placement, design, size: 'large', resolution: null,
    url: `/v1/vehicle-image-cache/owner-vehicle/${placement}-${design}.png`, metadata: { source: 'vehicle:cel' } });
  await page.route(/\/v1\/vehicle-image-cache\//, route => route.fulfill({ contentType: 'image/png', body: OWNER_PNG }));
  await page.route(/\/v1\/vehicles(\?|$)/, route => route.fulfill({ json: { vehicles: [{
    id: 'owner-vehicle', user_id: '33333333-3333-4333-8333-333333333333', rivian_vehicle_id: 'fixture-r2', vin: null,
    model: 'R2', year: null, trim: 'Performance', color: null, wheel_option: null, interior_color: null,
    battery_capacity_kwh: 88, is_demo: false, display_name: 'Your Rivian', created_at: '2026-01-01T00:00:00Z', membership_role: 'owner',
    images: { all: ['side', 'front', 'rear_three_quarter', 'overhead'].flatMap(placement => ['light', 'dark'].map(design => image(placement, design))) },
  }] } }));
  await page.goto('/');
  const orbit = page.locator('.now-car').getByRole('slider', { name: 'Your R2. Use arrow keys to turn.', exact: true });
  await expect(orbit).toBeVisible();
  await expect(orbit).toHaveAttribute('aria-valuetext', 'Side');
  // No turn on entry: the car stays on the owner side image.
  await page.waitForTimeout(400);
  await expect(orbit).toHaveAttribute('aria-valuetext', 'Side');
  const box = (await orbit.boundingBox())!;
  const y = box.y + box.height / 2;
  await orbit.dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true, button: 0, clientX: 120, clientY: y });
  await orbit.dispatchEvent('pointermove', { pointerId: 1, isPrimary: true, button: 0, clientX: 180, clientY: y });
  await orbit.dispatchEvent('pointermove', { pointerId: 1, isPrimary: true, button: 0, clientX: 230, clientY: y });
  await orbit.dispatchEvent('pointerup', { pointerId: 1, isPrimary: true, button: 0, clientX: 230, clientY: y });
  // Side + 110 px (about 1.1 steps) rounds to the next angle.
  await expect(orbit).toHaveAttribute('aria-valuetext', 'Rear three-quarter');
  await orbit.press('Home');
  await expect(orbit).toHaveAttribute('aria-valuetext', 'Side');
  await expect(page.locator('.now-car canvas, .r-orbit-poster')).toHaveCount(0);
});

test('phone Now keeps the odometer inside the frame above the bottom bar', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installRFixture(page, { unknownConfiguration: true, secondVehicle: true, odometer: 123456 });
  await page.goto('/');
  await expect(page.locator('.now-odometer')).toContainText('123,456');
  await expect(page.getByRole('combobox', { name: 'Select vehicle' }).or(page.getByRole('button', { name: 'Select vehicle' }))).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('iphone-now.png'), fullPage: true });
  // The orbit buttons are gone (turning is drag or arrow keys). The dock must still not cover the page end.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const dock = (await page.getByRole('navigation', { name: 'Primary navigation' }).boundingBox())!;
  const pageEnd = await page.locator('#r-content > .r-page').evaluate(element => element.getBoundingClientRect().bottom);
  expect(pageEnd).toBeLessThanOrEqual(dock.y + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const mode of ['dark', 'light'] as const) {
  test(`R data colors do not change with the saved account palette in ${mode}`, async ({ browser }) => {
    const results = [];
    for (const palette of ['classic', 'rad'] as const) {
      const context = await browser.newContext({ viewport: { width: 393, height: 659 } });
      const page = await context.newPage();
      await installRFixture(page, { mode, palette, populatedAdmin: true, populatedAnalytics: true });
      await page.goto('/charging');
      const sessions = page.locator('[data-testid="sensor-chip"]').filter({ hasText: /^Charges/ }).first();
      await expect(sessions).toContainText('25');
      results.push(await sessions.evaluate(element => {
        const value = element.querySelector('.font-mono')!;
        const style = getComputedStyle(value);
        const root = getComputedStyle(document.documentElement);
        return {
          color: style.color, halo: style.textShadow,
          series: root.getPropertyValue('--rm-series-02'), drive: root.getPropertyValue('--rm-dm-towing'),
          accent: root.getPropertyValue('--rm-chart-accent'), success: root.getPropertyValue('--rm-chart-success'),
        };
      }));
      await context.close();
    }
    expect(results[0]).toEqual(results[1]);
    expect(results[0]!.halo).toBe('none');
    expect(results[0]!.accent).not.toBe(results[0]!.success);
  });
}

test('populated phone charts retain readable labels within their visible frame', async ({ page }, testInfo) => {
  await installRFixture(page, { populatedAdmin: true, populatedAnalytics: true });
  await page.goto('/charging');
  const chart = page.locator('[data-chart-renderer="daily-charge-sessions"]');
  await expect(chart.locator('svg')).toBeVisible();
  await expect(chart.locator('[data-testid="daily-charge-axis-label"]').first()).toBeVisible();
  const geometry = await chart.evaluate(element => {
    const svg = element.querySelector('svg')!;
    const text = [...svg.querySelectorAll('text')].filter(node => node.textContent?.trim());
    const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    const rect = element.getBoundingClientRect();
    let clipped = false;
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (['hidden', 'clip'].includes(style.overflowY)) {
        const box = parent.getBoundingClientRect();
        if (rect.bottom > box.bottom + 2) clipped = true;
      }
    }
    return { minFont: Math.min(...text.map(node => parseFloat(getComputedStyle(node).fontSize) * scale)), clipped };
  });
  expect(geometry.minFont).toBeGreaterThanOrEqual(11);
  expect(geometry.clipped).toBe(false);
  await chart.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('iphone-charging-chart.png') });
});

test('selected-trip tagging has room for input and complete action labels', async ({ page }, testInfo) => {
  await installRFixture(page, { populatedAdmin: true, populatedAnalytics: true, role: 'super_user' });
  await page.goto('/trips');
  // A row opens its trip; the row checkbox selects it for tagging.
  await page.getByRole('checkbox', { name: /^Select trip from / }).first().check();
  const toolbar = page.locator('[data-trip-selection-actions]');
  await expect(toolbar).toBeVisible();
  const input = toolbar.getByRole('textbox');
  const inputBox = (await input.boundingBox())!;
  expect(inputBox.width).toBeGreaterThan(220);
  for (const name of ['Clear tags', 'Add staged tags', 'Replace tags']) {
    const button = toolbar.getByRole('button', { name: new RegExp(`^${name}`) });
    const box = (await button.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width).toBeLessThanOrEqual(393);
  }
  await input.fill('Daily');
  await page.getByRole('option', { name: /Daily commute/ }).click();
  await toolbar.getByRole('button', { name: /^Add staged tags/ }).click();
  await expect(toolbar).toHaveCount(0);
  await expect(page.getByText('Daily commute').first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('iphone-trip-tags.png'), fullPage: true });
});
