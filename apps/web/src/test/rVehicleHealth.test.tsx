import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  role: 'owner' as 'owner' | 'manager' | 'viewer',
  gaps: [] as unknown[],
  parallaxQuiet: null as null | { last_frame_at: string; moved_at: string },
  recover: vi.fn(),
  status: {
    doors_locked: true,
    door_front_left_closed: true,
    door_front_right_closed: true,
    door_rear_left_closed: true,
    door_rear_right_closed: true,
    closure_frunk_closed: true,
    closure_liftgate_closed: true,
    field_availability: {},
  } as Record<string, unknown>,
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => <a href={to} {...props}>{children}</a>,
}));
vi.mock('../features/r-experience/RAppLayout', () => ({
  RAppLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock('../components/layout/NoVehicleState', () => ({
  NoVehicleState: ({ title }: { title: string }) => <p>{title}</p>,
}));
vi.mock('../components/feedback/toast', () => ({ emitToast: vi.fn() }));
vi.mock('@riviamigo/hooks', () => ({
  useAuth: () => ({ setActiveVehicleId: vi.fn() }),
  useResolvedVehicleSelection: () => ({
    authReady: true,
    vehicleSelectionReady: true,
    effectiveVehicleId: 'veh-1',
    vehicles: [{ id: 'veh-1', model: 'R2', display_name: 'R2', membership_role: mocks.role, target_tire_pressure_psi: 40 }],
  }),
  useVehicleHealth: () => ({
    isLoading: false,
    data: {
      vehicle: { model: 'R2', name: 'R2' },
      runtime: { worker_health: 'connected', last_event_at: new Date().toISOString() },
      latest: { ts: new Date().toISOString(), twelve_volt_health: 'good', hv_thermal_event: 'none' },
      tires: null,
      closures: null,
      software_history: [{ version: '2026.35', installed_at: '2026-10-20T00:00:00Z', observed_until: null }],
      current_software_version: '2026.35',
      thermal_events_30d: 2,
      extended_telemetry: { parallax: { status: 'connected', last_frame_at: new Date().toISOString() } },
    },
  }),
  useCurrentVehicleStatus: () => ({ data: mocks.status }),
  useTripGaps: () => ({ data: { gaps: mocks.gaps, parallax_quiet: mocks.parallaxQuiet, lookback_days: 7 } }),
  useRecoverTripGap: () => ({ mutate: mocks.recover, isPending: false }),
}));

import { RVehicleHealth } from '../features/r-experience/RVehicleHealth';
import { emitToast } from '../components/feedback/toast';
import { RMissedDriveBanner } from '../features/r-experience/RMissedDrives';

const gap = {
  id: '0123456789abcdef0123456789abcdef',
  started_at: '2026-10-26T04:13:21Z',
  ended_at: '2026-10-26T05:22:25Z',
  distance_miles: 42.87,
  duration_seconds: 4144,
  soc_start: 70.2,
  soc_end: 51.9,
};

describe('R vehicle health', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.role = 'owner';
    mocks.gaps = [];
    mocks.parallaxQuiet = null;
    mocks.recover.mockReset();
  });

  it('summarizes status, doors and unreported diagnostics without per-door rows', () => {
    render(<RVehicleHealth />);
    expect(screen.getByRole('heading', { level: 1, name: 'Vehicle health' })).toBeInTheDocument();
    const summary = screen.getByRole('region', { name: 'Status summary' });
    expect(within(summary).getByText('Live')).toBeInTheDocument();
    expect(within(summary).getByText('2026.35')).toBeInTheDocument();
    expect(screen.getByText('All closed · Locked')).toBeInTheDocument();
    expect(screen.queryByText(/front left door/i)).not.toBeInTheDocument();
    expect(screen.getByText(/sensors not reported by this vehicle/)).toBeInTheDocument();
    expect(screen.queryByText('Possible missed drive')).not.toBeInTheDocument();
  });

  it('recovers a missed drive only after confirmation', () => {
    mocks.gaps = [gap];
    render(<RVehicleHealth />);
    const card = screen.getByRole('region', { name: 'Possible missed drive' });
    expect(within(card).getByText(/42\.9 mi · 1h 9m · 70% → 52%/)).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Recover trip' }));
    expect(mocks.recover).not.toHaveBeenCalled();
    fireEvent.click(within(card).getByRole('button', { name: 'Confirm recovery' }));
    expect(mocks.recover).toHaveBeenCalledWith(gap.id, expect.any(Object));
  });

  it('cancels confirmation without recovering', () => {
    mocks.gaps = [gap];
    render(<RVehicleHealth />);
    fireEvent.click(screen.getByRole('button', { name: 'Recover trip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Recover trip' })).toBeInTheDocument();
    expect(mocks.recover).not.toHaveBeenCalled();
  });

  it('moves keyboard focus between recover, confirm and cancel', () => {
    mocks.gaps = [gap];
    render(<RVehicleHealth />);
    fireEvent.click(screen.getByRole('button', { name: 'Recover trip' }));
    expect(screen.getByRole('button', { name: 'Confirm recovery' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Recover trip' })).toHaveFocus();
  });

  it('explains when the drive is no longer listed', () => {
    mocks.gaps = [gap];
    mocks.recover.mockImplementation((_id: string, options: { onError: (error: unknown) => void }) =>
      options.onError(Object.assign(new Error('404'), { status: 404 })));
    render(<RVehicleHealth />);
    fireEvent.click(screen.getByRole('button', { name: 'Recover trip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm recovery' }));
    expect(emitToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Drive no longer listed', variant: 'info' }));
  });

  it('does not offer recovery to viewers', () => {
    mocks.role = 'viewer';
    mocks.gaps = [gap];
    render(<RVehicleHealth />);
    expect(screen.queryByRole('button', { name: 'Recover trip' })).not.toBeInTheDocument();
    expect(screen.getByText('An owner or manager can recover this drive.')).toBeInTheDocument();
  });

  it('remembers a dismissed gap on this device', () => {
    mocks.gaps = [gap];
    const { unmount } = render(<RVehicleHealth />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Possible missed drive')).not.toBeInTheDocument();
    unmount();
    render(<RVehicleHealth />);
    expect(screen.queryByText('Possible missed drive')).not.toBeInTheDocument();
  });

  it('warns when Parallax went quiet while the car moved', () => {
    mocks.parallaxQuiet = { last_frame_at: '2026-10-26T00:13:03Z', moved_at: '2026-10-26T04:13:21Z' };
    render(<RVehicleHealth />);
    expect(screen.getByRole('status')).toHaveTextContent(/live stream has sent nothing/);
    expect(within(screen.getByRole('region', { name: 'Status summary' })).getByText('Partial')).toBeInTheDocument();
  });

  it('links the Trips banner to the recovery card', () => {
    mocks.gaps = [gap];
    render(<RMissedDriveBanner vehicleId="veh-1" />);
    expect(screen.getByRole('link', { name: /1 possible missed drive/ })).toHaveAttribute('href', '/vehicle-health');
  });
});
