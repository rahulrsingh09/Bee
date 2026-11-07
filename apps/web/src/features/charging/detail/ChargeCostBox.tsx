import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, invalidateChargingData, useUpdateChargeSession } from '@riviamigo/hooks';
import type { ChargeSession, Place } from '@riviamigo/types';
import { Button, Input } from '@riviamigo/ui/primitives';
import { getAppTimezone } from '@riviamigo/ui/lib/dateTime';
import { cn } from '@riviamigo/ui/lib/utils';
import {
  costEntry, currentPriceLine, formatRate, placeRatePlan, type CostEntryMode, type PlaceRatePlan,
} from './chargeDetailModel';
import { ChargeCard } from './ChargeStats';

export interface ChargeCostBoxProps {
  session: ChargeSession;
  vehicleId: string;
  /** Energy added that the session row shows; a rate is multiplied by it. */
  kwh: number | null;
  savedPlace: Place | null;
  placesReady: boolean;
  atHome: boolean;
  /** Name for a new saved Place at this charger. */
  placeName: string;
  /** "prompt" when the charge has no price; "edit" when the owner opened Edit. */
  variant: 'prompt' | 'edit';
  /** Called after a save with the confirmation to show; the box can then close. */
  onDone?: ((message: string) => void) | undefined;
}

/** Enter a total or a rate for one charge. Saves `{ cost_mode: "manual", cost_usd }`. */
export function ChargeCostBox({ session, vehicleId, kwh, savedPlace, placesReady, atHome, placeName, variant, onDone }: ChargeCostBoxProps) {
  const queryClient = useQueryClient();
  const updateSession = useUpdateChargeSession(vehicleId);
  const savePlace = useMutation({
    mutationFn: (plan: PlaceRatePlan) => (plan.placeId ? api.updatePlace(plan.placeId, plan.body) : api.createPlace(plan.body)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['places'] });
      invalidateChargingData(queryClient);
    },
  });
  const initialManual = session.cost_method === 'user_manual' && session.cost_usd != null;
  const [mode, setMode] = React.useState<CostEntryMode>('total');
  const [input, setInput] = React.useState(initialManual ? session.cost_usd!.toFixed(2) : '');
  const [useForNext, setUseForNext] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const pending = updateSession.isPending || savePlace.isPending;

  const entry = costEntry(mode, input, kwh);
  const plan = entry.rate != null && placesReady
    ? placeRatePlan(session, savedPlace, entry.rate, getAppTimezone(), placeName)
    : null;
  const inputId = React.useId();
  const hintId = React.useId();

  function switchMode(next: CostEntryMode) {
    if (next === mode) return;
    // Carry the value across: a total becomes its rate, a rate becomes its total.
    if (next === 'rate' && entry.rate != null) setInput(entry.rate.toFixed(entry.rate < 1 ? 3 : 2).replace(/0$/, ''));
    else if (next === 'total' && entry.total != null) setInput(entry.total.toFixed(2));
    setMode(next);
  }

  async function save() {
    if (entry.total == null || entry.error) return;
    setError(null);
    try {
      await updateSession.mutateAsync({ sessionId: session.id, cost_mode: 'manual', cost_usd: entry.total });
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : 'The cost did not save.'} Try again.`);
      return;
    }
    if (useForNext && plan) {
      try {
        const place = await savePlace.mutateAsync(plan);
        onDone?.(`Cost saved. Your next charges at “${place.name}” use ${formatRate(entry.rate!)} per kWh.`);
      } catch (cause) {
        setError(`Cost saved, but the rate did not save to the place. ${cause instanceof Error ? cause.message : ''} Try again.`.replace(/\s+/g, ' ').trim());
        return;
      }
    } else {
      onDone?.('Cost saved.');
    }
  }

  async function saveMode(costMode: 'free' | 'automatic') {
    setError(null);
    try {
      await updateSession.mutateAsync({ sessionId: session.id, cost_mode: costMode });
      onDone?.(costMode === 'free' ? 'Marked free.' : 'The app computes the price again.');
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : 'The change did not save.'} Try again.`);
    }
  }

  const prompt = variant === 'prompt';
  const optionLabel = savedPlace
    ? `Use this rate for my next charges at ${savedPlace.name}`
    : 'Use this rate for my next charges at this charger';

  return (
    <ChargeCard title={prompt ? 'Add the cost of this charge' : 'Cost'} attention={prompt} data-charge-cost-box={variant}>
      <p className="mt-1 text-[13px] leading-[18px] text-fg-secondary">
        {prompt
          ? 'Rivian did not send a price for this charge. Enter the total from your receipt, or the rate.'
          : currentPriceLine(session, atHome)}
      </p>
      <div role="group" aria-label="Cost entry" className="mt-3 grid grid-cols-2 gap-1 rounded-xl border border-border bg-bg-page/60 p-1">
        {([['total', 'Total paid'], ['rate', 'Rate per kWh']] as const).map(([value, label]) => (
          <button key={value} type="button" aria-pressed={mode === value} onClick={() => switchMode(value)} disabled={pending}
            className={cn('min-h-11 rounded-lg px-2 text-sm font-medium transition-colors', mode === value ? 'bg-bg-elevated text-fg shadow-sm' : 'text-fg-secondary hover:text-fg')}>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3">
        <Input
          id={inputId}
          label={mode === 'total' ? 'Total paid (USD)' : 'Rate (USD per kWh)'}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          inputMode="decimal"
          autoComplete="off"
          placeholder={mode === 'total' ? '0.00' : '0.000'}
          iconLeft={<span aria-hidden="true">$</span>}
          iconRight={mode === 'rate' ? <span aria-hidden="true" className="text-xs">/kWh</span> : undefined}
          className={cn('h-11', mode === 'rate' && 'pr-14')}
          aria-describedby={hintId}
          disabled={pending}
          {...(entry.error ? { error: entry.error } : {})}
        />
        <p id={hintId} className="mt-2 text-[13px] leading-[18px] text-fg-secondary" data-charge-cost-preview>
          {entry.preview ?? (mode === 'rate' ? 'The app computes the total from the energy added.' : ' ')}
        </p>
      </div>
      {entry.rate != null && placesReady ? (
        plan ? (
          <label className="mt-2 flex min-h-11 cursor-pointer items-start gap-3 text-[13px] leading-[18px] text-fg">
            <input type="checkbox" checked={useForNext} onChange={(event) => setUseForNext(event.target.checked)} disabled={pending}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--rm-accent)]" data-charge-use-rate />
            <span>
              {optionLabel}
              <span className="mt-0.5 block text-fg-secondary">{plan.description}</span>
            </span>
          </label>
        ) : (
          <p className="mt-2 text-xs text-fg-secondary">This charge has no location, so the app cannot save the rate for this charger.</p>
        )
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="lg" className="min-h-11" onClick={() => void save()} loading={pending}
          disabled={entry.total == null || !!entry.error || pending}>
          Save cost
        </Button>
        {!prompt ? (
          <>
            <Button type="button" variant="ghost" size="lg" className="min-h-11" onClick={() => void saveMode('free')} disabled={pending}>
              Mark free
            </Button>
            {session.cost_override_mode === 'manual' || session.cost_override_mode === 'free' ? (
              <Button type="button" variant="ghost" size="lg" className="min-h-11" onClick={() => void saveMode('automatic')} disabled={pending}>
                Use the automatic price
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
      {error ? <p role="alert" className="mt-3 rounded-lg border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p> : null}
    </ChargeCard>
  );
}
