import { useParams } from '@tanstack/react-router';
import { useResolvedVehicleSelection } from '@riviamigo/hooks';
import { AppLayout } from '../../components/layout/AppLayout';
import { NoVehicleState } from '../../components/layout/NoVehicleState';
import { TripDetailView } from './detail/TripDetailView';

/** Trip detail route content: vehicle gating only. The page itself is TripDetailView. */
export function TripDetailContent() {
  const { authReady, effectiveVehicleId, vehicles, vehicleSelectionReady } = useResolvedVehicleSelection();
  const { tripId } = useParams({ from: '/trips/$tripId' });
  const role = vehicles?.find(vehicle => vehicle.id === effectiveVehicleId)?.membership_role ?? '';

  return (
    <AppLayout activeKey="trips">
      {!authReady || !vehicleSelectionReady ? (
        <div className="p-4 text-xs text-fg-tertiary" aria-busy="true">Loading...</div>
      ) : !effectiveVehicleId ? (
        <NoVehicleState
          title="No vehicle selected"
          description="Connect your Rivian account before opening trip details."
        />
      ) : (
        <TripDetailView
          key={tripId}
          tripId={tripId}
          vehicleId={effectiveVehicleId}
          canManageTags={role === 'owner' || role === 'manager'}
        />
      )}
    </AppLayout>
  );
}
