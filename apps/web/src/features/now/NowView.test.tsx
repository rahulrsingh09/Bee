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
    AuthenticatedVehicleArtwork: ({ source, fallbackSource, fallbackProps: _fallbackProps, onFallbackChange: _onFallbackChange, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & {
      source?: string | null; fallbackSource?: string | null; fallbackProps?: unknown; onFallbackChange?: unknown;
    }) => <img {...props} src={source ?? fallbackSource ?? undefined} />,
  };
});

import { NowView } from './NowView';
import { NOW_MOTION_SESSION_KEY } from './useNowMotion';

const vehicle = {
  id: 'owner-vehicle', model: 'R2', trim: 'Performance', color: 'Launch Green', display_name: 'Your Rivian', images: null,
} as unknown as Vehicle;
const art = (placement: string, design: string, file: string, source = 'vehicle:photo') =>
  ({ placement, design, size: 'large', resolution: null, url: `/art/${file}.png`, metadata: { source } });
const turningVehicle = {
  ...vehicle,
  images: {
    all: [
      art('overhead', 'light', 'overhead-light'), art('side-charging', 'light', 'charging-light'),
      art('rear', 'light', 'rear-light'), art('side', 'light', 'side-light'), art('front', 'light', 'front-light'),
      // Light design only: the test theme may be dark, and the other design is used when the theme design is missing.
      art('front-three-quarter', 'light', 'fq-light'), art('side', 'light', 'side-cel', 'vehicle:cel'),
    ],
    side: { light: '/art/side-light.png', dark: '/art/side-light.png' },
  },
} as unknown as Vehicle;
const baseStatus = {
  vehicle_id: 'owner-vehicle', battery_level: 68, battery_limit: 80, range_miles: 218, odometer_miles: 12486,
  power_state: 'ready', charger_state: 'Disconnected', charger_status: 'chrgr_sts_not_connected', speed_mph: 0,
  latitude: 47.6, longitude: -122.3, doors_locked: true, last_updated: new Date().toISOString(),
} as unknown as VehicleStatus;
const insight = (kind: string, values: object, severity = 'attention') => ({ id: `${kind}:now`, kind, severity, values, baseline: null, sample_size: 1, evidence: [] }) as unknown as Insight;

class NoopObserver { observe() {} disconnect() {} unobserve() {} }

beforeEach(() => {
  // The fixture events are dated 2026-11-07; pin the clock so 'Today' and the week stay stable on any run date.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-07T20:00:00Z'));
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
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function reduceMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {},
  }));
}

describe('Now page', () => {
  it('orders status, chips, car, battery and range, odometer, then the story rail, with no charts or period picker', () => {
    reduceMotion(true);
    const { container } = render(<NowView vehicle={turningVehicle} />);
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

  it('turns through the owner images only: rests on the side, steps with arrow keys and wraps around', () => {
    reduceMotion(true);
    const { container } = render(<NowView vehicle={turningVehicle} />);
    const car = container.querySelector('.now-car')!;
    expect(car).toHaveAttribute('data-mode', 'turn');
    expect(car.querySelector('canvas')).toBeNull();
    expect(car.querySelector('.r-orbit-poster')).toBeNull();
    const layers = [...car.querySelectorAll('img.r-orbit-angle')];
    expect(layers.map(layer => layer.getAttribute('src'))).toEqual(['/art/front-light.png', '/art/fq-light.png', '/art/side-light.png', '/art/rear-light.png']);
    const slider = screen.getByRole('slider', { name: 'Your R2, Launch Green. Use arrow keys to turn.' });
    expect(slider).toHaveAttribute('aria-valuetext', 'Side');
    expect(car.querySelector('img[data-active]')).toHaveAttribute('src', '/art/side-light.png');
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(slider).toHaveAttribute('aria-valuetext', 'Front three-quarter');
    expect(car.querySelector('img[data-active]')).toHaveAttribute('src', '/art/fq-light.png');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider).toHaveAttribute('aria-valuetext', 'Rear');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider).toHaveAttribute('aria-valuetext', 'Front');
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(slider).toHaveAttribute('aria-valuetext', 'Side');
    expect(screen.queryByText(/Drag to turn|double-tap/i)).toBeNull();
  });

  it('turns back to the side view on a double-tap and rounds a drag to the nearest angle', () => {
    reduceMotion(true);
    render(<NowView vehicle={turningVehicle} />);
    const slider = screen.getByRole('slider');
    Object.defineProperty(slider, 'clientWidth', { value: 400 });
    const pointer = (type: string, clientX: number) => {
      const event = new MouseEvent(type, { bubbles: true, clientX, clientY: 100, button: 0 });
      Object.assign(event, { pointerId: 1, isPrimary: true });
      fireEvent(slider, event);
    };
    // One step is 100 px at 400 px wide; 130 px rounds to one step.
    pointer('pointerdown', 100); pointer('pointermove', 180); pointer('pointermove', 230); pointer('pointerup', 230);
    expect(slider).toHaveAttribute('aria-valuetext', 'Rear');
    pointer('pointerdown', 100); pointer('pointerup', 100);
    pointer('pointerdown', 100); pointer('pointerup', 100);
    expect(slider).toHaveAttribute('aria-valuetext', 'Side');
  });

  it('shows one owner image with no turn control when fewer than two owner images exist', () => {
    reduceMotion(true);
    const single = { ...vehicle, images: { all: [{ placement: 'side', design: 'light', size: 'large', resolution: null, url: '/art/side-light.png' }] } } as unknown as Vehicle;
    const { container } = render(<NowView vehicle={single} />);
    expect(container.querySelector('.now-car')).toHaveAttribute('data-mode', 'static');
    expect(screen.getByRole('img', { name: 'Your R2, Launch Green' })).toHaveAttribute('src', '/art/side-light.png');
    expect(screen.queryByRole('slider')).toBeNull();
    expect(container.querySelector('.now-car canvas')).toBeNull();
  });

  it('never shows the bundled orbit frames for an R2 without owner images', () => {
    reduceMotion(true);
    const { container } = render(<NowView vehicle={vehicle} />);
    expect(container.querySelector('.now-car')).toHaveAttribute('data-mode', 'static');
    expect(screen.getByRole('img', { name: 'Your R2, Launch Green' })).toHaveAttribute('src', '/vehicle-images/fallbacks/r2s/side.webp');
    expect(screen.queryByRole('slider')).toBeNull();
    expect(container.querySelector('.now-car canvas, .r-orbit-poster')).toBeNull();
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
