import type { SpeedHistogramBin } from '@riviamigo/ui/charts';

interface SpeedPoint {
  elapsed_s: number;
  speed_mph: number | null;
  lat: number | null;
  lng: number | null;
}

interface SpeedInterval {
  start: number;
  end: number;
  mph: number;
  source: 'recorded' | 'gps';
  observationStart?: number;
  observationEnd?: number;
}

const MAX_MPH = 130;
const MIN_GPS_SECONDS = 5;
const MAX_GPS_SECONDS = 90;
const MIN_GPS_MILES = 0.005;

function validSpeed(value: number | null): value is number {
  return value != null && Number.isFinite(value) && value >= 0 && value <= MAX_MPH;
}

function validLocation(point: SpeedPoint) {
  return point.lat != null && point.lng != null
    && Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180
    && (point.lat !== 0 || point.lng !== 0);
}

function distanceMiles(a: SpeedPoint, b: SpeedPoint) {
  const radians = Math.PI / 180;
  const haversine = Math.sin((b.lat! - a.lat!) * radians / 2) ** 2
    + Math.cos(a.lat! * radians) * Math.cos(b.lat! * radians)
    * Math.sin((b.lng! - a.lng!) * radians / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine))));
}

interface TripDurationSource {
  started_at: string;
  ended_at: string | null;
  duration_min?: number | null;
  duration_seconds?: number | null;
}

/**
 * The trip duration in seconds. The trip's own duration comes first: the
 * timestamps can span more than the drive (for example a trip that the
 * detector closed late), and coverage must never exceed the drive.
 */
export function resolveTripDurationSeconds(trip: TripDurationSource | null | undefined): number {
  if (!trip) return 0;
  if (trip.duration_seconds != null && Number.isFinite(trip.duration_seconds) && trip.duration_seconds > 0) {
    return trip.duration_seconds;
  }
  if (trip.duration_min != null && Number.isFinite(trip.duration_min) && trip.duration_min > 0) {
    return trip.duration_min * 60;
  }
  if (!trip.ended_at) return 0;
  const seconds = (Date.parse(trip.ended_at) - Date.parse(trip.started_at)) / 1000;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

export function buildTripSpeedProfile(
  points: SpeedPoint[],
  durationSeconds: number,
  sampleIntervalSeconds: number,
) {
  const duration = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0;
  const bucket = Number.isFinite(sampleIntervalSeconds) && sampleIntervalSeconds > 0
    ? sampleIntervalSeconds : 0;
  const recorded: SpeedInterval[] = [];
  const gps: SpeedInterval[] = [];
  const gpsIntervals: number[] = [];
  let previousFix: SpeedPoint | null = null;
  let previousTime = -Infinity;

  for (const [index, point] of points.entries()) {
    if (!Number.isFinite(point.elapsed_s) || point.elapsed_s <= previousTime) {
      previousFix = null;
      continue;
    }
    previousTime = point.elapsed_s;
    const start = Math.max(0, point.elapsed_s);
    const end = Math.min(duration, point.elapsed_s + bucket, points[index + 1]?.elapsed_s ?? duration);
    if (validSpeed(point.speed_mph) && end > start) {
      recorded.push({ start, end, mph: point.speed_mph, source: 'recorded' });
    }

    if (point.lat == null && point.lng == null) continue;
    if (!validLocation(point)) {
      previousFix = null;
      continue;
    }
    if (previousFix) {
      const seconds = point.elapsed_s - previousFix.elapsed_s;
      const miles = distanceMiles(previousFix, point);
      const mph = miles * 3600 / seconds;
      const gpsStart = Math.max(0, previousFix.elapsed_s);
      const gpsEnd = Math.min(duration, point.elapsed_s);
      if (seconds >= MIN_GPS_SECONDS && seconds <= MAX_GPS_SECONDS
        && miles >= MIN_GPS_MILES && validSpeed(mph) && gpsEnd > gpsStart) {
        gps.push({ start: gpsStart, end: gpsEnd, mph, source: 'gps',
          observationStart: previousFix.elapsed_s, observationEnd: point.elapsed_s });
        gpsIntervals.push(seconds);
      }
    }
    previousFix = point;
  }

  // Reported intervals always take precedence, including a reported stop.
  const estimated: SpeedInterval[] = [];
  let recordedIndex = 0;
  for (const interval of gps) {
    let start = interval.start;
    while (recorded[recordedIndex] && recorded[recordedIndex]!.end <= start) recordedIndex++;
    for (let index = recordedIndex; index < recorded.length; index++) {
      const direct = recorded[index]!;
      if (direct.start >= interval.end) break;
      if (direct.start > start) estimated.push({ ...interval, start, end: direct.start });
      start = Math.max(start, direct.end);
      if (start >= interval.end) break;
    }
    if (start < interval.end) estimated.push({ ...interval, start });
  }
  const intervals = [...recorded, ...estimated].sort((a, b) => a.start - b.start);
  const bins: SpeedHistogramBin[] = [];
  const maxSpeed = intervals.reduce((max, interval) => Math.max(max, interval.mph), -1);
  for (let min = 0; min <= maxSpeed; min += 5) {
    bins.push({
      label: `${min}-${min + 5}`, min, max: min + 5, count: 0, duration_seconds: 0,
      recorded_seconds: 0, estimated_seconds: 0, sample_elapsed_s: null,
    });
  }
  for (const interval of intervals) {
    const bin = bins[Math.floor(interval.mph / 5)]!;
    const seconds = interval.end - interval.start;
    bin.count++;
    bin.duration_seconds += seconds;
    if (interval.source === 'recorded') bin.recorded_seconds! += seconds;
    else bin.estimated_seconds! += seconds;
    bin.sample_elapsed_s ??= interval.start;
  }
  // Every interval is clipped to [0, duration] and recorded and estimated
  // intervals do not overlap, so their sum cannot exceed the duration. The
  // clamp keeps that true against floating-point error.
  const recordedSeconds = Math.min(duration, recorded.reduce((sum, item) => sum + item.end - item.start, 0));
  const estimatedSeconds = Math.min(duration - recordedSeconds,
    estimated.reduce((sum, item) => sum + item.end - item.start, 0));
  const estimates = points.map(point => validSpeed(point.speed_mph) ? null
    : estimated.find(interval => point.elapsed_s > interval.start && point.elapsed_s <= interval.end) ?? null);
  const sortedGpsIntervals = gpsIntervals.sort((a, b) => a - b);
  const middle = Math.floor(sortedGpsIntervals.length / 2);
  const medianGpsSeconds = sortedGpsIntervals.length === 0 ? null : sortedGpsIntervals.length % 2
    ? sortedGpsIntervals[middle]! : (sortedGpsIntervals[middle - 1]! + sortedGpsIntervals[middle]!) / 2;
  return {
    bins, estimates, recordedSeconds, estimatedSeconds, medianGpsSeconds,
    recordedValues: points.map(point => validSpeed(point.speed_mph) ? point.speed_mph : null),
    coveredSeconds: recordedSeconds + estimatedSeconds,
    durationSeconds: duration,
    missingSeconds: Math.max(0, duration - recordedSeconds - estimatedSeconds),
    coverage: duration > 0 ? Math.min(1, (recordedSeconds + estimatedSeconds) / duration) : 0,
  };
}
