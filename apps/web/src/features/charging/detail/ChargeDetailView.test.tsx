import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChargeCurvePoint, ChargeSession, Insight, Place } from '@riviamigo/types';

vi.mock('@riviamigo/ui/primitives', async () => import('../../../test/mockPrimitives'));

const navigate = vi.fn();
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-router')>(),
  useNavigate: () => navigate,
}));

vi.mock('@riviamigo/dashboards', async () => {
  const insight = await import('../../../../../../packages/dashboards/src/widgets/chart/chargeCurveInsight');
  return { describeChargeCurve: insight.describeChargeCurve };
});

const mutateAsync = vi.fn(async (body: Record<string, unknown>) => ({ ...state.session, ...body }));
const createPlace = vi.fn(async (body: { name: string }) => ({ id: 'new-place', ...body }));
const updatePlace = vi.fn(async (_id: string, body: { name: string }) => ({ id: _id, ...body }));

// Synthetic DC charge shaped like the design prototype: 40% → 71% in 22 min, peak 108 kW at 44%.
const SOC = [40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71];
const KW = [60, 100, 102.7, 105.3, 108, 107.5, 107, 106.5, 106, 105.5, 105, 102.5, 100, 97.4, 94.9, 92.4, 89.9, 87.3, 84.8, 82.3, 79.8, 77.2, 74.7, 72.2, 69.7, 67.1, 64.6, 62.1, 59.6, 57, 54.5, 52];
const T = [0, 0.73, 1.31, 1.87, 2.42, 2.96, 3.51, 4.06, 4.61, 5.16, 5.71, 6.28, 6.86, 7.45, 8.06, 8.68, 9.32, 9.98, 10.66, 11.36, 12.09, 12.83, 13.6, 14.4, 15.22, 16.08, 16.97, 17.89, 18.85, 19.85, 20.9, 22];
const CURVE: ChargeCurvePoint[] = SOC.map((soc, index) => ({ minutes_elapsed: T[index]!, soc_pct: soc, power_kw: KW[index]!, power_method: 'recorded' }));

const SESSION: ChargeSession = {
  id: 'charge-dc', vehicle_id: 'vehicle-1', started_at: '2026-11-06T16:08:00Z', ended_at: '2026-11-06T16:30:00Z',
  location_name: 'Bellevue', charger_type: 'dc', energy_added_kwh: 28.6, duration_min: 22, soc_start: 40, soc_end: 71,
  peak_power_kw: 108, cost_usd: null, cost_method: 'unknown', network_vendor: 'Tesla', is_public: true,
  rivian_city: 'Bellevue', location_lat: 47.61, location_lng: -122.2, range_added_km: 148.06,
};

const SHAPE: Insight = {
  id: 'charge_shape:charge:charge-dc', kind: 'charge_shape', severity: 'info', baseline: null, sample_size: 32, evidence: [],
  values: { peak_kw: 108, peak_soc: 44, peak_minute: 2.42, low_kw: 52, low_soc: 71, phases: [
    { name: 'climb', start_min: 0, end_min: 2, from_kw: 60, to_kw: 108 },
    { name: 'peak', start_min: 2, end_min: 6, from_kw: 108, to_kw: 105 },
    { name: 'taper', start_min: 6, end_min: 22, from_kw: 105, to_kw: 52 },
  ] },
};
const BAND: Insight = {
  id: 'usual_dc_band:charge:charge-dc', kind: 'usual_dc_band', severity: 'info', sample_size: 3, evidence: [],
  baseline: { method: 'p10_p90', window: 'earlier_dc_charges', count: 3 },
  values: { bands: SOC.map((soc, index) => ({ soc, p10_kw: KW[index]! * 0.9 - 6, p90_kw: KW[index]! * 1.1 + 6, sessions: 3 })), sessions: 3, within_band_pct: 94, compared_bins: 32 },
};

const state: { session: ChargeSession; curve: ChargeCurvePoint[]; insights: Insight[]; places: Place[] } = {
  session: SESSION, curve: CURVE, insights: [SHAPE, BAND], places: [],
};

