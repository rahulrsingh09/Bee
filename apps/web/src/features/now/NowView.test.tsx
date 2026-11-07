import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Insight, Vehicle, VehicleStatus } from '@riviamigo/types';
import { setAppTimezone } from '@riviamigo/ui/lib/dateTime';

const mocks = vi.hoisted(() => ({
  status: null as unknown,
  insights: [] as unknown[],
  ownerArt: null as string | null,
  trips: [] as unknown[],
  latestTrip: undefined as unknown,
  schedule: null as unknown,
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, search, children, ...props }: { to: string; params?: Record<string, string>; search?: Record<string, string>; children: React.ReactNode }) => {
    const path = Object.entries(params ?? {}).reduce((href, [key, value]) => href.replace(`$${key}`, value), to);
    return <a href={search ? `${path}?${new URLSearchParams(search)}` : path} {...props}>{children}</a>;
  },
}));

vi.mock('@riviamigo/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@riviamigo/hooks')>();
  const query = (data: unknown) => ({ data, isLoading: false, isError: false, isPlaceholderData: false, refetch: vi.fn() });
  return {
    ...actual,
    useCurrentVehicleStatus: () => query(mocks.status),
    useSavedPlaces: () => query([{ id: 'p', name: 'Home', latitude: 47.6, longitude: -122.3, radius_m: 100 }]),
    useChargingSchedule: () => query(mocks.schedule),
    useInsights: () => query({ insights: mocks.insights }),
    useTrips: (_id: string, from: string | null) => query({ items: from ? mocks.trips : mocks.latestTrip ? [mocks.latestTrip] : [] }),
    useChargeSessions: (_id: string, from: string | null) => query({ items: from ? [] : [{
      id: 'charge-1', started_at: '2026-11-07T04:00:00Z', ended_at: '2026-11-07T06:00:00Z', location_name: 'Home',
      charger_type: 'ac', energy_added_kwh: 20, duration_min: 120, soc_start: 40, soc_end: 65, cost_usd: 2.4,
    }] }),
    usePhantomDrainPeriods: () => query({ periods: [] }),
    useTripTrack: () => query([]),
    useVehicleArtwork: () => ({ src: mocks.ownerArt, restoring: false, isLoading: false, isError: false }),
    AuthenticatedVehicleArtwork: (props: { alt: string; className?: string }) => <img alt={props.alt} className={props.className} />,
  };
});

import { NowView } from './NowView';
import { NOW_MOTION_SESSION_KEY } from './useNowMotion';

const vehicle = {
  id: 'owner-vehicle', model: 'R2', trim: 'Performance', color: 'Launch Green', display_name: 'Your Rivian', images: null,
} as unknown as Vehicle;
const baseStatus = {
  vehicle_id: 'owner-vehicle', battery_level: 68, battery_limit: 80, range_miles: 218, odometer_miles: 12486,
  power_state: 'ready', charger_state: 'Disconnected', charger_status: 'chrgr_sts_not_connected', speed_mph: 0,
  latitude: 47.6, longitude: -122.3, doors_locked: true, last_updated: new Date().toISOString(),
} as unknown as VehicleStatus;
const insight = (kind: string, values: object, severity = 'attention') => ({ id: `${kind}:now`, kind, severity, values, baseline: null, sample_size: 1, evidence: [] }) as unknown as Insight;

class NoopObserver { observe() {} disconnect() {} unobserve() {} }

beforeEach(() => {
  setAppTimezone('UTC');
  vi.stubGlobal('IntersectionObserver', NoopObserver);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  sessionStorage.clear();
  mocks.status = baseStatus;
  mocks.insights = [];
  mocks.ownerArt = null;
  mocks.trips = [];
  mocks.latestTrip = { id: 'trip-1', started_at: '2026-11-07T17:00:00Z', ended_at: '2026-11-07T17:30:00Z', distance_mi: 18.4, duration_min: 34, efficiency_wh_mi: 320, start_place: 'Office', end_place: 'Home' };
  mocks.schedule = null;
});
afterEach(() => vi.unstubAllGlobals());

function reduceMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {},
  }));
}

