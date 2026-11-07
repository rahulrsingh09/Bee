import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Insight, Place, Trip } from '@riviamigo/types';

vi.mock('@riviamigo/ui/primitives', async () => import('../../../test/mockPrimitives'));
vi.mock('@riviamigo/ui/hooks', () => ({ useDocumentTheme: () => true, useDocumentPalette: () => 'classic' }));

const navigate = vi.fn();
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-router')>(),
  useNavigate: () => navigate,
  useParams: () => ({ tripId: 'trip-1' }),
}));

const chartProps: Array<Record<string, unknown>> = [];
vi.mock('@riviamigo/ui/charts', () => ({
  CHART_COLORS: { accent: 'var(--a)', success: 'var(--s)', teal: 'var(--t)', muted: 'var(--m)' },
  nearestPointIndex: () => 0,
  TripMapChart: ({ activePoint }: { activePoint: { lat: number } | null }) => (
    <div data-testid="trip-map" data-active-lat={activePoint?.lat ?? ''} />
  ),
  RichTimeSeriesChart: (props: Record<string, unknown> & { series: Array<{ label: string }>; activeCursorIndex: number | null }) => {
    chartProps.push(props);
    return <div data-testid="time-chart" data-cursor={props.activeCursorIndex ?? ''}>{props.series.map(item => item.label).join(', ')}</div>;
  },
}));

vi.mock('@riviamigo/dashboards', () => ({
  TripTagPicker: ({ label }: { label: string }) => <input aria-label={label} />,
}));

const mutateAsync = vi.fn(async () => undefined);
const state: {
  trip: Partial<Trip> & { id: string };
  insights: Insight[];
  places: Place[];
  altitude: number[];
  vehicleId: string | null;
  detail?: { trip: unknown; altitude: number[]; result: unknown };
} = { trip: { id: 'trip-1' }, insights: [], places: [], altitude: [], vehicleId: 'vehicle-1' };

vi.mock('@riviamigo/hooks', () => ({
  useAuth: () => ({ accessToken: null }),
  useBasemapConfig: () => ({ data: undefined, isError: false, refetch: vi.fn() }),
  useUserPreferences: () => ({ data: { map_style: 'follow-theme' } }),
  useResolvedVehicleSelection: () => ({
    authReady: true, vehicleSelectionReady: true, effectiveVehicleId: state.vehicleId,
    vehicles: [{ id: 'vehicle-1', membership_role: 'owner' }],
  }),
  useUpdateTripTagAssignments: () => ({ isPending: false, mutateAsync }),
  useSavedPlaces: () => ({ data: state.places }),
  useInsights: () => ({ data: { insights: state.insights } }),
  // Stable data per render, as React Query returns it.
  useTripDetailData: () => {
    if (state.detail?.trip === state.trip && state.detail.altitude === state.altitude) return state.detail.result;
    const count = 31;
    const series = (value: (index: number) => number | null) => Array.from({ length: count }, (_, index) => value(index));
    const result = {
      isLoading: false, isError: false, refetch: vi.fn(),
      data: {
        trip: state.trip,
        sample_interval_seconds: 60,
        samples: {
          elapsed_s: series(index => index * 60),
          lat: series(index => 47.6 + index * .001), lng: series(() => -122.34),
          altitude_m: series(index => state.altitude[index] ?? 20),
          speed_mph: series(index => 20 + index), power_kw: series(index => (index % 5 === 4 ? 0 : 18)),
          regen_power_kw: series(index => (index % 5 === 4 ? -9 : 0)), battery_level: series(index => 49 - index / 6),
          outside_temp_c: series(() => 8), cabin_temp_c: series(() => 21), driver_temp_c: series(() => 21),
          hvac_active: series(() => 1).map(() => true),
          tire_fl_psi: series(() => 44), tire_fr_psi: series(() => 45), tire_rl_psi: series(() => 44), tire_rr_psi: series(() => 45),
        },
        outside_temperature: { source: 'vehicle', attribution: null, samples: [] },
      },
    };
    state.detail = { trip: state.trip, altitude: state.altitude, result };
    return result;
  },
}));