vi.mock('@riviamigo/hooks', () => ({
  api: { createPlace: (body: { name: string }) => createPlace(body), updatePlace: (id: string, body: { name: string }) => updatePlace(id, body) },
  invalidateChargingData: vi.fn(),
  useChargeSession: () => ({ data: state.session, isError: false, refetch: vi.fn() }),
  useChargeCurve: () => ({ data: state.curve, isLoading: false }),
  useSavedPlaces: () => ({ data: state.places, isSuccess: true, isLoading: false, isFetching: false, isError: false }),
  useInsights: () => ({ data: { insights: state.insights } }),
  useUpdateChargeSession: () => ({ mutateAsync, isPending: false }),
}));

import { ChargeDetailView } from './ChargeDetailView';

function renderView(canManage = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ChargeDetailView sessionId="charge-dc" vehicleId="vehicle-1" canManage={canManage} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.session = SESSION;
  state.curve = CURVE;
  state.insights = [SHAPE, BAND];
  state.places = [];
  mutateAsync.mockClear();
  createPlace.mockClear();
  updatePlace.mockClear();
  localStorage.setItem('rm-app-timezone', 'America/Los_Angeles');
  setReducedMotion(true);
});

afterEach(() => vi.useRealTimers());

function setReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('reduce'), media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe('ChargeDetailView', () => {
  it('shows the place, time, DC FAST tag, Edit and the energy hero with glossary copy', () => {
    const { container } = renderView();
    expect(screen.getByRole('heading', { level: 1, name: 'Tesla Supercharger' })).toBeInTheDocument();
    expect(screen.getByText(/^Bellevue · .*Nov 6 · /)).toBeInTheDocument();
    expect(container.querySelector('[data-charge-tag="dc"]')).toHaveTextContent('DC FAST');
    expect(screen.getByRole('button', { name: /Edit/ })).toBeInTheDocument();
    expect(container.querySelector('[data-charge-hero-line]')).toHaveTextContent('40% → 71% in 22 min · about +92 mi of range');
    expect(screen.getByRole('img', { name: 'Battery from 40% to 71%' })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/SoC|->/);
  });

  it('draws the curve with phases, one sentence per phase, the usual band and an axis toggle', () => {
    const { container } = renderView();
    const card = container.querySelector('[data-charge-curve="plot"]') as HTMLElement;
    // Reduced motion shows the final state of the intro at once.
    expect(card.dataset.stage).toBe('4');
    expect(within(card).getByText('Peak 108 kW at 44%')).toBeInTheDocument();
    expect(within(card).getByText('52 kW at 71%')).toBeInTheDocument();
    expect(card.querySelector('[data-charge-story]')).toHaveTextContent('Then a steady taper to 52 kW at 71% as the battery filled.');
    fireEvent.click(within(card).getByRole('button', { name: /Peak/ }));
    expect(card.querySelector('[data-charge-story]')).toHaveTextContent('Peak 108 kW at 44%. Power stayed above 105 kW for 4 min.');
    fireEvent.click(within(card).getByRole('button', { name: /Climb/ }));
    expect(card.querySelector('[data-charge-story]')).toHaveTextContent('Power climbed from 60 to 108 kW in the first 2 min.');
    expect(within(card).getByText(/Gray band: your usual DC curve \(3 earlier charges\)\. This charge was close to it\./)).toBeInTheDocument();
    expect(card.querySelector('[data-charge-band]')).not.toBeNull();
    expect(within(card).getByText('40%')).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Time' }));
    expect(card.dataset.axis).toBe('time');
    expect(within(card).getByText('20 min')).toBeInTheDocument();
  });

  it('draws in steps: climb, peak marker, taper shading, lowest point', () => {
    setReducedMotion(false);
    vi.useFakeTimers();
    const { container } = renderView();
    const card = container.querySelector('[data-charge-curve="plot"]') as HTMLElement;
    expect(card.dataset.stage).toBe('0');
    act(() => { vi.advanceTimersByTime(100); });
    expect(card.dataset.stage).toBe('1');
    expect(card.querySelector('[data-charge-story]')).toHaveTextContent('Power climbed from 60 to 108 kW in the first 2 min.');
    act(() => { vi.advanceTimersByTime(800); });
    expect(card.dataset.stage).toBe('2');
    act(() => { vi.advanceTimersByTime(2000); });
    expect(card.dataset.stage).toBe('4');
    expect((card.querySelector('[data-charge-low]') as HTMLElement).style.opacity).toBe('1');
  });

  it('reads a point with the keyboard and keeps the tooltip inside the card', () => {
    const { container } = renderView();
    const slider = screen.getByRole('slider', { name: 'Read a point on the curve' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    const tip = container.querySelector('[data-charge-tip]') as HTMLElement;
    expect(tip).toHaveTextContent('100 kW · 41% · 1 min');
    expect(Number.parseFloat(tip.style.left)).toBeGreaterThanOrEqual(0);
  });

  it('shows peak, lowest, average power and the cost tile', () => {
    const { container } = renderView();
    const tile = (label: string) => container.querySelector(`[data-charge-tile="${label}"]`) as HTMLElement;
    expect(tile('Peak power')).toHaveTextContent('108kWAt 44%, 2 min in');
    expect(tile('Lowest power')).toHaveTextContent('52kWAt 71%, at the end');
    expect(tile('Average power')).toHaveTextContent('78kWOver 22 min');
    expect(tile('Cost')).toHaveTextContent('No price');
  });

  it('saves a rate as a total and saves the rate to a new place at this charger', async () => {
    renderView();
    const box = screen.getByRole('region', { name: 'Add the cost of this charge' });
    fireEvent.click(within(box).getByRole('button', { name: 'Rate per kWh' }));
    fireEvent.change(within(box).getByLabelText('Rate (USD per kWh)'), { target: { value: '0.50' } });
    expect(within(box).getByText('= $14.30')).toBeInTheDocument();
    fireEvent.click(within(box).getByRole('checkbox', { name: /Use this rate for my next charges at this charger/ }));
    expect(within(box).getByText('Adds the saved place “Tesla Supercharger” at this charger with 50¢ per kWh.')).toBeInTheDocument();
    fireEvent.click(within(box).getByRole('button', { name: 'Save cost' }));
    await waitFor(() => expect(createPlace).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith({ sessionId: 'charge-dc', cost_mode: 'manual', cost_usd: 14.3 });
    expect(createPlace.mock.calls[0]![0]).toMatchObject({ name: 'Tesla Supercharger', charging: { billing_type: 'per_kwh', rate: 0.5 } });
    expect(await screen.findByRole('status')).toHaveTextContent('Cost saved. Your next charges at “Tesla Supercharger” use 50¢ per kWh.');
  });

  it('saves a total and previews its rate; updates a matched place', async () => {
    state.places = [{ id: 'p1', name: 'Bellevue SC', latitude: 47.61, longitude: -122.2, radius_m: 75, is_home: false, is_work: false, address: null, charging: null }];
    renderView();
    const box = screen.getByRole('region', { name: 'Add the cost of this charge' });
    fireEvent.change(within(box).getByLabelText('Total paid (USD)'), { target: { value: '14.30' } });
    expect(within(box).getByText('= 50¢ per kWh for 28.6 kWh')).toBeInTheDocument();
    fireEvent.click(within(box).getByRole('checkbox', { name: /Use this rate for my next charges at Bellevue SC/ }));
    fireEvent.click(within(box).getByRole('button', { name: 'Save cost' }));
    await waitFor(() => expect(updatePlace).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith({ sessionId: 'charge-dc', cost_mode: 'manual', cost_usd: 14.3 });
    expect(updatePlace.mock.calls[0]![0]).toBe('p1');
    expect(createPlace).not.toHaveBeenCalled();
  });

  it('shows "Your price" with the derived rate and opens the cost box from Edit', () => {
    state.session = { ...SESSION, cost_method: 'user_manual', cost_usd: 14.3, cost_rate_per_kwh: 0.5, cost_override_mode: 'manual' };
    const { container } = renderView();
    expect(screen.queryByRole('region', { name: 'Add the cost of this charge' })).toBeNull();
    expect(container.querySelector('[data-charge-tile="Cost"]')).toHaveTextContent('$14.30Your price · 50¢/kWh');
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }));
    const box = screen.getByRole('region', { name: 'Cost' });
    expect(within(box).getByText('Your price $14.30 · 50¢/kWh')).toBeInTheDocument();
    expect(within(box).getByLabelText('Total paid (USD)')).toHaveValue('14.30');
    expect(within(box).getByRole('button', { name: 'Use the automatic price' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Location' })).toBeInTheDocument();
  });

  it('shows one empty row with the peak when there is no curve', () => {
    state.curve = [];
    state.insights = [];
    const { container } = renderView();
    expect(container.querySelector('[data-charge-curve-empty]')).toHaveTextContent('No power curve for this charge · Peak 108 kW.');
    expect(container.querySelector('[data-charge-tile="Lowest power"]')).toBeNull();
  });

  it('shows no Edit and no cost entry to a viewer', () => {
    renderView(false);
    expect(screen.queryByRole('button', { name: /Edit/ })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Add the cost of this charge' })).toBeNull();
  });
  it('marks a charge free and restores the automatic price with partial payloads', async () => {
    state.session = { ...SESSION, cost_method: 'user_manual', cost_usd: 14.3, cost_rate_per_kwh: 0.5, cost_override_mode: 'manual' };
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark free' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenLastCalledWith({ sessionId: 'charge-dc', cost_mode: 'free' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Marked free.');
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Use the automatic price' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenLastCalledWith({ sessionId: 'charge-dc', cost_mode: 'automatic' }));
  });

  it('blocks a negative total with recovery copy', () => {
    renderView();
    const box = screen.getByRole('region', { name: 'Add the cost of this charge' });
    fireEvent.change(within(box).getByLabelText('Total paid (USD)'), { target: { value: '-3' } });
    expect(within(box).getByText('Enter an amount of 0 or more, for example 14.30.')).toBeInTheDocument();
    expect(within(box).getByRole('button', { name: 'Save cost' })).toBeDisabled();
  });

  it('saves a saved-place location correction', async () => {
    state.places = [{ id: 'p9', name: 'Work garage', latitude: 1, longitude: 1, radius_m: 75, is_home: false, is_work: true, address: null, charging: null }];
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }));
    const location = screen.getByRole('region', { name: 'Location' });
    fireEvent.click(within(location).getByRole('button', { name: 'Saved place' }));
    expect(within(location).getByText('Choose a saved place before you save.')).toBeInTheDocument();
    fireEvent.change(within(location).getByLabelText('Saved place'), { target: { value: 'p9' } });
    fireEvent.click(within(location).getByRole('button', { name: 'Save location' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenLastCalledWith({ sessionId: 'charge-dc', location_mode: 'saved_place', place_id: 'p9' }));
  });

  it('shows live values and a pending cost while the charge is open', () => {
    state.session = { ...SESSION, ended_at: null, cost_method: null, live_total_charged_kwh: 12.34, live_soc_pct: 55,
      live_power_kw: 98.4, live_current_price: 3.2, live_time_elapsed_seconds: 540, live_time_remaining_min: 14 };
    const { container } = renderView();
    expect(screen.getByText('Energy added so far')).toBeInTheDocument();
    expect(container.querySelector('[data-charge-hero]')).toHaveTextContent('12.3kWh');
    expect(container.querySelector('[data-charge-hero-line]')).toHaveTextContent('40% → 55% 9 min so far');
    expect(container.querySelector('[data-charge-tile="Power now"]')).toHaveTextContent('98kWLive');
    expect(container.querySelector('[data-charge-tile="Cost"]')).toHaveTextContent('PendingAbout $3.20 so far');
    expect(container.querySelector('[data-charge-tile="Time left"]')).toHaveTextContent('14 min');
    expect(screen.queryByRole('region', { name: 'Add the cost of this charge' })).toBeNull();
  });

  it('wraps a long place name instead of cutting it', () => {
    state.session = { ...SESSION, network_vendor: null, is_public: false, location_name: 'A very long charging location name at the north end of the parking structure' };
    renderView();
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('break-words');
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveClass('truncate');
  });
});
