import { expect, test, type Page, type Locator } from '@playwright/test';
import { installRFixture } from './r-experience.fixture';

/** The chart remounts once its data arrives. Retry until the settled element is in view and measured. */
async function settledBox(locator: Locator) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      await locator.scrollIntoViewIfNeeded({ timeout: 2_000 });
      const box = await locator.boundingBox();
      if (box) return box;
    } catch {
      // The element was replaced during a re-render; measure the new one.
    }
    await locator.page().waitForTimeout(250);
  }
  throw new Error('The chart did not settle within 10 s.');
}


const chartSelector = '[data-chart-renderer="rich-time-series"]';
const mapLabel = 'Inspect trip route. Tap or drag to select a point; arrow keys move along the route.';
const slider = (page: Page) => page.getByRole('slider', { name: 'Drive time' });
const readout = (page: Page, label: string) => page.locator('[data-trip-readout] div').filter({ has: page.getByText(label, { exact: true }) }).locator('dd');
const powerCard = (page: Page) => page.locator('[data-trip-power]');

/** The power tooltip and the replay readout show the same sample. */
async function expectSharedSample(page: Page, index: number, minutes: string, speed: string) {
  await expect(slider(page)).toHaveValue(String(index));
  await expect(readout(page, 'Speed')).toHaveText(speed);
  await expect.poll(() => powerCard(page).locator('[role="tooltip"]').allTextContents())
    .toEqual([expect.stringMatching(new RegExp(`^${minutes}\\nPower: 20 kW`))]);
}

