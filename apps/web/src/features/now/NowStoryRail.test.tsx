import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChargeSession } from '@riviamigo/types';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, children, ...props }: { to: string; params?: Record<string, string>; children: React.ReactNode }) => {
    const path = Object.entries(params ?? {}).reduce((href, [key, value]) => href.replace(`$${key}`, value), to);
    return <a href={path} {...props}>{children}</a>;
  },
}));

vi.mock('@riviamigo/hooks', () => ({
  useTripTrack: () => ({ data: [], isPlaceholderData: false }),
}));

import { NowStoryRail } from './NowStoryRail';

const NOW = Date.parse('2026-11-07T18:00:00Z');
const CHARGE: ChargeSession = {
  id: 'charge-1', vehicle_id: 'v1', started_at: '2026-11-07T04:00:00Z', ended_at: '2026-11-07T04:30:00Z',
  location_name: 'Bellevue', charger_type: null, network_vendor: null, peak_power_kw: null,
  energy_added_kwh: 30, duration_min: 30, soc_start: 40, soc_end: 70, cost_usd: null,
};

function renderRail(charge: ChargeSession) {
  return render(
    <NowStoryRail vehicleId="v1" trip={undefined} charge={charge} park={undefined} insights={[]}
      loading={false} failed={false} onRetry={vi.fn()} now={NOW} animate={false} />,
  );
}

describe('NowStoryRail charge kind', () => {
  it('uses the charge detail rule: the network or the power marks a DC charge with no charger type', () => {
    const { container, unmount } = renderRail({ ...CHARGE, network_vendor: 'Tesla' });
    expect(screen.getByRole('heading', { level: 3, name: 'Bellevue · DC fast' })).toBeInTheDocument();
    expect(container.querySelector('.now-span-track')).toHaveAttribute('data-kind', 'dc');
    unmount();
    renderRail({ ...CHARGE, peak_power_kw: 150 });
    expect(screen.getByRole('heading', { level: 3, name: 'Bellevue · DC fast' })).toBeInTheDocument();
  });

  it('says AC only for an AC charge', () => {
    const { unmount } = renderRail({ ...CHARGE, charger_type: 'ac' });
    expect(screen.getByRole('heading', { level: 3, name: 'Bellevue · AC' })).toBeInTheDocument();
    unmount();
    renderRail({ ...CHARGE, peak_power_kw: 11 });
    expect(screen.getByRole('heading', { level: 3, name: 'Bellevue · AC' })).toBeInTheDocument();
  });

  it('does not say AC when the charge type is not known', () => {
    const { container } = renderRail(CHARGE);
    expect(screen.getByRole('heading', { level: 3, name: 'Bellevue' })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\bAC\b/);
    expect(container.querySelector('.now-span-track')).toHaveAttribute('data-kind', 'unknown');
  });
});
