import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pathname: '/insights',
  status: null as null,
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, search, children, ...props }: { to: string; search?: Record<string, string>; children: React.ReactNode }) => (
    <a href={search ? `${to}?${new URLSearchParams(search)}` : to} {...props}>{children}</a>
  ),
  useLocation: () => ({ pathname: mocks.pathname }),
}));
vi.mock('../r-experience/useRConnection', () => ({
  useRConnection: () => ({ status: mocks.status, feed: null, renewal: null, onlineState: 'online', banner: null, vehicleId: null }),
}));
vi.mock('../../hooks/useThemePreferenceController', () => ({
  useThemePreferenceController: () => ({ mode: 'dark', onModeChange: vi.fn(), isPending: false }),
}));

import { InsightsHub } from './InsightsHub';
import { rFreshness } from '../r-experience/RAppLayout';

describe('Insights hub', () => {
  beforeEach(() => {
    mocks.pathname = '/insights';
    mocks.status = null;
  });

  it('lists the release 1 insight areas with one line each, without Lifetime', () => {
    render(<InsightsHub />);
    const list = screen.getByRole('navigation', { name: 'Insights' });
    const rows = within(list).getAllByRole('link');
    expect(rows.map(row => [row.querySelector('strong')?.textContent, row.getAttribute('href')])).toEqual([
      ['Cost', '/charging'],
      ['Battery', '/battery'],
      ['Parked loss', '/battery/phantom-drain'],
      ['Efficiency', '/efficiency'],
      ['Custom dashboards', '/settings?section=dashboards'],
    ]);
    rows.forEach(row => expect(row.querySelector('small')?.textContent).toBeTruthy());
    expect(screen.queryByText(/Lifetime/)).toBeNull();
  });

  it('renders inside the shell with four tabs and Insights active', () => {
    render(<InsightsHub />);
    const nav = screen.getByRole('navigation', { name: 'Primary navigation' });
    const tabs = within(nav).getAllByRole('link');
    expect(tabs.map(tab => tab.textContent)).toEqual(['Now', 'Activity', 'Insights', 'Car']);
    expect(within(nav).getByRole('link', { name: 'Insights' })).toHaveAttribute('aria-current', 'page');
    expect(tabs.filter(tab => tab.getAttribute('aria-current') === 'page')).toHaveLength(1);
  });
});

describe('rFreshness', () => {
  const now = Date.parse('2026-11-07T12:00:00Z');
  const at = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

  it.each([
    [0, false, 'Updated just now'],
    [2, false, 'Updated 2 min ago'],
    [59, false, 'Updated 59 min ago'],
    [125, false, 'Updated 2 h ago'],
    [72 * 60, false, 'Updated 3 days ago'],
    [0, true, 'No data for 1 min'],
    [6 * 60, true, 'No data for 6 h'],
  ])('reads %i minutes (stale %s) as "%s"', (minutes, stale, label) => {
    expect(rFreshness({ last_updated: at(minutes), telemetry_stale: stale }, now)?.label).toBe(label);
  });

  it('shows nothing without a valid status timestamp', () => {
    expect(rFreshness(null, now)).toBeNull();
    expect(rFreshness({ last_updated: null }, now)).toBeNull();
    expect(rFreshness({ last_updated: 'not a date' }, now)).toBeNull();
  });
});
