import React from 'react';
import { useAuth } from './useAuth';
import { useVehicles } from './useVehicles';

export function useAuthReady() {
  const accessToken = useAuth((state) => state.accessToken);
  const isAuthenticated = useAuth((state) => state.isAuthenticated);
  const isBootstrapping = useAuth((state) => state.isBootstrapping);

  return !isBootstrapping && isAuthenticated && !!accessToken;
}

export function useResolvedVehicleSelection() {
  const authReady = useAuthReady();
  const defaultVehicleId = useAuth((state) => state.defaultVehicleId);
  const activeVehicleId = useAuth((state) => state.activeVehicleId);
  const setDefaultVehicleId = useAuth((state) => state.setDefaultVehicleId);
  const setActiveVehicleId = useAuth((state) => state.setActiveVehicleId);
  const vehiclesQuery = useVehicles();
  const allVehicles = React.useMemo(() => vehiclesQuery.data ?? [], [vehiclesQuery.data]);
  // Demo vehicles stay out of every picker and of the default selection when a real vehicle exists.
  const vehicles = React.useMemo(() => {
    const real = allVehicles.filter((vehicle) => !vehicle.is_demo);
    return real.length ? real : allVehicles;
  }, [allVehicles]);

  // Stored ids are cleared only when the account no longer has the vehicle at all.
  const ownedVehicleIds = React.useMemo(
    () => new Set(allVehicles.map((vehicle) => vehicle.id)),
    [allVehicles],
  );
  const shownVehicleIds = React.useMemo(
    () => new Set(vehicles.map((vehicle) => vehicle.id)),
    [vehicles],
  );

  const validatedActiveVehicleId = activeVehicleId && shownVehicleIds.has(activeVehicleId)
    ? activeVehicleId
    : null;
  const validatedDefaultVehicleId = defaultVehicleId && shownVehicleIds.has(defaultVehicleId)
    ? defaultVehicleId
    : null;
  const effectiveVehicleId = validatedActiveVehicleId ?? validatedDefaultVehicleId ?? vehicles[0]?.id ?? null;

  React.useEffect(() => {
    if (!authReady || !vehiclesQuery.isFetched) return;

    if (activeVehicleId && !ownedVehicleIds.has(activeVehicleId)) {
      setActiveVehicleId(null);
    }

    if (defaultVehicleId && !ownedVehicleIds.has(defaultVehicleId)) {
      setDefaultVehicleId(vehicles[0]?.id ?? null);
    }
  }, [
    activeVehicleId,
    authReady,
    defaultVehicleId,
    ownedVehicleIds,
    setActiveVehicleId,
    setDefaultVehicleId,
    vehicles,
    vehiclesQuery.isFetched,
  ]);

  return {
    authReady,
    effectiveVehicleId,
    validatedActiveVehicleId,
    validatedDefaultVehicleId,
    vehicles,
    vehicleSelectionReady: !authReady || vehiclesQuery.isFetched,
    vehiclesQuery,
  };
}
