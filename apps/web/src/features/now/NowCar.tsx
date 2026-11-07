import React from 'react';
import type { Vehicle } from '@riviamigo/types';
import { AuthenticatedVehicleArtwork, resolveVehicleArtwork, useVehicleArtwork } from '@riviamigo/hooks';
import { useDocumentTheme } from '@riviamigo/ui/hooks';
import { DEFAULT_FRAME, wrapFrame } from '../r-experience/orbitFrames';
import { isConfiguredR2 } from '../r-experience/readings';
import { RVehicleOrbit } from '../r-experience/RVehicleOrbit';
import { spinLabel } from './nowModel';

/** Frames within one step (5°) of the side frame count as "at the side angle". */
export function isSideFrame(frame: number) {
  const distance = Math.abs(wrapFrame(frame) - DEFAULT_FRAME);
  return Math.min(distance, 72 - distance) <= 1;
}

/**
 * The car area. An R2 Performance gets the 360° turn. When the owner's Rivian side
 * artwork exists it rests on top; a turn cross-fades to the frames and a stop at the
 * side angle cross-fades back. Other vehicles show their own artwork.
 */
export function NowCar({ vehicle }: { vehicle: Vehicle }) {
  const dark = useDocumentTheme();
  const artwork = resolveVehicleArtwork(vehicle.images, vehicle.model, 'vehicle-card');
  const ownerSource = dark ? artwork.dark ?? artwork.light : artwork.light;
  const owner = useVehicleArtwork(ownerSource);
  const [turning, setTurning] = React.useState(false);
  const onTurnStart = React.useCallback(() => setTurning(true), []);
  const onRest = React.useCallback((frame: number) => { if (isSideFrame(frame)) setTurning(false); }, []);

  if (!isConfiguredR2(vehicle)) {
    return <div className="now-car" data-mode="static">
      <AuthenticatedVehicleArtwork className="now-car-image" source={ownerSource} fallbackSource={artwork.fallback}
        alt={`Your ${vehicle.model || 'Rivian'}${vehicle.color ? `, ${vehicle.color}` : ''}`} draggable={false} />
    </div>;
  }
  const hasOwnerArt = Boolean(owner.src);
  return <div className="now-car" data-mode="orbit" data-rest={hasOwnerArt && !turning ? 'artwork' : 'frames'}>
    <RVehicleOrbit key={vehicle.id} vehicleId={vehicle.id} label={spinLabel(vehicle)}
      autoTurn={!hasOwnerArt} onTurnStart={onTurnStart} onRest={onRest} />
    {hasOwnerArt && <img className="now-car-artwork now-car-image" src={owner.src!} alt="" aria-hidden="true" draggable={false} />}
  </div>;
}
