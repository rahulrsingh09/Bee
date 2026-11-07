import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const selection = { authReady: true, vehicleSelectionReady: true, effectiveVehicleId: 'v1' as string | null, vehicles: [{ id: 'v1', membership_role: 'owner' }] };
vi.mock('@riviamigo/hooks', () => ({ useResolvedVehicleSelection: () => selection }));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-router')>(),
  useParams: () => ({ sessionId: 'session-xyz' }),
}));
vi.mock('../../components/layout/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('../../components/layout/NoVehicleState', () => ({ NoVehicleState: ({ title }: { title: string }) => <p>{title}</p> }));
vi.mock('./detail/ChargeDetailView', () => ({
  ChargeDetailView: (props: { sessionId: string; vehicleId: string; canManage: boolean }) => <div data-testid="view">{JSON.stringify(props)}</div>,
}));

import { ChargeSessionContent } from './ChargeSessionDetailPage';

beforeEach(() => {
  selection.authReady = true;
  selection.effectiveVehicleId = 'v1';
  selection.vehicles = [{ id: 'v1', membership_role: 'owner' }];
});

describe('ChargeSessionContent', () => {
  it('passes the session, vehicle and manage right to the view', () => {
    render(<ChargeSessionContent />);
    expect(screen.getByTestId('view')).toHaveTextContent('{"sessionId":"session-xyz","vehicleId":"v1","canManage":true}');
  });

  it('gives a viewer no manage right', () => {
    selection.vehicles = [{ id: 'v1', membership_role: 'viewer' }];
    render(<ChargeSessionContent />);
    expect(screen.getByTestId('view')).toHaveTextContent('"canManage":false');
  });

  it('asks for a vehicle when none is selected', () => {
    selection.effectiveVehicleId = null;
    render(<ChargeSessionContent />);
    expect(screen.getByText('No vehicle selected')).toBeInTheDocument();
  });
});
