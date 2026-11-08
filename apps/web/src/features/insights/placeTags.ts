import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, invalidateChargingData } from '@riviamigo/hooks';
import type { Place, PlaceChargingInput, PlaceChargingProfile } from '@riviamigo/types';
import { CATEGORY_LABEL, type Category, type PlaceGroup } from './insightsModel';

/** The saved place whose rate a category uses: the Home or the Office place, the one with a cost profile first. */
export function ratePlace(places: readonly Place[], category: Category): Place | null {
  if (category === 'other') return null;
  const flagged = places.filter(place => (category === 'home' ? place.is_home : place.is_work));
  return flagged.find(place => place.charging) ?? flagged[0] ?? null;
}

/** A place cost profile as a place input. Free becomes $0 per kWh; per-minute profiles are not supported here. */
export function profileInput(profile: PlaceChargingProfile | null | undefined): PlaceChargingInput | null {
  if (!profile) return null;
  const base = { ...(profile.name ? { name: profile.name } : {}), session_fee: profile.session_fee ?? 0, currency: profile.currency || 'USD', timezone: profile.timezone };
  if (profile.billing_type === 'free') return { ...base, billing_type: 'per_kwh', rate: 0, session_fee: 0 };
  if (profile.billing_type === 'per_kwh' || profile.billing_type === 'flat') return { ...base, billing_type: 'per_kwh', rate: profile.rate };
  if (profile.billing_type === 'tou') return { ...base, billing_type: 'tou', rate: profile.rate, tou_periods: profile.tou_periods };
  return null;
}

/**
 * Applies a tag to every charge at a place with the place-tag API: Home and Office link the charges to the
 * saved Home or Office place (its rate prices them); Other removes the place and its rate.
 */
export function usePlaceTag(vehicleId: string) {
  const queryClient = useQueryClient();
  const [pending, setPending] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<{ text: string; error: boolean } | null>(null);
  const apply = React.useCallback(async (group: PlaceGroup, category: Category) => {
    const anchor = group.charges[0];
    if (!anchor || group.category === category) return;
    setPending(group.key);
    setMessage(null);
    try {
      const result = await api.applyChargePlaceTag(vehicleId, anchor.id, category);
      const count = result.updated;
      setMessage({ text: `${group.name} is now tagged ${CATEGORY_LABEL[category]}. ${count} ${count === 1 ? 'charge was' : 'charges were'} updated.`, error: false });
    } catch (cause) {
      setMessage({ text: `The tag did not save. ${cause instanceof Error ? cause.message : ''} Try again.`.replace(/\s+/g, ' ').trim(), error: true });
    } finally {
      setPending(null);
      void queryClient.invalidateQueries({ queryKey: ['places'] });
      invalidateChargingData(queryClient);
    }
  }, [queryClient, vehicleId]);
  return { apply, pending, message };
}