vi.mock('../../../components/layout/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('../../../components/layout/NoVehicleState', () => ({ NoVehicleState: ({ title }: { title: string }) => <p>{title}</p> }));

import { TripDetailContent } from '../TripDetailPage';
import { tripSubtitle } from './TripDetailView';

const baseTrip: Partial<Trip> & { id: string } = {
  id: 'trip-1', vehicle_id: 'vehicle-1', started_at: '2026-10-08T15:12:00Z', ended_at: '2026-10-09T03:00:00Z',
  distance_mi: 15.2, duration_min: 30, energy_used_kwh: 4.5, efficiency_wh_mi: 296, drive_mode: 'all_purpose',
  soc_start: 49, soc_end: 44, start_odometer_mi: 12452, end_odometer_mi: 12467, start_place: 'Home', end_place: 'Office',
  tags: [{ id: 'tag-1', vehicle_id: 'vehicle-1', name: 'commute', color_token: 'accent', created_by: '', created_at: '', updated_at: '' }],
};

const routeComparison = (tripId: string): Insight => ({
  id: `route_comparison:trip:${tripId}`, kind: 'route_comparison', severity: 'info', sample_size: 12,
  baseline: { method: 'median', window: 'earlier_drives_same_route', count: 12 },
  evidence: [{ type: 'trip', id: tripId }],
  values: { this_mi_per_kwh: 3.4, usual_mi_per_kwh: 3.1, pct_diff: 9.7, rank: 3, count: 12 },
});

const homePlace: Place = {
  id: 'home', name: 'Home', latitude: 0, longitude: 0, radius_m: 100, is_home: true, is_work: false, address: null,
  charging: { id: 'rate', name: 'Home', billing_type: 'per_kwh', rate: 0.12, session_fee: 0, currency: 'USD', timezone: null, tou_periods: [] },
};

beforeEach(() => {
  localStorage.setItem('rm-app-timezone', 'America/Los_Angeles');
  localStorage.removeItem('rm-unit-preferences');
  state.trip = { ...baseTrip };
  state.insights = [routeComparison('trip-1')];
  state.places = [homePlace];
  state.altitude = [];
  state.vehicleId = 'vehicle-1';
  chartProps.length = 0;
  navigate.mockClear();
  mutateAsync.mockClear();
});

afterEach(() => vi.useRealTimers());

describe('trip detail page', () => {
  it('leads with the route, odometer and the four trip numbers', () => {
    render(<TripDetailContent />);
    expect(screen.getByRole('heading', { level: 1, name: 'Home → Office' })).toBeInTheDocument();
    expect(screen.getByText('Thu, Oct 8 · 8:12–8:42 AM')).toBeInTheDocument();
    expect(screen.getByTestId('trip-distance')).toHaveTextContent('15.2mi');
    expect(screen.getByTestId('trip-odometer')).toHaveTextContent('12,467mi');
    expect(screen.getByText('Odometer 12,452 → 12,467 mi · battery 49% → 44%')).toBeInTheDocument();
    const tile = (label: string) => document.querySelector(`[data-trip-tile="${label}"]`);
    expect(tile('Efficiency')).toHaveTextContent('3.4mi/kWh10% better than your usual on this route');
    expect(tile('Energy used')).toHaveTextContent(/4\.5kWhRegen returned \d\.\d kWh/);
    expect(tile('Cost')).toHaveTextContent('$0.54At your home price of $0.12/kWh');
    expect(tile('Average speed')).toHaveTextContent('30mphOver 30 min');
    const body = document.body.textContent ?? '';
    for (const banned of ['->', 'Avg. Effic.', 'TeslaMate', 'Drive Chart', '—']) expect(body).not.toContain(banned);
  });

  it('hides the odometer, cost and route comparison when the data is missing', () => {
    state.trip = { ...baseTrip, start_odometer_mi: null, end_odometer_mi: null };
    state.places = [];
    state.insights = [routeComparison('trip-2')];
    render(<TripDetailContent />);
    expect(screen.queryByTestId('trip-odometer')).not.toBeInTheDocument();
    expect(screen.getByText('Battery 49% → 44%')).toBeInTheDocument();
    expect(document.querySelector('[data-trip-tile="Cost"]')).toBeNull();
    expect(document.querySelector('[data-trip-tile="Efficiency"]')).toHaveTextContent('3.4mi/kWh');
    expect(screen.queryByText(/than your usual/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'This route over time' })).not.toBeInTheDocument();
  });

  it('shows one-axis power with a zero line and minute axis, the speed bands and the route history', () => {
    render(<TripDetailContent />);
    const power = chartProps.find(props => (props.series as Array<{ key: string }>).some(series => series.key === 'power'))!;
    expect(power.yUnit).toBe('kW');
    expect((power.series as Array<{ yScale?: string }>).every(series => series.yScale !== 'y2')).toBe(true);
    expect(power.yRightUnit).toBeUndefined();
    expect(power.referenceLines).toEqual([{ value: 0, color: 'var(--m)' }]);
    expect(power.xSplits).toEqual([0, 600, 1200, 1800]);
    expect((power.xValueFormatter as (value: number) => string)(600)).toBe('10 min');

    const speed = screen.getByRole('heading', { name: 'Time at each speed' }).closest('section')!;
    expect(speed).toHaveTextContent('Speed recorded for 30 of 30 min.');
    expect(within(speed).getByRole('list', { name: 'Minutes at each speed, mph' })).toBeInTheDocument();
    expect(speed).toHaveTextContent('20–30 mph10 min');

    const history = screen.getByRole('heading', { name: 'This route over time' }).closest('section')!;
    expect(history).toHaveTextContent('12 earlier drives on this route.');
    expect(history).toHaveTextContent('Your usual3.1 mi/kWh');
    expect(history).toHaveTextContent('This drive3.4 mi/kWh · 3rd best of 13 drives');
  });

  it('lists conditions and shows the elevation chart only for a change of more than 100 ft', () => {
    const { unmount } = render(<TripDetailContent />);
    const conditions = screen.getByRole('heading', { name: 'Conditions' }).closest('section')!;
    expect(conditions).toHaveTextContent('Outside46 °F');
    expect(conditions).toHaveTextContent('Cabin70 °F · climate on');
    expect(conditions).toHaveTextContent('ElevationNo change');
    expect(conditions).toHaveTextContent('Tires44–45 psi');
    expect(conditions).toHaveTextContent('Drive modeAll-Purpose');
    expect(screen.queryByRole('heading', { name: 'Elevation along the route' })).not.toBeInTheDocument();
    unmount();

    state.altitude = Array.from({ length: 31 }, (_, index) => 10 + index * 1.2); // 36 m = 118 ft
    render(<TripDetailContent />);
    expect(screen.getByRole('heading', { name: 'Elevation along the route' })).toBeInTheDocument();
  });

  it('scrubbing moves the map dot, the chart cursor and the readout', () => {
    render(<TripDetailContent />);
    const readout = document.querySelector('[data-trip-readout]')!;
    expect(readout).toHaveTextContent('Speed20 mph');
    fireEvent.change(screen.getByRole('slider', { name: 'Drive time' }), { target: { value: '15' } });
    expect(readout).toHaveTextContent('Speed35 mph');
    expect(readout).toHaveTextContent('Power18.0 kW');
    expect(readout).toHaveTextContent('Battery47%');
    expect(screen.getAllByTestId('time-chart')[0]).toHaveAttribute('data-cursor', '15');
    expect(screen.getByTestId('trip-map')).toHaveAttribute('data-active-lat', String(47.6 + 15 * .001));
    expect(screen.getByRole('slider', { name: 'Drive time' })).toHaveAttribute('aria-valuetext', '15 min of 30 min, 8:27 AM');
  });

  it('plays the replay to the end only after the owner presses play', async () => {
    let now = 0;
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { frames.push(callback); return frames.length; });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    render(<TripDetailContent />);
    const slider = screen.getByRole('slider', { name: 'Drive time' });
    expect(frames).toHaveLength(0);
    expect(slider).toHaveValue('0');

    fireEvent.click(screen.getByRole('button', { name: 'Replay the drive' }));
    expect(screen.getByRole('button', { name: 'Pause the replay' })).toHaveAttribute('aria-pressed', 'true');
    const step = (ms: number) => act(() => { now = ms; frames.splice(0).forEach(frame => frame(now)); });
    step(5000);
    expect(slider).toHaveValue('15');
    step(10_000);
    expect(slider).toHaveValue('30');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Replay the drive' })).toHaveAttribute('aria-pressed', 'false'));
    vi.restoreAllMocks();
  });

  it('labels the tag action and saves tags', async () => {
    render(<TripDetailContent />);
    expect(screen.getByText('Commute')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit tags' }));
    expect(screen.getByRole('textbox', { name: 'Add tags to this trip' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save tags' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ trip_ids: ['trip-1'], tag_ids: ['tag-1'], mode: 'replace' }));
  });

  it('goes back to trips and shows the connect state without a vehicle', () => {
    const { unmount } = render(<TripDetailContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Back to trips' }));
    expect(navigate).toHaveBeenCalledWith({ to: '/trips' });
    unmount();
    state.vehicleId = null;
    render(<TripDetailContent />);
    expect(screen.getByText('No vehicle selected')).toBeInTheDocument();
  });

  it('writes the subtitle from the trip duration, not the end timestamp', () => {
    expect(tripSubtitle({ started_at: '2026-10-08T15:12:00Z' }, 1800, new Date('2026-11-07T00:00:00Z'))).toBe('Thu, Oct 8 · 8:12–8:42 AM');
    expect(tripSubtitle({ started_at: '2025-10-08T18:50:00Z' }, 1800, new Date('2026-11-07T00:00:00Z'))).toBe('Wed, Oct 8, 2025 · 11:50 AM–12:20 PM');
    expect(tripSubtitle({ started_at: 'bad' }, 1800)).toBeNull();
  });
});
