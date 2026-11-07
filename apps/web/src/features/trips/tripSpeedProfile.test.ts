import { describe, expect, it } from 'vitest';
import { buildTripSpeedProfile, resolveTripDurationSeconds } from './tripSpeedProfile';

const point = (elapsed_s: number, lng: number | null = null, speed_mph: number | null = null) => ({
  elapsed_s, speed_mph, lat: lng == null ? null : 40, lng,
});
const total = (profile: ReturnType<typeof buildTripSpeedProfile>) =>
  profile.bins.reduce((sum, bin) => sum + bin.duration_seconds, 0);

describe('trip speed sources and coverage', () => {
  it('weights recorded buckets by elapsed time and clips to the trip end', () => {
    const result = buildTripSpeedProfile([point(-1, null, 30), point(1, null, 30), point(3, null, 40)], 4, 2);
    expect(result.recordedSeconds).toBe(4);
    expect(result.estimatedSeconds).toBe(0);
    expect(result.bins.find(bin => bin.min === 30)?.duration_seconds).toBe(3);
    expect(total(result)).toBe(4);
  });

  it('counts a minute of GPS history as a minute, not as one small API bucket', () => {
    const points = [point(0, -105), point(30), point(60, -104.99)];
    const original = structuredClone(points);
    const result = buildTripSpeedProfile(points, 90, 2);
    expect(result.estimatedSeconds).toBe(60);
    expect(result.missingSeconds).toBe(30);
    expect(result.coverage).toBeCloseTo(2 / 3);
    expect(result.medianGpsSeconds).toBe(60);
    expect(result.estimates[1]?.mph).toBeGreaterThan(30);
    expect(result.estimates[2]?.mph).toBeLessThan(35);
    expect(points).toEqual(original);
    expect(result.recordedValues).toEqual([null, null, null]);
  });

  it('keeps reported zero and removes its interval from the GPS estimate', () => {
    const result = buildTripSpeedProfile([point(0, -105), point(30, null, 0), point(60, -104.99)], 60, 10);
    expect(result.recordedSeconds).toBe(10);
    expect(result.estimatedSeconds).toBe(50);
    expect(result.estimates[1]).toBeNull();
    expect(result.recordedValues[1]).toBe(0);
    expect(total(result)).toBe(60);
    expect(result.bins[0]?.recorded_seconds).toBe(10);
  });

  it('does not extend direct speed across a telemetry gap', () => {
    const result = buildTripSpeedProfile([point(0, null, 40), point(300, null, 50)], 600, 2);
    expect(result.recordedSeconds).toBe(4);
    expect(result.missingSeconds).toBe(596);
  });

  it.each([
    [point(0, -105), point(120, -104.99)],
    [point(0, -105), point(2, -104.99)],
    [point(0, -105), point(60, -104)],
    [point(0, -105), point(60, -105)],
    [point(0, -105), point(60, -104.99999)],
    [point(0, -105), { ...point(30, -104.99), lat: 200 }, point(60, -104.98)],
    [point(0, -105), point(-1, -104.99), point(60, -104.98)],
  ])('rejects unsafe GPS intervals: %j', (...points) => {
    expect(buildTripSpeedProfile(points, 120, 2).estimatedSeconds).toBe(0);
  });

  it('does not use odometer readings or invent a stopped bin for missing speed', () => {
    const points = [{ ...point(0), odometer_miles: 100 }, { ...point(60), odometer_miles: 101 }];
    const result = buildTripSpeedProfile(points, 60, 2);
    expect(result.bins).toEqual([]);
    expect(result.coverage).toBe(0);
  });

  it('bounds invalid speed and interval inputs without unbounded bins', () => {
    const result = buildTripSpeedProfile([point(0, null, Infinity), point(10, null, -3), point(20, null, NaN)], 60, 0);
    expect(result.bins).toEqual([]);
    expect(result.recordedValues).toEqual([null, null, null]);
  });
});

describe('trip duration for speed coverage', () => {
  // A 30 min drive whose end timestamp is 11 h 30 min after its start. The
  // page showed "31m covered · 4%" and "10h 59m unavailable" for it.
  const lateClosedTrip = {
    started_at: '2026-10-08T06:00:00Z',
    ended_at: '2026-10-08T17:30:00Z',
    duration_min: 30,
  };
  const samples = Array.from({ length: 31 }, (_, index) => point(index * 60, null, 30));

  it('uses the trip duration, not the span of its timestamps', () => {
    expect(resolveTripDurationSeconds(lateClosedTrip)).toBe(1800);
    expect(resolveTripDurationSeconds({ ...lateClosedTrip, duration_seconds: 1795 })).toBe(1795);
    expect(resolveTripDurationSeconds({ ...lateClosedTrip, duration_min: 0 })).toBe(41_400);
    expect(resolveTripDurationSeconds({ started_at: '2026-10-08T06:00:00Z', ended_at: null })).toBe(0);
    expect(resolveTripDurationSeconds(null)).toBe(0);
  });

  it('never reports more missing time than the drive has (the 10h59m case)', () => {
    const result = buildTripSpeedProfile(samples, resolveTripDurationSeconds(lateClosedTrip), 60);
    expect(result.durationSeconds).toBe(1800);
    expect(result.recordedSeconds).toBe(1800);
    expect(result.missingSeconds).toBe(0);
    expect(result.coverage).toBe(1);
  });

  it('clips samples after the trip end and keeps coverage inside the duration', () => {
    const tooLong = [...samples, ...Array.from({ length: 600 }, (_, index) => point(1860 + index * 60, null, 40))];
    const result = buildTripSpeedProfile(tooLong, 1800, 60);
    expect(result.recordedSeconds + result.estimatedSeconds).toBeLessThanOrEqual(result.durationSeconds);
    expect(result.missingSeconds).toBeLessThanOrEqual(
      result.durationSeconds - result.recordedSeconds - result.estimatedSeconds);
    expect(result.missingSeconds).toBe(0);
    expect(result.bins.find(bin => bin.min === 40)).toBeUndefined();
  });
});