for (const width of [393, 1440]) {
  for (const mode of ['light', 'dark'] as const) {
    test(`trip replay links the map, power chart, scrubber and readout at ${width}px in ${mode}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await installRFixture(page, { mode, populatedTrip: true });
      await page.goto('/trips/trip-1');
      await expect(page.getByRole('heading', { level: 1, name: 'Drive 1 → Home' })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText('Thu, Oct 8 · 5:00–5:30 PM')).toBeVisible();
      await expect(page.getByTestId('trip-distance')).toContainText('20.0mi');
      await expect(page.locator('[data-trip-tile="Efficiency"]')).toContainText('3.1mi/kWh');
      await expect(page.getByRole('heading', { name: 'Power during the drive' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Time at each speed' })).toBeVisible();
      await expect(page.locator('[data-trip-speed-profile]')).toContainText('Speed recorded for 30 of 30 min.');
      // A flat route has no elevation chart; the change is in Conditions.
      await expect(page.getByRole('heading', { name: 'Elevation along the route' })).toHaveCount(0);
      await expect(page.locator('[data-trip-conditions]')).toContainText('Drive mode');
      const body = await page.locator('main').innerText();
      for (const banned of ['->', 'Avg. Effic.', 'TeslaMate', 'Drive Chart', '16:40', '8:20']) expect(body).not.toContain(banned);
      // Odometer facts are hidden when the trip has no odometer.
      await expect(page.getByTestId('trip-odometer')).toHaveCount(0);

      const map = page.getByLabel(mapLabel);
      await map.scrollIntoViewIfNeeded();
      await map.focus();
      await page.keyboard.press('End');
      await expectSharedSample(page, 30, '30 min', '50 mph');
      await expect(page.locator('[data-trip-replay-clock]')).toHaveText('5:30 PM');
      await page.keyboard.press('Home');
      await expectSharedSample(page, 0, '0 min', '20 mph');

      const plot = powerCard(page).locator('.u-over');
      await plot.scrollIntoViewIfNeeded();
      const bounds = (await plot.boundingBox())!;
      await page.mouse.move(bounds.x + bounds.width * .2, bounds.y + bounds.height * .5);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width * .7, bounds.y + bounds.height * .5, { steps: 12 });
      await page.mouse.up();
      await expectSharedSample(page, 21, '21 min', '41 mph');
      await page.mouse.move(2, 2);
      await expectSharedSample(page, 21, '21 min', '41 mph');

      await slider(page).scrollIntoViewIfNeeded();
      await slider(page).focus();
      await page.keyboard.press('ArrowLeft');
      await expectSharedSample(page, 20, '20 min', '40 mph');
      await expect(readout(page, 'Battery')).toHaveText('71%');

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`trip-detail-${width}-${mode}.png`), fullPage: true });
    });
  }
}

test('play replays the drive to the end and pause stops it', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 900 });
  await installRFixture(page, { mode: 'dark', populatedTrip: true });
  await page.goto('/trips/trip-1');
  const play = page.getByRole('button', { name: 'Replay the drive' });
  await play.click();
  await expect(page.getByRole('button', { name: 'Pause the replay' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => Number(await slider(page).inputValue())).toBeGreaterThan(3);
  await page.getByRole('button', { name: 'Pause the replay' }).click();
  const paused = Number(await slider(page).inputValue());
  await page.waitForTimeout(600);
  expect(Number(await slider(page).inputValue())).toBe(paused);
  await expect(readout(page, 'Speed')).toHaveText(`${20 + paused} mph`);
  // Play again continues from the selected sample and ends at the last one.
  await page.getByRole('button', { name: 'Replay the drive' }).click();
  await expect(slider(page)).toHaveValue('30', { timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Replay the drive' })).toHaveAttribute('aria-pressed', 'false');
  await expect(readout(page, 'Speed')).toHaveText('50 mph');
});

test('reduced motion does not start a replay and the scrubber still works', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 393, height: 900 });
  await installRFixture(page, { mode: 'dark', populatedTrip: true });
  await page.goto('/trips/trip-1');
  await expect(slider(page)).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(slider(page)).toHaveValue('0');
  await expect(page.getByRole('button', { name: 'Replay the drive' })).toHaveAttribute('aria-pressed', 'false');
  // A pointer press on the track moves the scrubber (Playwright scrolls it clear of the dock first).
  await slider(page).click();
  await expect.poll(async () => Number(await slider(page).inputValue())).toBeGreaterThan(10);
  const value = Number(await slider(page).inputValue());
  await expect(readout(page, 'Speed')).toHaveText(`${20 + value} mph`);
  await expect(powerCard(page).locator('[role="tooltip"]')).toContainText(`${value} min`);
});

test.describe('touch trip inspection', () => {
  test.use({ viewport: { width: 393, height: 659 }, hasTouch: true, isMobile: true });

  test('tapping the power chart updates the scrubber, readout and map', async ({ page }) => {
    await installRFixture(page, { populatedTrip: true });
    await page.goto('/trips/trip-1');
    const plot = powerCard(page).locator('.u-over');
    const bounds = await settledBox(plot);
    await page.touchscreen.tap(bounds.x + bounds.width * .5, bounds.y + bounds.height * .5);
    await expectSharedSample(page, 15, '15 min', '35 mph');
    await expect(plot).toHaveCSS('touch-action', 'pan-y');
  });

  test('horizontal finger drag selects samples while vertical gestures scroll', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Native touch-drag injection uses Chromium CDP; WebKit covers native tap.');
    await installRFixture(page, { populatedTrip: true });
    await page.goto('/trips/trip-1');
    const plot = powerCard(page).locator('.u-over');
    const bounds = await settledBox(plot);
    const session = await context.newCDPSession(page);
    const touch = async (type: string, x: number, y: number) => session.send('Input.dispatchTouchEvent', {
      type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
    });
    const y = bounds.y + bounds.height * .5;
    await touch('touchStart', bounds.x + bounds.width * .2, y);
    for (let step = 3; step <= 8; step++) await touch('touchMove', bounds.x + bounds.width * step / 10, y);
    await touch('touchEnd', 0, 0);
    await expectSharedSample(page, 24, '24 min', '44 mph');
    const scrollBefore = await page.evaluate(() => scrollY);
    await touch('touchStart', bounds.x + bounds.width * .2, y);
    for (let step = 1; step <= 6; step++) await touch('touchMove', bounds.x + bounds.width * .2, y - step * 20);
    await touch('touchEnd', 0, 0);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(scrollBefore + 30);
    await expectSharedSample(page, 24, '24 min', '44 mph');
  });
});

test('trip readings use the selected metric units', async ({ page }) => {
  await installRFixture(page, { populatedTrip: true, populatedAdmin: true, metricUnits: true });
  await page.goto('/trips/trip-1');
  await expect(page.getByTestId('trip-distance')).toContainText('32.2km');
  await expect(page.locator('[data-trip-tile="Efficiency"]')).toContainText('5.0km/kWh');
  const map = page.getByLabel(mapLabel);
  await map.scrollIntoViewIfNeeded();
  await map.focus();
  await page.keyboard.press('End');
  await expect(readout(page, 'Speed')).toHaveText('80 km/h');
  await expect(readout(page, 'Distance')).toHaveText('32.2 km');
  const conditions = page.locator('[data-trip-conditions]');
  await expect(conditions).toContainText('20 °C');
  await expect(conditions).toContainText('138 kPa');
  await expect(conditions).toContainText('No change');
  const speed = page.locator('[data-trip-speed-profile]');
  await speed.scrollIntoViewIfNeeded();
  await expect(speed.locator('[data-speed-band="64–80"]')).toBeVisible();
  await expect(speed).toContainText('Speed recorded for 30 of 30 min.');
  await expect(speed).toContainText('km/h');
});

for (const width of [393, 1440]) {
  test(`all efficiency variants render populated metric readings at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await installRFixture(page, { populatedAnalytics: true, populatedAdmin: true, mode: 'dark', metricUnits: true });
    await page.goto('/efficiency');
    const widget = page.locator('[data-widget-id="d3000003-0000-0000-0000-000000000005"]');
    await widget.scrollIntoViewIfNeeded();
    const picker = widget.locator('button[aria-haspopup="listbox"]');
    for (const name of ['Efficiency Trend', 'Efficiency by Temperature', 'Efficiency by Drive Mode', 'Efficiency by Tag']) {
      await picker.click();
      await page.getByRole('option').filter({ hasText: name }).click();
      await widget.scrollIntoViewIfNeeded();
      if (name === 'Efficiency Trend') {
        await expect(widget.locator('.u-over')).toBeVisible();
      } else {
        const bars = widget.locator('[data-chart-renderer="efficiency-pill-bars"]');
        const rows = bars.getByRole(width === 393 ? 'button' : 'group');
        await expect(rows.first()).toBeVisible();
        await expect(rows.first()).toHaveAccessibleName(/km\/kWh/);
        if (name === 'Efficiency by Temperature') {
          await expect(rows.first()).toHaveAccessibleName(/129 km, 96.6 km\/h/);
        }
        if (name === 'Efficiency by Tag') {
          await expect(rows.first()).toHaveAccessibleName(/257 km, 100% coverage/);
        }
        const display = await bars.evaluate(element => {
          const probe = document.createElement('span');
          probe.style.backgroundColor = 'var(--rm-chart-accent)';
          element.append(probe);
          const accent = getComputedStyle(probe).backgroundColor;
          probe.remove();
          const filled = [...element.querySelectorAll('[data-efficiency-pill-filled]')]
            .filter(node => node.getBoundingClientRect().width > 0);
          return {
            colorsMatch: filled.every(node => getComputedStyle(node).backgroundColor === accent),
            hasSegments: filled.length > 0,
          };
        });
        expect(display).toEqual({ colorsMatch: true, hasSegments: true });
        if (width === 1440) await expect(bars.locator(':scope > div').first()).toContainText('km/kWh');
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await widget.screenshot({ path: testInfo.outputPath(`${name.toLowerCase().replaceAll(' ', '-')}.png`) });
    }
  });
}

test.describe('high-density phone chart labels', () => {
  test.use({ viewport: { width: 393, height: 659 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  test('efficiency dates fit their actual CSS-pixel spacing', async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      const labels = new Map<HTMLCanvasElement, Array<{ text: string; x: number; y: number; width: number }>>();
      Object.assign(window, { chartLabels: labels });
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      const clearRect = CanvasRenderingContext2D.prototype.clearRect;
      CanvasRenderingContext2D.prototype.clearRect = function (x, y, w, h) {
        if (x === 0 && y === 0) labels.set(this.canvas, []);
        clearRect.call(this, x, y, w, h);
      };
      CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
        if (/^Oct \d+$/.test(text)) {
          const current = labels.get(this.canvas) ?? [];
          current.push({ text, x, y, width: this.measureText(text).width });
          labels.set(this.canvas, current);
        }
        if (maxWidth == null) fillText.call(this, text, x, y);
        else fillText.call(this, text, x, y, maxWidth);
      };
    });
    await installRFixture(page, { populatedAnalytics: true, populatedAdmin: true, mode: 'dark' });
    await page.goto('/efficiency');
    const widget = page.locator('[data-widget-id="d3000003-0000-0000-0000-000000000005"]');
    await widget.scrollIntoViewIfNeeded();
    await widget.locator('button[aria-haspopup="listbox"]').click();
    await page.getByRole('option').filter({ hasText: 'Efficiency Trend' }).click();
    await widget.scrollIntoViewIfNeeded();
    const canvas = widget.locator('.uplot canvas');
    await expect(canvas).toBeVisible();
    const read = () => canvas.evaluate(element => {
      const labels = (window as unknown as {
        chartLabels: Map<HTMLCanvasElement, Array<{ text: string; x: number; y: number; width: number }>>;
      }).chartLabels.get(element as HTMLCanvasElement) ?? [];
      return labels.sort((a, b) => a.x - b.x);
    });
    await expect.poll(async () => (await read()).length).toBeGreaterThanOrEqual(2);
    const labels = await read();
    const canvasWidth = await canvas.evaluate(element => (element as HTMLCanvasElement).width);
    expect(labels.length).toBeLessThanOrEqual(3);
    for (const label of labels) {
      expect(label.x - label.width / 2).toBeGreaterThanOrEqual(0);
      expect(label.x + label.width / 2).toBeLessThanOrEqual(canvasWidth);
    }
    for (let i = 1; i < labels.length; i++) {
      expect(labels[i]!.x - labels[i - 1]!.x).toBeGreaterThan((labels[i]!.width + labels[i - 1]!.width) / 2 + 12);
    }
    await widget.screenshot({ path: testInfo.outputPath('iphone-3x-efficiency-dates.png') });
  });
});
