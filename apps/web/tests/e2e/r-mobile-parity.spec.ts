import { expect, test } from '@playwright/test';
import { installRFixture, OVERVIEW_DASHBOARD_PATH } from './r-experience.fixture';

test.use({ viewport: { width: 393, height: 659 }, isMobile: true, hasTouch: true });

test('efficiency changes update actual overview and chart readings immediately', async ({ page }) => {
  await installRFixture(page, { populatedAdmin: true, populatedAnalytics: true });
  await page.goto(OVERVIEW_DASHBOARD_PATH);
  const efficiency = page.locator('.r-efficiency-card');
  await expect(efficiency.locator('strong')).toHaveText('3.1');
  await page.getByRole('button', { name: /Toggle efficiency units/ }).click();
  await expect(efficiency.locator('strong')).toHaveText('320');
  await expect(efficiency).toContainText('Wh/mi');
  await page.getByRole('button', { name: /Toggle efficiency units/ }).click();
  await expect(efficiency.locator('strong')).toHaveText('3.1');
  await page.goto('/d/efficiency');
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

test('phone Now and Overview keep the odometer and trip totals inside the frame above the dock', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installRFixture(page, { unknownConfiguration: true, secondVehicle: true, odometer: 123456 });
  await page.goto('/');
  await expect(page.locator('.now-odometer')).toContainText('123,456');
  await expect(page.getByRole('combobox', { name: 'Select vehicle' }).or(page.getByRole('button', { name: 'Select vehicle' }))).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('iphone-now.png'), fullPage: true });
  await page.goto(OVERVIEW_DASHBOARD_PATH);
  await expect(page.locator('.r-trip-instrument').first()).toContainText('Trip distance');
  await expect(page.locator('.r-snapshot-foot')).toContainText('Odometer 123,456');
  // An R2 without owner images shows its packaged R2 side artwork, not the bundled orbit frames.
  await expect(page.locator('.r-static-car img')).toBeVisible();
  await expect(page.locator('.r-orbit-poster, .r-orbit canvas')).toHaveCount(0);
  const bounds = await page.locator('.r-trip-instrument').first().evaluate(element => {
    const parent = element.getBoundingClientRect();
    const value = element.querySelector('strong')!.getBoundingClientRect();
    return { fits: value.right <= parent.right + 1, overflow: element.scrollWidth > element.clientWidth + 1 };
  });
  expect(bounds).toEqual({ fits: true, overflow: false });
  // The orbit buttons are gone (turning is drag or arrow keys). The dock must still not cover the page end.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const dock = (await page.getByRole('navigation', { name: 'Primary navigation' }).boundingBox())!;
  const pageEnd = await page.locator('#r-content > .r-page').evaluate(element => element.getBoundingClientRect().bottom);
  expect(pageEnd).toBeLessThanOrEqual(dock.y + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('iphone-overview.png'), fullPage: true });
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

test('settings pickers stay inside the phone viewport and restore focus', async ({ page }) => {
  await installRFixture(page, { populatedAdmin: true, role: 'super_user' });
  await page.goto('/settings?section=units');
  await page.getByRole('button', { name: /^Custom/ }).click();
  const trigger = page.getByRole('button', { name: 'Application time zone', exact: true });
  await page.getByRole('button', { name: 'Efficiency display', exact: true }).click();
  await page.keyboard.press('Tab');
  await expect(trigger).toBeFocused();
  await trigger.evaluate(element => window.scrollTo(0, scrollY + element.getBoundingClientRect().top - 500));
  await trigger.click();
  const menu = page.getByRole('listbox', { name: 'Application time zone' });
  const bounds = (await menu.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(11);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(382);
  expect(bounds.y).toBeGreaterThanOrEqual(11);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(648);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(menu).toHaveCount(0);
  await trigger.press('ArrowDown');
  await expect(menu.getByRole('option', { selected: true })).toBeFocused();
  const enabled = menu.locator('[role="option"]:not(:disabled)');
  const currentIndex = await enabled.evaluateAll(elements => elements.findIndex(element => element.getAttribute('aria-selected') === 'true'));
  const nextOption = enabled.nth((currentIndex + 1) % await enabled.count());
  const nextLabel = await nextOption.textContent();
  await page.keyboard.press('ArrowDown');
  await expect(nextOption).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toContainText(nextLabel!.trim());
  await page.getByRole('button', { name: 'Settings section', exact: true }).click();
  const section = (await page.getByRole('listbox', { name: 'Settings section' }).boundingBox())!;
  expect(section.x + section.width).toBeLessThanOrEqual(382);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('vehicle settings keep Catalina Cove artwork and capture controls fit long names', async ({ page }) => {
  const name = 'Catalina Cove R2 Performance Family Adventure';
  await installRFixture(page, { populatedAdmin: true, unknownConfiguration: true, vehicleName: name, role: 'super_user' });
  await page.goto('/settings?section=vehicles');
  await expect(page.getByRole('img', { name: 'Catalina Cove R2 Performance with 21-inch wheels' })).toBeVisible();
  await page.goto('/settings?section=raw');
  await page.getByRole('button', { name: `Start capture for ${name}` }).click();
  const stop = page.getByRole('button', { name: `Stop capture for ${name}` });
  const bounds = (await stop.boundingBox())!;
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(393);
  await stop.click();
  const restart = page.getByRole('button', { name: `Start capture for ${name}` });
  await expect(restart).toBeVisible();
  await restart.click();
  const confirmation = page.getByRole('dialog', { name: 'Replace the previous capture?' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(restart).toBeFocused();
  await expect(stop).toHaveCount(0);
  await restart.click();
  await confirmation.getByRole('button', { name: 'Start new capture', exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(stop).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [320, 402]) {
  test(`connection names and job actions remain visible at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 874 });
    await installRFixture(page, { populatedAdmin: true, role: 'super_user' });
    await page.goto('/settings?section=external');
    const connections = page.getByRole('navigation', { name: 'External connections' });
    for (const button of await connections.getByRole('button').all()) {
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      expect(await button.evaluate(e => {
        const box = e.getBoundingClientRect();
        return box.left >= 0 && box.right <= innerWidth && e.scrollWidth <= e.clientWidth;
      })).toBe(true);
    }
    await connections.screenshot({ path: testInfo.outputPath('connection-options.png') });
    await page.goto('/settings?section=jobs');
    const run = page.getByRole('button', { name: 'Run', exact: true });
    await run.scrollIntoViewIfNeeded();
    await expect(run).toBeVisible();
    expect(await run.evaluate(e => {
      const box = e.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth && e.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    })).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('jobs-mobile.png') });
  });
}
