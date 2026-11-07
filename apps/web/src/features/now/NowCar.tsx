import type { Vehicle } from '@riviamigo/types';
import { AuthenticatedVehicleArtwork, resolveVehicleArtwork } from '@riviamigo/hooks';
import { useDocumentTheme } from '@riviamigo/ui/hooks';
import { isConfiguredR2 } from '../r-experience/readings';
import { RVehicleAngles } from '../r-experience/RVehicleOrbit';
import { spinLabel } from './nowModel';

/**
 * The car area. An R2 Performance with at least two of the owner's own Rivian images
 * gets the turn control: it rests on the side image and steps through the owner's
 * angles. Every other case shows one image (the owner's side image, else the packaged
 * model artwork). The bundled orbit frames are never used here: they show an R1S body.
 */
export function NowCar({ vehicle }: { vehicle: Vehicle }) {
  const dark = useDocumentTheme();
  const artwork = resolveVehicleArtwork(vehicle.images, vehicle.model, 'vehicle-card');
  const angles = (dark ? artwork.angles?.dark : artwork.angles?.light) ?? [];

  if (isConfiguredR2(vehicle) && angles.length >= 2) {
    return <div className="now-car" data-mode="turn">
      <RVehicleAngles key={vehicle.id} label={spinLabel(vehicle)} angles={angles} fallbackSource={artwork.fallback} />
    </div>;
  }
  const source = (dark ? artwork.dark ?? artwork.light : artwork.light) ?? angles[0]?.url;
  return <div className="now-car" data-mode="static">
    <AuthenticatedVehicleArtwork className="now-car-image" source={source} fallbackSource={artwork.fallback}
      alt={`Your ${vehicle.model || 'Rivian'}${vehicle.color ? `, ${vehicle.color}` : ''}`} draggable={false} />
  </div>;
}
