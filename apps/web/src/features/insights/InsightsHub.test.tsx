import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pathname: '/insights',
  status: null as null | { last_updated: string | null; telemetry_stale?: boolean },
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, search, children, ...props }: { to: string; search?: Record<string, string>; children: React.ReactNode }) => (
    <a href={search ? `${to}?${new URLSearchParams(search)}` : to} {...props}>{children}</a>
  ),
  useLocation: () => ({ pathname: mocks.pathname }),
}));
vi.mock('../r-experience/useRConnection', () => ({
  useRConnection: () => ({ status: mocks.status, feed: null, renewal: null, onlineState: 'online' }),
}));

import { InsightsHub } from './InsightsHub';
import { RAppLayout, rFreshness } from '../r-experience/RAppLayout';

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

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

describe('R shell top bar', () => {
  beforeEach(() => {
    mocks.pathname = '/vehicle-health';
    mocks.status = null;
  });

  it('shows only the R mark and the freshness, without theme, Settings or Sign-out controls', () => {
    mocks.status = { last_updated: minutesAgo(2), telemetry_stale: false };
    const { container } = render(<RAppLayout activeKey="health"><p>Body</p></RAppLayout>);
    const header = container.querySelector('header')!;
    expect(within(header).getByRole('link', { name: 'R overview' })).toHaveAttribute('href', '/');
    expect(within(header).getByText('Updated 2 min ago')).toBeInTheDocument();
    expect(header.querySelector('.r-freshness')).toHaveAttribute('data-state', 'live');
    expect(within(header).queryByRole('button')).toBeNull();
    expect(within(header).queryByRole('link', { name: 'Settings' })).toBeNull();
    expect(within(screen.getByRole('navigation', { name: 'Primary navigation' })).getByRole('link', { name: 'Car' }))
      .toHaveAttribute('aria-current', 'page');
  });

  it('marks stale telemetry with the warning state and the no-data age', () => {
    mocks.status = { last_updated: minutesAgo(6 * 60 + 5), telemetry_stale: true };
    const { container } = render(<RAppLayout activeKey="health"><p>Body</p></RAppLayout>);
    expect(screen.getByText('No data for 6 h')).toBeInTheDocument();
    expect(container.querySelector('.r-freshness')).toHaveAttribute('data-state', 'stale');
  });

  it('renders the footer slot after the page body', () => {
    render(<RAppLayout activeKey="health" footer={<a href="/settings">Settings</a>}><p>Body</p></RAppLayout>);
    const page = screen.getByText('Body').parentElement!;
    expect(page.lastElementChild).toHaveTextContent('Settings');
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
