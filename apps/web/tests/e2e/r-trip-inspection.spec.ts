import { expect, test } from '@playwright/test';
import { installRFixture } from './r-experience.fixture';

const DAY = 864e5;

/** Twelve weeks of trips, one every three days, each long enough to count for efficiency. */
function weeksOfTrips() {
  return Array.from({ length: 28 }, (_, index) => {
    const started = new Date(Date.now() - (84 - index * 3) * DAY);
    started.setUTCHours(16, 0, 0, 0);
    const miles = 12 + (index % 4) * 6;
    const whMi = 290 + (index % 5) * 15;
    return {
      id: `trip-${index + 1}`, vehicle_id: 'owner-vehicle', started_at: started.toISOString(),
      ended_at: new Date(started.getTime() + 30 * 60_000).toISOString(), distance_mi: miles, duration_min: 30,
      energy_used_kwh: miles * whMi / 1000, efficiency_wh_mi: whMi, max_speed_mph: 60, drive_mode: null,
      soc_start: 80, soc_end: 72, start_place: 'Home', end_place: 'Office',
    };
  });
}

test.describe('high-density phone chart labels', () => {
  test.use({ viewport: { width: 393, height: 659 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  test('efficiency dates fit their actual CSS-pixel spacing', async ({ page }, testInfo) => {
    await installRFixture(page, { populatedAnalytics: true, populatedAdmin: true, mode: 'dark' });
    const trips = weeksOfTrips();
    await page.route(/\/v1\/trips(\?|$)/, route => route.fulfill({ json: { items: trips, total: trips.length, page: 1, per_page: 200 } }));
    await page.goto('/efficiency');
    // The first load can wait for the dev server to compile the page.
    await expect(page).toHaveURL(/\/insights\/efficiency$/, { timeout: 20_000 });
    const chart = page.getByRole('region', { name: 'Average efficiency' }).getByRole('img', { name: 'Efficiency per week' });
    await chart.scrollIntoViewIfNeeded();
    await expect(chart).toBeVisible();
    const read = () => chart.evaluate(svg => {
      const frame = svg.getBoundingClientRect();
      const labels = [...svg.querySelectorAll('.ri-axis text')]
        .filter(node => /^[A-Z][a-z]{2} \d+$/.test(node.textContent ?? ''))
        .map(node => { const box = node.getBoundingClientRect(); return { text: node.textContent!, left: box.left, right: box.right }; })
        .sort((a, b) => a.left - b.left);
      return { left: frame.left, right: frame.right, labels };
    });
    await expect.poll(async () => (await read()).labels.length).toBeGreaterThanOrEqual(2);
    const { left, right, labels } = await read();
    for (const label of labels) {
      expect(label.left, label.text).toBeGreaterThanOrEqual(left);
      expect(label.right, label.text).toBeLessThanOrEqual(right);
    }
    for (let i = 1; i < labels.length; i++) {
      expect(labels[i]!.left - labels[i - 1]!.right, `${labels[i - 1]!.text} to ${labels[i]!.text}`).toBeGreaterThan(12);
    }
    await chart.screenshot({ path: testInfo.outputPath('iphone-3x-efficiency-dates.png') });
  });
});
