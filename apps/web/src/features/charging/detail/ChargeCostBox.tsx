import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, invalidateChargingData, useUpdateChargeSession } from '@riviamigo/hooks';
import type { ChargeSession, Place } from '@riviamigo/types';
import { Button, Input } from '@riviamigo/ui/primitives';
import { getAppTimezone } from '@riviamigo/ui/lib/dateTime';
import { cn } from '@riviamigo/ui/lib/utils';
import {
  costEntry, currentPriceLine, formatRate, placeRateBlock, placeRatePlan, type CostEntryMode, type PlaceRatePlan,
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
  /**
   * True from the start of a save until the box calls `onDone`. The parent keeps
   * the box mounted while it is true, so a partial failure (the cost saved, the
   * place rate did not) stays visible after the charge has a price.
   */
  onHoldChange?: ((hold: boolean) => void) | undefined;
}

/** The cost box changes the insights ("N charges have no price"), which useInsights caches for 60 s. */
const INSIGHTS_KEY = ['vehicles', 'insights'] as const;

/** Enter a total or a rate for one charge. Saves `{ cost_mode: "manual", cost_usd }`. */
export function ChargeCostBox({ session, vehicleId, kwh, savedPlace, placesReady, atHome, placeName, variant, onDone, onHoldChange }: ChargeCostBoxProps) {
  const queryClient = useQueryClient();
  const updateSession = useUpdateChargeSession(vehicleId);
  const invalidateInsights = () => { void queryClient.invalidateQueries({ queryKey: INSIGHTS_KEY }); };
  const savePlace = useMutation({
    mutationFn: (plan: PlaceRatePlan) => (plan.placeId ? api.updatePlace(plan.placeId, plan.body) : api.createPlace(plan.body)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['places'] });
      invalidateChargingData(queryClient);
      invalidateInsights();
    },
  });
  const initialManual = session.cost_method === 'user_manual' && session.cost_usd != null;
  const [mode, setMode] = React.useState<CostEntryMode>('total');
  const [input, setInput] = React.useState(initialManual ? session.cost_usd!.toFixed(2) : '');
  const [useForNext, setUseForNext] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  /** The cost saved and the place rate did not. */
  const [partial, setPartial] = React.useState(false);
  /** The confirm step before an existing place changes. */
  const [confirming, setConfirming] = React.useState(false);
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  const pending = updateSession.isPending || savePlace.isPending;

  const entry = costEntry(mode, input, kwh);
  const block = placeRateBlock(savedPlace, atHome);
  const plan = entry.rate != null && placesReady && !block
    ? placeRatePlan(session, savedPlace, entry.rate, getAppTimezone(), placeName)
    : null;
  const inputId = React.useId();
  const hintId = React.useId();

  // A changed value or option needs a new confirm step.
  React.useEffect(() => { setConfirming(false); }, [input, mode, useForNext]);
  React.useEffect(() => { if (confirming) confirmRef.current?.focus(); }, [confirming]);

  function finish(message: string) {
    setPartial(false);
    onDone?.(message);
    onHoldChange?.(false);
  }

  function switchMode(next: CostEntryMode) {
    if (next === mode) return;
    // Carry the value across: a total becomes its rate, a rate becomes its total.
    if (next === 'rate' && entry.rate != null) setInput(entry.rate.toFixed(entry.rate < 1 ? 3 : 2).replace(/0$/, ''));
    else if (next === 'total' && entry.total != null) setInput(entry.total.toFixed(2));
    setMode(next);
  }

  async function save() {
    if (entry.total == null || entry.error) return;
    const withPlace = useForNext && plan ? plan : null;
    if (withPlace?.confirm && !confirming) { setConfirming(true); return; }
    setConfirming(false);
    setError(null);
    onHoldChange?.(true);
    try {
      await updateSession.mutateAsync({ sessionId: session.id, cost_mode: 'manual', cost_usd: entry.total });
      invalidateInsights();
    } catch (cause) {
      setPartial(false);
      setError(`${cause instanceof Error ? cause.message : 'The cost did not save.'} Try again.`);
      onHoldChange?.(false);
      return;
    }
    if (!withPlace) { finish('Cost saved.'); return; }
    try {
      const place = await savePlace.mutateAsync(withPlace);
      finish(withPlace.placeId
        ? `Cost saved. ${place.name} now uses ${formatRate(entry.rate!)} per kWh. Past automatic charges there are priced again.`
        : `Cost saved. Your next charges at “${place.name}” use ${formatRate(entry.rate!)} per kWh.`);
    } catch (cause) {
      // Keep the box open (the parent holds it) and say what saved and what did not.
      setPartial(true);
      setError(`Cost saved, but the rate did not save to the place. ${cause instanceof Error ? cause.message : ''} Try again.`.replace(/\s+/g, ' ').trim());
    }
  }

  async function saveMode(costMode: 'free' | 'automatic') {
    setError(null);
    try {
      await updateSession.mutateAsync({ sessionId: session.id, cost_mode: costMode });
      invalidateInsights();
      finish(costMode === 'free' ? 'Marked free.' : 'The app computes the price again.');
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : 'The change did not save.'} Try again.`);
    }
  }

  const prompt = variant === 'prompt';
  const optionLabel = savedPlace
    ? `Use this rate at ${savedPlace.name}`
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
        block ? (
          <p className="mt-2 text-xs text-fg-secondary" data-charge-rate-block>{block}</p>
        ) : plan ? (
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
      {confirming && plan?.confirm ? (
        <div role="group" aria-label="Confirm the place rate" data-charge-rate-confirm
          className="mt-3 rounded-lg border border-status-warning/30 bg-status-warning/10 px-3 py-2">
          <p className="text-sm text-fg">{plan.confirm}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button ref={confirmRef} type="button" size="lg" className="min-h-11" onClick={() => void save()} loading={pending} disabled={pending}>
              Save and change {savedPlace?.name ?? 'the place'}
            </Button>
            <Button type="button" variant="ghost" size="lg" className="min-h-11" onClick={() => setConfirming(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="button" size="lg" className="min-h-11" onClick={() => void save()} loading={pending}
            disabled={entry.total == null || !!entry.error || pending}>
            {partial ? 'Try again' : 'Save cost'}
          </Button>
          {partial ? (
            <Button type="button" variant="ghost" size="lg" className="min-h-11" onClick={() => finish('Cost saved. The place rate did not change.')} disabled={pending}>
              Close
            </Button>
          ) : null}
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
      )}
      {error ? <p role="alert" className="mt-3 rounded-lg border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger" data-charge-cost-error={partial ? 'partial' : 'failed'}>{error}</p> : null}
    </ChargeCard>
  );
}
