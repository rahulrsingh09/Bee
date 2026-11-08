import { expect, test } from '@playwright/test';
import { installRFixture } from './r-experience.fixture';

test.use({ viewport: { width: 393, height: 659 }, isMobile: true, hasTouch: true });

test('efficiency unit changes update the Insights readings immediately', async ({ page }) => {
  await installRFixture(page, { populatedAdmin: true, populatedAnalytics: true });
  // The old Efficiency page opens the Efficiency tab of Insights.
  await page.goto('/efficiency');
  await expect(page).toHaveURL(/\/insights\/efficiency$/);
  const average = page.getByRole('region', { name: 'Average efficiency' });
  const perWeek = average.getByRole('img', { name: 'Efficiency per week' });
  await expect(average.locator('.ri-big')).toHaveText('320Wh/mi');
  await expect(perWeek).toContainText('320');
  await average.getByRole('group', { name: 'Efficiency unit' }).getByRole('button', { name: 'mi/kWh', exact: true }).click();
  await expect(average.locator('.ri-big')).toHaveText('3.13mi/kWh');
  await expect(perWeek).toContainText('3.13');
  await expect(perWeek).not.toContainText('320');
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
  const orbit = page.locator('.now-car').getByRole('slider', { name: 'Turn the car. Drag it, or use the left and right arrow keys.', exact: true });
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

test('phone Now keeps the battery card inside the frame above the bottom bar', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installRFixture(page, { unknownConfiguration: true, secondVehicle: true, odometer: 123456 });
  await page.goto('/');
  await expect(page.locator('.now-batt')).toContainText('68%');
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
      await page.goto('/insights/charging');
      const charges = page.locator('.ri-spec > div').filter({ has: page.locator('dt', { hasText: /^Charges$/ }) });
      await expect(charges.locator('dd.ri-v')).toHaveText('1');
      const bar = page.getByRole('region', { name: 'Energy charged per week' }).locator('svg path[data-tip]').first();
      await expect(bar).toBeAttached();
      results.push(await charges.evaluate((element, barFill) => {
        const value = element.querySelector('dd.ri-v')!;
        const style = getComputedStyle(value);
        const root = getComputedStyle(document.documentElement);
        const insights = getComputedStyle(element.closest('.ri')!);
        return {
          color: style.color, halo: style.textShadow, bar: barFill,
          home: insights.getPropertyValue('--ri-home'), office: insights.getPropertyValue('--ri-office'), other: insights.getPropertyValue('--ri-other'),
          series: root.getPropertyValue('--rm-series-02'), drive: root.getPropertyValue('--rm-dm-towing'),
          accent: root.getPropertyValue('--rm-chart-accent'), success: root.getPropertyValue('--rm-chart-success'),
        };
      }, await bar.evaluate(element => getComputedStyle(element).fill)));
      await context.close();
    }
    expect(results[0]).toEqual(results[1]);
    expect(results[0]!.halo).toBe('none');
    expect(results[0]!.accent).not.toBe(results[0]!.success);
    expect(new Set([results[0]!.home, results[0]!.office, results[0]!.other]).size).toBe(3);
  });
}

test('populated phone charts retain readable labels within their visible frame', async ({ page }, testInfo) => {
  await installRFixture(page, { populatedAdmin: true, populatedAnalytics: true });
  await page.goto('/insights/charging');
  const chart = page.getByRole('region', { name: 'Energy charged per week' }).locator('.ri-chart').first();
  await expect(chart.locator('svg')).toBeVisible();
  await expect(chart.locator('svg text').filter({ hasText: /\S/ }).first()).toBeVisible();
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
