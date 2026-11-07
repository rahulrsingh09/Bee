import { useParams } from '@tanstack/react-router';
import { useResolvedVehicleSelection } from '@riviamigo/hooks';
import { AppLayout } from '../../components/layout/AppLayout';
import { NoVehicleState } from '../../components/layout/NoVehicleState';
import { ChargeDetailView } from './detail/ChargeDetailView';

/** Charge detail route content: vehicle gating only. The page itself is ChargeDetailView. */
export function ChargeSessionContent() {
  const { authReady, effectiveVehicleId, vehicles, vehicleSelectionReady } = useResolvedVehicleSelection();
  const { sessionId } = useParams({ from: '/charging/$sessionId' });
  const role = vehicles?.find((vehicle) => vehicle.id === effectiveVehicleId)?.membership_role ?? '';

  return (
    <AppLayout activeKey="charging">
      {!authReady || !vehicleSelectionReady ? (
        <div className="p-4 text-xs text-fg-tertiary" aria-busy="true">Loading...</div>
      ) : !effectiveVehicleId ? (
        <NoVehicleState
          title="No vehicle selected"
          description="Connect your Rivian account before opening charge details."
        />
      ) : (
        <ChargeDetailView
          key={sessionId}
          sessionId={sessionId}
          vehicleId={effectiveVehicleId}
          canManage={role === 'owner' || role === 'manager'}
        />
      )}
    </AppLayout>
  );
}
