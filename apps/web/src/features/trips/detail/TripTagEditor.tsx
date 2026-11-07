import React from 'react';
import { Eraser, Save } from 'lucide-react';
import { useUpdateTripTagAssignments } from '@riviamigo/hooks';
import { TripTagPicker } from '@riviamigo/dashboards';
import { Button } from '@riviamigo/ui/primitives';
import type { Trip } from '@riviamigo/types';

export function useTripTagEditing(trip: Trip | undefined, vehicleId: string) {
  const updateAssignments = useUpdateTripTagAssignments(vehicleId);
  const [open, setOpen] = React.useState(false);
  const [draftTagIds, setDraftTagIds] = React.useState<string[]>([]);
  const [error, setError] = React.useState('');
  const tripId = trip?.id;
  React.useEffect(() => {
    setOpen(false);
    setError('');
  }, [tripId]);

  const toggle = () => {
    setError('');
    if (open) {
      setOpen(false);
      return;
    }
    setDraftTagIds(trip?.tags?.map(tag => tag.id) ?? []);
    setOpen(true);
  };

  const save = async () => {
    if (!trip) return;
    setError('');
    try {
      await updateAssignments.mutateAsync({ trip_ids: [trip.id], tag_ids: draftTagIds, mode: 'replace' });
      setOpen(false);
    } catch {
      setError('Couldn’t update trip tags. Try again.');
    }
  };

  return { open, toggle, draftTagIds, setDraftTagIds, error, save, pending: updateAssignments.isPending };
}

export function TripTagEditor({ vehicleId, canManage, editing }: {
  vehicleId: string;
  canManage: boolean;
  editing: ReturnType<typeof useTripTagEditing>;
}) {
  if (!editing.open) return null;
  return (
    <div className="mt-3 w-full rounded-xl border border-border bg-bg-elevated p-3" aria-label="Edit trip tags" role="group">
      <TripTagPicker
        vehicleId={vehicleId}
        canManage={canManage}
        selectedIds={editing.draftTagIds}
        onChange={editing.setDraftTagIds}
        label="Add tags to this trip"
        mode="inline"
        inlineClassName="rounded-lg border border-border bg-bg-surface px-2 py-1 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent"
        disabled={editing.pending}
      />
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          size="md"
          className="min-h-11"
          onClick={() => editing.setDraftTagIds([])}
          disabled={editing.pending || editing.draftTagIds.length === 0}
        >
          <Eraser className="h-4 w-4" aria-hidden="true" />
          Clear tags
        </Button>
        <Button
          type="button"
          variant="primary"
          size="md"
          className="min-h-11"
          onClick={() => void editing.save()}
          loading={editing.pending}
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          Save tags
        </Button>
      </div>
      {editing.error ? <p className="mt-2 text-sm text-status-danger" role="alert">{editing.error}</p> : null}
    </div>
  );
}
