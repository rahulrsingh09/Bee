import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rNavigation, rNavigationTab, type RTabKey } from './RAppLayout';

// New upstream routes require an explicit R coverage decision before integration.
// Each reviewed route also names the tab that is active on it (release 1 mapping).
const reviewedRoutes: Record<string, RTabKey> = {
  '/': 'now',
  '/trips': 'activity',
  '/trips/$tripId': 'activity',
  '/charging/$sessionId': 'activity',
  '/insights': 'insights',
  '/charging': 'insights',
  '/battery': 'insights',
  '/battery/phantom-drain': 'insights',
  '/efficiency': 'insights',
  '/d/$slug': 'insights',
  '/settings/charts/$chartId': 'insights',
  '/settings/charts/new': 'insights',
  '/explore': 'insights',
  '/vehicle-health': 'car',
  '/settings': 'car',
  '/settings/themes/$themeId': 'car',
  '/connect': 'car',
  '/connect/otp': 'car',
  '/users': 'car',
  '/admin/dashboards': 'car',
  '/activate': 'car',
  '/login': 'car',
};

const sample = (path: string) => path.replace(/\$[A-Za-z]+/g, 'sample-id');

describe('R route coverage contract', () => {
  it('accounts for every registered route, including auth and compatibility URLs', () => {
    const root = resolve(process.cwd(), 'src');
    const tree = readFileSync(resolve(root, 'routeTree.ts'), 'utf8');
    const files = [...tree.matchAll(/from '\.\/routes\/([^']+)'/g)]
      .map(match => match[1]).filter(name => name !== '__root');
    const paths = files.map(file => {
      const source = readFileSync(resolve(root, `routes/${file}.tsx`), 'utf8');
      const path = source.match(/path: '([^']+)'/);
      expect(path, `Missing route path in ${file}`).not.toBeNull();
      return path![1];
    });
    expect(paths.sort()).toEqual(Object.keys(reviewedRoutes).sort());
  });

  it('keeps Explore only as a redirect to Insights', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/routes/explore.tsx'), 'utf8');
    expect(source).toMatch(/redirect\(\{ to: '\/insights', replace: true \}\)/);
    expect(source).not.toMatch(/component:/);
  });
});

describe('R navigation tabs', () => {
  it('shows four tabs in the release 1 order and targets', () => {
    expect(rNavigation.map(({ label, to }) => [label, to])).toEqual([
      ['Now', '/'], ['Activity', '/trips'], ['Insights', '/insights'], ['Car', '/vehicle-health'],
    ]);
  });

  it.each(Object.entries(reviewedRoutes))('maps %s to the %s tab', (path, tab) => {
    expect(rNavigationTab(sample(path))).toBe(tab);
  });

  it('keeps chart settings under Insights and every other settings page under Car', () => {
    expect(rNavigationTab('/settings/charts')).toBe('insights');
    expect(rNavigationTab('/settings/chartsx')).toBe('car');
    expect(rNavigationTab('/settings/')).toBe('car');
    expect(rNavigationTab('/trips/')).toBe('activity');
    expect(rNavigationTab('/charging/abc/curve')).toBe('insights');
    expect(rNavigationTab('/battery-other')).toBe('car');
  });
});
