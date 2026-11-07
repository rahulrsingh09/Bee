import React from 'react';
import { useUpdateChargeSession } from '@riviamigo/hooks';
import type { ChargeSession, Place } from '@riviamigo/types';
import { Button, SelectPicker } from '@riviamigo/ui/primitives';
import { cn } from '@riviamigo/ui/lib/utils';
import { ChargeCard } from './ChargeStats';

type LocationMode = NonNullable<ChargeSession['location_override_mode']>;

function formatCoordinates(lat: number | null | undefined, lng: number | null | undefined) {
  return lat != null && lng != null ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : null;
}

/** Location correction: automatic matching, a saved place, or no location. */
export function ChargeLocationEditor({ session, vehicleId, places, placesLoading, placesError, onDone }: {
  session: ChargeSession;
  vehicleId: string;
  places: Place[];
  placesLoading: boolean;
  placesError: boolean;
  onDone: (message: string) => void;
}) {
  const updateSession = useUpdateChargeSession(vehicleId);
  const sortedPlaces = React.useMemo(
    () => [...places].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [places],
  );
  const [mode, setMode] = React.useState<LocationMode>(session.location_override_mode ?? 'automatic');
  const [placeId, setPlaceId] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    setMode(session.location_override_mode ?? 'automatic');
    const match = places.find((place) => place.name.trim().toLocaleLowerCase() === session.location_name?.trim().toLocaleLowerCase());
    setPlaceId(match?.id ?? '');
  }, [session.id, session.location_override_mode, session.location_name, places]);

  const missingPlace = mode === 'saved_place' && !placeId;
  const recorded = formatCoordinates(session.source_location_lat, session.source_location_lng);

  async function save() {
    if (missingPlace) return;
    setError(null);
    try {
      await updateSession.mutateAsync({
        sessionId: session.id,
        location_mode: mode,
        ...(mode === 'saved_place' ? { place_id: placeId } : {}),
      });
      onDone('Location saved.');
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : 'The location did not save.'} Try again.`);
    }
  }

  return (
    <ChargeCard title="Location" data-charge-location-editor>
      <p className="mt-1 text-[13px] leading-[18px] text-fg-secondary">
        Recorded coordinates: {recorded ?? 'not available'}
      </p>
      <div role="group" aria-label="Location source" className="mt-3 grid grid-cols-3 gap-1 rounded-xl border border-border bg-bg-page/60 p-1">
        {([['automatic', 'Automatic'], ['saved_place', 'Saved place'], ['none', 'No location']] as const).map(([value, label]) => (
          <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} disabled={updateSession.isPending}
            className={cn('min-h-11 rounded-lg px-2 text-xs font-medium transition-colors', mode === value ? 'bg-bg-elevated text-fg shadow-sm' : 'text-fg-secondary hover:text-fg')}>
            {label}
          </button>
        ))}
      </div>
      {mode === 'saved_place' ? (
        <div className="mt-3">
          <SelectPicker
            className="w-full"
            value={placeId}
            aria-label="Saved place"
            onChange={setPlaceId}
            disabled={placesLoading || placesError || updateSession.isPending}
            placeholder={placesLoading ? 'Loading saved places…' : placesError ? 'Unable to load saved places' : 'Choose a saved place'}
            options={sortedPlaces.map((place) => ({ value: place.id, label: place.name, description: place.address?.display_name ?? undefined }))}
          />
          {missingPlace ? <p className="mt-1 text-xs text-status-danger">Choose a saved place before you save.</p> : null}
        </div>
      ) : null}
      <Button type="button" variant="secondary" size="lg" className="mt-3 min-h-11" onClick={() => void save()}
        loading={updateSession.isPending} disabled={missingPlace || updateSession.isPending}>
        Save location
      </Button>
      {error ? <p role="alert" className="mt-3 rounded-lg border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p> : null}
    </ChargeCard>
  );
}
