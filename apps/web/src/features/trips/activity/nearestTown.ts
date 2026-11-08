/**
 * Nearest-town names for places that are not saved places and have no
 * address. The name is marked approximate ("Near Kirkland") because it is the
 * closest town centroid, not an address.
 */
const TOWNS: ReadonlyArray<readonly [string, number, number]> = [
  ['Kirkland', 47.6769, -122.2060], ['Bellevue', 47.6101, -122.2015], ['Seattle', 47.6062, -122.3321],
  ['Redmond', 47.6740, -122.1215], ['Bothell', 47.7623, -122.2054], ['Mill Creek', 47.8601, -122.2043],
  ['Lynnwood', 47.8209, -122.3151], ['Everett', 47.9790, -122.2021], ['Woodinville', 47.7543, -122.1635],
  ['Kenmore', 47.7573, -122.2440], ['Issaquah', 47.5301, -122.0326], ['Renton', 47.4829, -122.2171],
  ['Tukwila', 47.4740, -122.2610], ['Federal Way', 47.3223, -122.3126], ['Tacoma', 47.2529, -122.4443],
  ['Lacey', 47.0343, -122.8232], ['Olympia', 47.0379, -122.9007], ['Centralia', 46.7162, -122.9543],
  ['Chehalis', 46.6621, -122.9640], ['Toledo', 46.4401, -122.8468], ['Castle Rock', 46.2751, -122.9076],
  ['Kelso', 46.1468, -122.9084], ['Longview', 46.1382, -122.9382], ['Woodland', 45.9045, -122.7437],
  ['Ridgefield', 45.8151, -122.7426], ['Vancouver', 45.6387, -122.6615], ['Portland', 45.5152, -122.6784],
  ['Shoreline', 47.7557, -122.3415], ['Sammamish', 47.6163, -122.0356], ['Snohomish', 47.9129, -122.0982],
];

/** Farther than this from every known town, the place stays unnamed. */
const MAX_TOWN_KM = 60;

export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2
    + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

export function nearestTown(lat: number | null | undefined, lng: number | null | undefined): string | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  let best: string | null = null;
  let bestKm = Number.POSITIVE_INFINITY;
  for (const [name, townLat, townLng] of TOWNS) {
    const km = distanceKm(lat, lng, townLat, townLng);
    if (km < bestKm) { best = name; bestKm = km; }
  }
  return bestKm <= MAX_TOWN_KM ? best : null;
}