describe('Now page', () => {
  it('orders status, chips, car, battery and range, odometer, then the story rail, with no charts or period picker', () => {
    reduceMotion(true);
    const { container } = render(<NowView vehicle={vehicle} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Parked at Home');
    expect(screen.getByText('Your Rivian · R2 Performance · Launch Green')).toBeInTheDocument();
    expect(screen.queryByText(/Catalina Cove/)).toBeNull();
    const chips = within(screen.getByRole('list', { name: 'Vehicle status' })).getAllByRole('listitem');
    expect(chips.map(chip => chip.textContent)).toEqual(['Locked', 'Unplugged']);
    expect(screen.getByRole('img', { name: 'Vehicle locked' })).toBeInTheDocument();
    const order = ['.now-header', '.now-car', '.now-energy', '.now-odometer', '.now-stories']
      .map(selector => container.querySelector(selector)!);
    order.reduce((previous, next) => {
      expect(previous.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      return next;
    });
    expect(screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual(['Odometer', 'Today']);
    expect(screen.getByRole('img', { name: 'Battery 68%, limit 80%' })).toBeInTheDocument();
    expect(screen.getByText('Limit 80%')).toBeInTheDocument();
    expect(screen.getByText('12,486 mi')).toBeInTheDocument();
    expect(screen.getByText('This week: No drives')).toBeInTheDocument();
    expect(container.querySelector('[data-dashboard-grid],[data-chart-id],[data-testid="sensor-chip"]')).toBeNull();
    expect(screen.queryByRole('button', { name: /date|period|chart/i })).toBeNull();
    expect(screen.queryByText(/Drag to turn/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Front|Reset vehicle view|Replay vehicle rotation/ })).toBeNull();
    expect(screen.getByRole('slider', { name: 'Your R2, Launch Green. Use arrow keys to turn.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Last drive/ })).toHaveAttribute('href', '/trips/trip-1');
    expect(screen.getByRole('link', { name: /Last charge/ })).toHaveAttribute('href', '/charging/charge-1');
    expect(screen.queryByRole('region', { name: 'Needs a look' })).toBeNull();
  });

  it('adds the days-of-range sentence, a scheduled charge and "Needs a look" only when the data says so', () => {
    reduceMotion(true);
    mocks.schedule = { enabled: true, start_time_minutes: 23 * 60 };
    mocks.insights = [
      insight('days_of_range', { range_mi: 218, median_daily_mi: 70, days: 3.1, days_with_data: 20 }, 'info'),
      insight('high_parked_loss', { loss_pct: 4, usual_loss_pct: 1.3, ratio: 3.1, duration_hours: 8.5, started_at: 'a', ended_at: 'b' }),
      insight('route_comparison', { this_mi_per_kwh: 3, usual_mi_per_kwh: 3, pct_diff: 0, rank: 1, count: 5 }, 'info'),
    ];
    render(<NowView vehicle={vehicle} />);
    expect(screen.getByText('Limit 80% · enough for about 3 days of your usual driving')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Vehicle status' })).getByText('Charges 11 PM')).toBeInTheDocument();
    const attention = screen.getByRole('region', { name: 'Needs a look' });
    expect(within(attention).getAllByRole('link')).toHaveLength(1);
    expect(within(attention).getByRole('link')).toHaveAttribute('href', '/battery/phantom-drain');
  });

  it('rests on the owner artwork and cross-fades to the frames while the car turns', () => {
    reduceMotion(true);
    mocks.ownerArt = '/v1/vehicle-image-cache/side.webp';
    const { container } = render(<NowView vehicle={vehicle} />);
    const car = container.querySelector('.now-car')!;
    expect(car).toHaveAttribute('data-rest', 'artwork');
    expect(car.querySelector('.now-car-artwork')).toHaveAttribute('src', '/v1/vehicle-image-cache/side.webp');
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(car).toHaveAttribute('data-rest', 'frames');
    expect(slider).toHaveAttribute('aria-valuenow', '290');
    fireEvent.keyDown(slider, { key: 'End' });
    expect(slider).toHaveAttribute('aria-valuenow', '280');
    expect(car).toHaveAttribute('data-rest', 'artwork');
  });

  it('turns to the side view on a double-tap', () => {
    reduceMotion(true);
    mocks.ownerArt = '/v1/vehicle-image-cache/side.webp';
    const { container } = render(<NowView vehicle={vehicle} />);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(slider).toHaveAttribute('aria-valuenow', '325');
    const tap = (type: string) => {
      const event = new MouseEvent(type, { bubbles: true, clientX: 100, clientY: 100, button: 0 });
      Object.assign(event, { pointerId: 1, isPrimary: true });
      fireEvent(slider, event);
    };
    tap('pointerdown'); tap('pointerup');
    tap('pointerdown'); tap('pointerup');
    expect(slider).toHaveAttribute('aria-valuenow', '280');
    expect(container.querySelector('.now-car')).toHaveAttribute('data-rest', 'artwork');
  });

  it('runs the data story on the first view of a session only', () => {
    reduceMotion(false);
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const first = render(<NowView vehicle={vehicle} />);
    expect(first.container.querySelector('.now-roll[data-animate]')).not.toBeNull();
    expect(first.container.querySelector('.now-limit-fill')).toHaveStyle({ transform: 'scaleX(0)' });
    expect(sessionStorage.getItem(NOW_MOTION_SESSION_KEY)).toBe('1');
    first.unmount();
    const again = render(<NowView vehicle={vehicle} />);
    expect(again.container.querySelector('.now-roll[data-animate]')).toBeNull();
    expect(again.container.querySelector('.now-limit-fill')).toHaveStyle({ transform: 'scaleX(0.68)' });
    expect(screen.getByText('12,486 mi')).toBeInTheDocument();
  });

  it('shows final values at once with reduced motion', () => {
    reduceMotion(true);
    const { container } = render(<NowView vehicle={vehicle} />);
    expect(container.querySelector('[data-animate]')).toBeNull();
    expect(container.querySelector('.now-viz-wipe')).toBeNull();
    expect(screen.getByLabelText('68%')).toHaveTextContent('68%');
  });

  it('names the charging place and the stale state without hiding the last known state', async () => {
    reduceMotion(true);
    mocks.status = { ...baseStatus, power_state: 'charging', charger_state: 'charging', telemetry_stale: true, doors_locked: false };
    mocks.insights = [insight('stale_data', { hours: 7, last_seen_at: '2026-11-07T07:00:00Z' })];
    await act(async () => { render(<NowView vehicle={vehicle} />); });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Charging at Home');
    expect(screen.getByRole('img', { name: 'Vehicle unlocked' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Needs a look' })).getByText('No data for 7 h')).toBeInTheDocument();
  });
});
