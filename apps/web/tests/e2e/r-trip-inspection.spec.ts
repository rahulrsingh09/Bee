import { expect, test } from '@playwright/test';
import { installRFixture } from './r-experience.fixture';

for (const width of [393, 1440]) {
  test(`all efficiency variants render populated metric readings at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await installRFixture(page, { populatedAnalytics: true, populatedAdmin: true, mode: 'dark' });
    await page.goto('/settings?section=units');
    await page.getByRole('button', { name: /^Metric/ }).click();
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
