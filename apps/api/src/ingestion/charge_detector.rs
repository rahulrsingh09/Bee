//! Detects charge session boundaries from charger_state transitions.
//! Extended with energy integration, charger-type classification, and max/avg
//! charge rate tracking.

use crate::models::telemetry::{ChargerState, TelemetryEvent};
use chrono::{DateTime, Utc};
use uuid::Uuid;

use super::location::valid_location_pair;
use crate::services::charging::{classify_charger_type, DC_MIN_RATE_KW, PLAUSIBLE_MAX_CHARGE_KW};

const CHARGE_TIMEOUT_SECS: i64 = 1800; // 30 min

/// A plugged-in vehicle cannot move. A fresh odometer reading, taken after
/// charging was last seen and at least `MOVED_MIN_MILES` beyond the odometer
/// from then, ends the session at that last charging reading. The R2 reports
/// the odometer in 1 km steps, so one step (0.62 mi) is not enough.
const MOVED_MIN_MILES: f64 = 1.0;
const MOTION_READING_MAX_AGE_SECS: i64 = 120;

/// A state of charge this far above the last charging reading is charging
/// evidence, even when the frame carries no charger signal.
const SOC_RISE_MIN_PCT: f64 = 0.5;

#[derive(Debug, Clone)]
pub struct CompletedChargeSession {
    pub session_id: Uuid,
    pub vehicle_id: Uuid,
    pub started_at: DateTime<Utc>,
    pub ended_at: DateTime<Utc>,
    pub location_lat: Option<f64>,
    pub location_lng: Option<f64>,
    pub soc_start: Option<f64>,
    pub soc_end: Option<f64>,
    pub charge_limit: Option<f64>,
    pub battery_capacity_wh: Option<f64>,

    /// Energy drawn from the grid (integrated from |power_kw| × Δt).
    pub energy_used_wh: Option<f64>,
    /// Energy delivered to the pack: (soc_end - soc_start) × battery_capacity.
    pub energy_added_wh: Option<f64>,
    /// Peak AC/DC power recorded during the session.
    pub peak_charge_kw: Option<f64>,
    /// Average charge rate = energy_used_kwh / duration_hours.
    pub avg_charge_rate_kw: Option<f64>,
    /// Classified charger type: "ac" or "dc".
    pub charger_type: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ActiveChargeSessionSnapshot {
    pub session_id: Uuid,
    pub started_at: DateTime<Utc>,
    pub location_lat: Option<f64>,
    pub location_lng: Option<f64>,
    pub soc_start: Option<f64>,
    pub last_soc: Option<f64>,
    pub charge_limit: Option<f64>,
    pub battery_capacity_wh: Option<f64>,
    pub last_charge_ts: DateTime<Utc>,
    pub last_power_ts: Option<DateTime<Utc>>,
    pub energy_used_wh: f64,
    pub peak_charge_kw: f64,
}

#[derive(Debug, Default)]
pub struct ChargeDetectorState {
    vehicle_id: Uuid,
    active_session_id: Option<Uuid>,
    is_charging: bool,
    started_at: Option<DateTime<Utc>>,
    start_lat: Option<f64>,
    start_lng: Option<f64>,
    soc_start: Option<f64>,
    last_soc: Option<f64>,
    charge_limit: Option<f64>,
    battery_capacity: Option<f64>,
    last_charge_ts: Option<DateTime<Utc>>,
    /// State of charge, odometer, peak and energy when charging was last seen.
    /// A session that ends by timeout or motion keeps these, not the readings
    /// that arrived after the charge.
    last_charge_soc: Option<f64>,
    last_charge_odometer: Option<f64>,
    last_charge_peak_kw: f64,
    last_charge_energy_wh: f64,
    last_power_ts: Option<DateTime<Utc>>,

    // Energy / rate accumulators
    energy_used_wh_acc: f64,
    peak_charge_kw: f64,
    /// A DC-rate reading on a session with an AC baseline, held until the next
    /// reading confirms or rejects it.
    pending_dc_reading_kw: Option<f64>,
}

#[derive(Debug)]
#[allow(clippy::large_enum_variant)]
pub enum ChargeEvent {
    SessionStarted,
    SessionEnded(CompletedChargeSession),
    NoChange,
}

impl ChargeDetectorState {
    pub fn new(vehicle_id: Uuid) -> Self {
        Self {
            vehicle_id,
            ..Default::default()
        }
    }

    pub fn from_snapshot(vehicle_id: Uuid, snapshot: ActiveChargeSessionSnapshot) -> Self {
        Self {
            vehicle_id,
            active_session_id: Some(snapshot.session_id),
            is_charging: true,
            started_at: Some(snapshot.started_at),
            start_lat: snapshot.location_lat,
            start_lng: snapshot.location_lng,
            soc_start: snapshot.soc_start,
            last_soc: snapshot.last_soc,
            charge_limit: snapshot.charge_limit,
            battery_capacity: snapshot.battery_capacity_wh,
            last_charge_ts: Some(snapshot.last_charge_ts),
            last_charge_soc: snapshot.last_soc,
            last_charge_odometer: None,
            last_charge_peak_kw: snapshot.peak_charge_kw.max(0.0),
            last_charge_energy_wh: snapshot.energy_used_wh.max(0.0),
            last_power_ts: snapshot.last_power_ts,
            energy_used_wh_acc: snapshot.energy_used_wh.max(0.0),
            peak_charge_kw: snapshot.peak_charge_kw.max(0.0),
            pending_dc_reading_kw: None,
        }
    }

    /// Returns the active session_id so the ingestion worker can stamp each
    /// telemetry row while charging is in progress.
    pub fn active_session_id(&self) -> Option<Uuid> {
        self.active_session_id
    }

    pub fn process(&mut self, event: &TelemetryEvent) -> ChargeEvent {
        let ts = event.ts;
        let state = event.charger_state.as_ref();

        if let Some(soc) = event.battery_level {
            self.last_soc = Some(soc);
            if self.is_charging && self.soc_start.is_none() {
                self.soc_start = Some(soc);
            }
        }
        if let Some(limit) = event.battery_limit {
            self.charge_limit = Some(limit);
        }
        if let Some(cap) = event.battery_capacity_wh {
            self.battery_capacity = Some(cap);
        }
        if self.is_charging && self.start_lat.is_none() && self.start_lng.is_none() {
            if let Some((lat, lng)) = valid_location_pair(event.latitude, event.longitude) {
                self.start_lat = Some(lat);
                self.start_lng = Some(lng);
            }
        }

        // Power integration (|power_kw| for charging — power_kw may be negative
        // for grid intake depending on sign convention; take absolute value).
        //
        // Two-layer glitch rejection:
        //
        //  1. Hard ceiling (PLAUSIBLE_MAX_CHARGE_KW): no real charger delivers
        //     more than ~220 kW to a Rivian.  Anything above 300 kW is hardware
        //     noise and is discarded unconditionally.
        //
        //  2. AC-baseline spike filter: when every reading so far is below
        //     DC_MIN_RATE_KW (the session is on a home/L2 circuit), one
        //     DC-rate reading is almost certainly a transient sensor glitch — a
        //     home charger cannot jump from 8 kW to 250 kW mid-session.  It is
        //     held, not counted.  A second DC-rate reading in a row confirms a
        //     real DC rate, for example a DC charger that ramps up after a
        //     low-power handshake.  A single bad sample therefore cannot flip
        //     the charger-type classification from AC to DC or corrupt the
        //     energy accumulator.
        if self.is_charging {
            if let Some(kw) = event.power_kw {
                let kw_abs = kw.abs();
                if kw_abs > 0.0 && kw_abs <= PLAUSIBLE_MAX_CHARGE_KW {
                    let ac_baseline =
                        self.peak_charge_kw > 0.0 && self.peak_charge_kw < DC_MIN_RATE_KW;
                    let is_dc_rate = kw_abs >= DC_MIN_RATE_KW;
                    if ac_baseline && is_dc_rate && self.pending_dc_reading_kw.is_none() {
                        self.pending_dc_reading_kw = Some(kw_abs);
                    } else {
                        if let Some(pending) = self.pending_dc_reading_kw.take() {
                            if is_dc_rate {
                                self.peak_charge_kw = self.peak_charge_kw.max(pending);
                            }
                        }
                        if let Some(last_t) = self.last_power_ts {
                            let dt_hours = (ts - last_t).num_milliseconds() as f64 / 3_600_000.0;
                            self.energy_used_wh_acc += kw_abs * 1_000.0 * dt_hours;
                        }
                        if kw_abs > self.peak_charge_kw {
                            self.peak_charge_kw = kw_abs;
                        }
                        self.last_power_ts = Some(ts);
                    }
                }
            }
        }

        let status = event.charger_status.as_deref();
        let has_remaining_charge_time = event
            .time_to_end_of_charge_min
            .is_some_and(|minutes| minutes > 0);
        let actively_charging =
            event.is_actively_charging() || (self.is_charging && has_remaining_charge_time);
        let session_ended = matches!(state, Some(ChargerState::Done | ChargerState::Disconnected))
            || matches!(status, Some("chrgr_sts_not_connected"))
            || (self.is_charging
                && matches!(status, Some("chrgr_sts_connected_no_chrg"))
                && !has_remaining_charge_time);

        // Start
        if !self.is_charging && actively_charging {
            let session_id = Uuid::new_v4();
            self.active_session_id = Some(session_id);
            self.is_charging = true;
            self.started_at = Some(ts);
            if let Some((lat, lng)) = valid_location_pair(event.latitude, event.longitude) {
                self.start_lat = Some(lat);
                self.start_lng = Some(lng);
            }
            self.soc_start = event.battery_level;
            self.last_charge_ts = Some(ts);
            self.last_charge_soc = event.battery_level;
            self.last_charge_odometer = event.odometer_miles;
            self.last_charge_peak_kw = 0.0;
            self.last_charge_energy_wh = 0.0;
            self.last_power_ts = Some(ts);
            self.energy_used_wh_acc = 0.0;
            self.peak_charge_kw = 0.0;
            self.pending_dc_reading_kw = None;
            return ChargeEvent::SessionStarted;
        }

        if self.is_charging {
            let soc_rising = matches!(
                (event.battery_level, self.last_charge_soc),
                (Some(now), Some(then)) if now - then >= SOC_RISE_MIN_PCT
            );
            let charging_now = actively_charging || soc_rising;
            if !charging_now && self.moved_since_last_charge(event) {
                return self.close_at_last_charge(ts);
            }
            if charging_now {
                self.last_charge_ts = Some(ts);
                self.last_charge_soc = self.last_soc;
                self.last_charge_peak_kw = self.peak_charge_kw;
                self.last_charge_energy_wh = self.energy_used_wh_acc;
                if event.odometer_miles.is_some() {
                    self.last_charge_odometer = event.odometer_miles;
                }
            } else if self.last_charge_odometer.is_none() {
                self.last_charge_odometer = event.odometer_miles;
            }

            // Timeout: no charging event in 30 min
            let timed_out = self
                .last_charge_ts
                .is_some_and(|last| (ts - last).num_seconds() > CHARGE_TIMEOUT_SECS);

            if session_ended {
                return self.close_session(ts);
            }
            if timed_out {
                return self.close_at_last_charge(ts);
            }
        }

        ChargeEvent::NoChange
    }

    /// A fresh odometer reading, taken after charging was last seen, shows the
    /// vehicle moved. Older (replayed or delayed) readings and GNSS speed,
    /// which jitters while parked, are not used.
    fn moved_since_last_charge(&self, event: &TelemetryEvent) -> bool {
        let (Some(odometer), Some(baseline), Some(last_charge)) = (
            event.odometer_miles,
            self.last_charge_odometer,
            self.last_charge_ts,
        ) else {
            return false;
        };
        let read_at = event.odometer_miles_ts.unwrap_or(event.ts);
        read_at > last_charge
            && (event.ts - read_at).num_seconds() <= MOTION_READING_MAX_AGE_SECS
            && odometer - baseline >= MOVED_MIN_MILES
    }

    /// Close a session that ended without an explicit charger signal (by
    /// timeout or motion) when charging was last seen, with the state of
    /// charge, peak and energy from then. Otherwise idle or driving time after
    /// the charge lengthens the session, lowers its end SOC and changes its
    /// rates. A session with no charging evidence after its start keeps the
    /// close time, so a real charge keeps its data.
    fn close_at_last_charge(&mut self, noticed_at: DateTime<Utc>) -> ChargeEvent {
        let ended_at = match (self.started_at, self.last_charge_ts) {
            (Some(started), Some(last)) if last > started => last,
            _ => return self.close_session(noticed_at),
        };
        if self.last_charge_soc.is_some() {
            self.last_soc = self.last_charge_soc;
        }
        self.peak_charge_kw = self.last_charge_peak_kw;
        self.energy_used_wh_acc = self.last_charge_energy_wh;
        self.close_session(ended_at)
    }

    fn close_session(&mut self, ended_at: DateTime<Utc>) -> ChargeEvent {
        let started_at = self.started_at.unwrap_or(ended_at);
        let duration_hours = (ended_at - started_at).num_seconds() as f64 / 3_600.0;

        // energy_added_wh from SOC delta × pack capacity
        let energy_added_wh = match (self.soc_start, self.last_soc, self.battery_capacity) {
            (Some(s0), Some(s1), Some(cap)) => {
                let delta = s1 - s0;
                if delta > 0.0 {
                    Some((delta / 100.0) * cap)
                } else {
                    None
                }
            }
            _ => None,
        };

        let energy_used_wh = if self.energy_used_wh_acc > 0.0 {
            Some(self.energy_used_wh_acc)
        } else {
            None
        };

        // Prefer grid-side integrated energy, but fall back to pack-side SOC
        // delta when Rivian omits power telemetry for the session.
        let avg_charge_rate_kw = energy_used_wh.or(energy_added_wh).and_then(|wh| {
            if duration_hours > 0.0 {
                Some(wh / 1_000.0 / duration_hours)
            } else {
                None
            }
        });

        // charger_type classification by peak power
        let charger_type = if self.peak_charge_kw > 0.0 {
            Some(classify_charger_type(self.peak_charge_kw).to_string())
        } else {
            avg_charge_rate_kw.map(|kw| classify_charger_type(kw).to_string())
        };
        let peak = if self.peak_charge_kw > 0.0 {
            Some(self.peak_charge_kw)
        } else {
            None
        };

        let session = CompletedChargeSession {
            session_id: self.active_session_id.unwrap_or_else(Uuid::new_v4),
            vehicle_id: self.vehicle_id,
            started_at,
            ended_at,
            location_lat: self.start_lat,
            location_lng: self.start_lng,
            soc_start: self.soc_start,
            soc_end: self.last_soc,
            charge_limit: self.charge_limit,
            battery_capacity_wh: self.battery_capacity,
            energy_used_wh,
            energy_added_wh,
            peak_charge_kw: peak,
            avg_charge_rate_kw,
            charger_type,
        };

        self.active_session_id = None;
        self.is_charging = false;
        self.started_at = None;
        self.start_lat = None;
        self.start_lng = None;
        self.soc_start = None;
        self.last_charge_ts = None;
        self.last_charge_soc = None;
        self.last_charge_odometer = None;
        self.last_charge_peak_kw = 0.0;
        self.last_charge_energy_wh = 0.0;
        self.pending_dc_reading_kw = None;
        self.last_power_ts = None;
        self.energy_used_wh_acc = 0.0;
        self.peak_charge_kw = 0.0;

        ChargeEvent::SessionEnded(session)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    fn event(
        vehicle_id: Uuid,
        ts: DateTime<Utc>,
        charger_state: Option<ChargerState>,
    ) -> TelemetryEvent {
        TelemetryEvent {
            charger_state,
            ..TelemetryEvent::empty(vehicle_id, ts)
        }
    }

    #[test]
    fn timed_out_session_ends_when_charging_was_last_seen() {
        // Shape of the Nov 6 R2 DC fast charge: no power readings, 28% to 72%
        // in 16 minutes, then "unknown" charger state until the timeout.
        let vehicle_id = Uuid::new_v4();
        let started_at = Utc::now() - Duration::hours(2);
        let mut detector = ChargeDetectorState::new(vehicle_id);

        let mut start = event(vehicle_id, started_at, Some(ChargerState::Charging));
        start.battery_level = Some(28.0);
        start.battery_capacity_wh = Some(91_500.0);
        detector.process(&start);

        let last_charging = started_at + Duration::minutes(16);
        let mut last = event(vehicle_id, last_charging, None);
        last.battery_level = Some(72.0);
        last.time_to_end_of_charge_min = Some(9);
        assert!(matches!(detector.process(&last), ChargeEvent::NoChange));

        // The level falls after charging stops (the car drives away without
        // odometer readings here), and the timeout must not keep that level.
        let mut idle = event(vehicle_id, last_charging + Duration::minutes(10), None);
        idle.battery_level = Some(64.0);
        assert!(matches!(detector.process(&idle), ChargeEvent::NoChange));

        let noticed = event(vehicle_id, last_charging + Duration::minutes(31), None);
        let ChargeEvent::SessionEnded(session) = detector.process(&noticed) else {
            panic!("expected the timeout to close the session");
        };

        assert_eq!(session.ended_at, last_charging);
        assert_eq!(session.soc_end, Some(72.0));
        let avg = session
            .avg_charge_rate_kw
            .expect("average rate from SOC delta");
        assert!(avg > 140.0, "average over charging time only, got {avg}");
        assert_eq!(session.charger_type.as_deref(), Some("dc"));
        assert_eq!(session.peak_charge_kw, None);
    }

    #[test]
    fn driving_away_ends_the_session_at_the_last_charging_reading() {
        let vehicle_id = Uuid::new_v4();
        let started_at = Utc::now() - Duration::hours(2);
        let mut detector = ChargeDetectorState::new(vehicle_id);

        let mut start = event(vehicle_id, started_at, Some(ChargerState::Charging));
        start.battery_level = Some(40.0);
        start.battery_capacity_wh = Some(91_500.0);
        start.odometer_miles = Some(12_000.0);
        detector.process(&start);

        let last_charging = started_at + Duration::minutes(20);
        let mut last = event(vehicle_id, last_charging, None);
        last.battery_level = Some(71.0);
        last.time_to_end_of_charge_min = Some(11);
        detector.process(&last);

        let mut parked = event(vehicle_id, last_charging + Duration::minutes(2), None);
        parked.odometer_miles = Some(12_000.04);
        assert!(matches!(detector.process(&parked), ChargeEvent::NoChange));

        let mut driving = event(vehicle_id, last_charging + Duration::minutes(6), None);
        driving.battery_level = Some(69.5);
        driving.odometer_miles = Some(12_002.3);
        let ChargeEvent::SessionEnded(session) = detector.process(&driving) else {
            panic!("motion must end the session");
        };
        assert_eq!(session.ended_at, last_charging);
        assert_eq!(session.soc_end, Some(71.0));
        assert_eq!(session.charger_type.as_deref(), Some("dc"));
        assert_eq!(detector.active_session_id(), None);
    }

    #[test]
    fn keeps_a_dc_ramp_that_starts_at_a_low_rate() {
        let vehicle_id = Uuid::new_v4();
        let started_at = Utc::now() - Duration::hours(1);
        let mut detector = ChargeDetectorState::new(vehicle_id);

        detector.process(&event(vehicle_id, started_at, Some(ChargerState::Charging)));
        let mut handshake = event(
            vehicle_id,
            started_at + Duration::seconds(10),
            Some(ChargerState::Charging),
        );
        handshake.power_kw = Some(6.0);
        detector.process(&handshake);
        let mut ramp = event(
            vehicle_id,
            started_at + Duration::seconds(40),
            Some(ChargerState::Charging),
        );
        ramp.power_kw = Some(184.0);
        detector.process(&ramp);
        // A second DC-rate reading confirms the ramp.
        let mut steady = event(
            vehicle_id,
            started_at + Duration::seconds(70),
            Some(ChargerState::Charging),
        );
        steady.power_kw = Some(186.4);
        detector.process(&steady);

        let end = event(
            vehicle_id,
            started_at + Duration::minutes(20),
            Some(ChargerState::Done),
        );
        let ChargeEvent::SessionEnded(session) = detector.process(&end) else {
            panic!("expected completed charge session");
        };
        assert_eq!(session.peak_charge_kw, Some(186.4));
        assert_eq!(session.charger_type.as_deref(), Some("dc"));
    }

    #[test]
    fn an_early_single_glitch_cannot_make_an_ac_session_dc() {
        let vehicle_id = Uuid::new_v4();
        let started_at = Utc::now() - Duration::hours(3);
        let mut detector = ChargeDetectorState::new(vehicle_id);

        detector.process(&event(vehicle_id, started_at, Some(ChargerState::Charging)));
        for (seconds, kw) in [(30_i64, 11.0_f64), (60, 45.0), (90, 11.2), (120, 11.1)] {
            let mut reading = event(
                vehicle_id,
                started_at + Duration::seconds(seconds),
                Some(ChargerState::Charging),
            );
            reading.power_kw = Some(kw);
            detector.process(&reading);
        }
        let end = event(
            vehicle_id,
            started_at + Duration::minutes(40),
            Some(ChargerState::Done),
        );
        let ChargeEvent::SessionEnded(session) = detector.process(&end) else {
            panic!("expected completed charge session");
        };
        assert_eq!(session.peak_charge_kw, Some(11.2));
        assert_eq!(session.charger_type.as_deref(), Some("ac"));
    }

    #[test]
    fn gnss_speed_jitter_and_stale_odometer_do_not_end_a_charge() {
        let vehicle_id = Uuid::new_v4();
        let started_at = Utc::now() - Duration::hours(1);
        let mut detector = ChargeDetectorState::new(vehicle_id);

        let mut start = event(vehicle_id, started_at, Some(ChargerState::Charging));
        start.odometer_miles = Some(12_000.0);
        detector.process(&start);
        let session_id = detector.active_session_id();

        // Parking-garage GNSS jitter on a frame without charger signals.
        let mut jitter = event(vehicle_id, started_at + Duration::minutes(3), None);
        jitter.speed_mph = Some(3.4);
        assert!(matches!(detector.process(&jitter), ChargeEvent::NoChange));

        let mut charging = event(
            vehicle_id,
            started_at + Duration::minutes(6),
            Some(ChargerState::Charging),
        );
        charging.speed_mph = Some(4.0);
        assert!(matches!(detector.process(&charging), ChargeEvent::NoChange));

        // A delayed odometer reading taken before the last charging reading.
        let mut stale = event(vehicle_id, started_at + Duration::minutes(8), None);
        stale.odometer_miles = Some(12_004.0);
        stale.odometer_miles_ts = Some(started_at + Duration::minutes(5));
        assert!(matches!(detector.process(&stale), ChargeEvent::NoChange));

        // One 1 km odometer step is below the motion limit.
        let mut step = event(vehicle_id, started_at + Duration::minutes(9), None);
        step.odometer_miles = Some(12_000.62);
        assert!(matches!(detector.process(&step), ChargeEvent::NoChange));
        assert_eq!(detector.active_session_id(), session_id);
    }

    #[test]
    fn rising_soc_counts_as_charging_without_charger_signals() {
        let vehicle_id = Uuid::new_v4();
        let started_at = Utc::now() - Duration::hours(2);
        let mut detector = ChargeDetectorState::new(vehicle_id);

        let mut start = event(vehicle_id, started_at, Some(ChargerState::Charging));
        start.battery_level = Some(40.0);
        start.battery_capacity_wh = Some(91_500.0);
        detector.process(&start);
        for (minutes, soc) in [(10_i64, 46.0_f64), (20, 52.0), (25, 52.2)] {
            let mut sample = event(vehicle_id, started_at + Duration::minutes(minutes), None);
            sample.battery_level = Some(soc);
            detector.process(&sample);
        }
        let noticed = event(vehicle_id, started_at + Duration::minutes(51), None);
        let ChargeEvent::SessionEnded(session) = detector.process(&noticed) else {
            panic!("expected the timeout to close the session");
        };
        // 52.2 is not 0.5 above 52.0, so the charge ended at minute 20.
        assert_eq!(session.ended_at, started_at + Duration::minutes(20));
        assert_eq!(session.soc_end, Some(52.0));
    }

    #[test]
    fn a_charge_without_later_evidence_keeps_the_timeout_close() {
        let vehicle_id = Uuid::new_v4();
        let started_at = Utc::now() - Duration::hours(2);
        let mut detector = ChargeDetectorState::new(vehicle_id);

        let mut start = event(vehicle_id, started_at, Some(ChargerState::Charging));
        start.battery_level = Some(40.0);
        detector.process(&start);
        let noticed_at = started_at + Duration::minutes(31);
        let ChargeEvent::SessionEnded(session) =
            detector.process(&event(vehicle_id, noticed_at, None))
        else {
            panic!("expected the timeout to close the session");
        };
        assert_eq!(session.ended_at, noticed_at);
    }

    #[test]
    fn power_after_the_last_charging_reading_is_not_kept() {
        let vehicle_id = Uuid::new_v4();
        let started_at = Utc::now() - Duration::hours(2);
        let mut detector = ChargeDetectorState::new(vehicle_id);

        detector.process(&event(vehicle_id, started_at, Some(ChargerState::Charging)));
        let mut charging = event(
            vehicle_id,
            started_at + Duration::minutes(10),
            Some(ChargerState::Charging),
        );
        charging.power_kw = Some(11.0);
        detector.process(&charging);
        let last_charging = started_at + Duration::minutes(40);
        let mut last = event(vehicle_id, last_charging, Some(ChargerState::Charging));
        last.power_kw = Some(11.0);
        detector.process(&last);

        // Drive power after the charge stopped, without charger signals.
        let mut drive = event(vehicle_id, last_charging + Duration::minutes(5), None);
        drive.power_kw = Some(15.0);
        detector.process(&drive);

        let noticed = event(vehicle_id, last_charging + Duration::minutes(31), None);
        let ChargeEvent::SessionEnded(session) = detector.process(&noticed) else {
            panic!("expected the timeout to close the session");
        };
        assert_eq!(session.ended_at, last_charging);
        assert_eq!(session.peak_charge_kw, Some(11.0));
        // 11 kW from the start to minute 40; the drive minutes are not kept.
        let energy = session.energy_used_wh.expect("integrated energy");
        assert!(
            (energy - 7_333.3).abs() < 1.0,
            "40 min at 11 kW, got {energy}"
        );
    }

    #[test]
    fn still_drops_a_late_spike_on_an_ac_session() {
        let vehicle_id = Uuid::new_v4();
        let started_at = Utc::now() - Duration::hours(3);
        let mut detector = ChargeDetectorState::new(vehicle_id);

        // The first event only starts the session, so the AC baseline comes
        // from the next reading.
        detector.process(&event(vehicle_id, started_at, Some(ChargerState::Charging)));
        let mut steady = event(
            vehicle_id,
            started_at + Duration::minutes(2),
            Some(ChargerState::Charging),
        );
        steady.power_kw = Some(11.0);
        detector.process(&steady);
        let mut spike = event(
            vehicle_id,
            started_at + Duration::minutes(25),
            Some(ChargerState::Charging),
        );
        spike.power_kw = Some(250.0);
        detector.process(&spike);

        let end = event(
            vehicle_id,
            started_at + Duration::minutes(50),
            Some(ChargerState::Done),
        );
        let ChargeEvent::SessionEnded(session) = detector.process(&end) else {
            panic!("expected completed charge session");
        };
        assert_eq!(session.peak_charge_kw, Some(11.0));
        assert_eq!(session.charger_type.as_deref(), Some("ac"));
    }

    #[test]
    fn fills_start_soc_and_location_from_later_charge_samples() {
        let vehicle_id = Uuid::new_v4();
        let started_at = Utc::now();
        let mut detector = ChargeDetectorState::new(vehicle_id);

        assert!(matches!(
            detector.process(&event(vehicle_id, started_at, Some(ChargerState::Charging))),
            ChargeEvent::SessionStarted
        ));

        let mut follow_up = event(vehicle_id, started_at + Duration::minutes(2), None);
        follow_up.battery_level = Some(42.0);
        follow_up.battery_capacity_wh = Some(111_000.0);
        follow_up.latitude = Some(29.81);
        follow_up.longitude = Some(-95.38);
        assert!(matches!(
            detector.process(&follow_up),
            ChargeEvent::NoChange
        ));

        let mut end = event(
            vehicle_id,
            started_at + Duration::minutes(62),
            Some(ChargerState::Done),
        );
        end.battery_level = Some(52.0);
        let ChargeEvent::SessionEnded(session) = detector.process(&end) else {
            panic!("expected completed charge session");
        };

        assert_eq!(session.soc_start, Some(42.0));
        assert_eq!(session.location_lat, Some(29.81));
        assert_eq!(session.location_lng, Some(-95.38));
        assert!(session.energy_added_wh.is_some());
    }

    #[test]
    fn skips_zero_zero_location_until_a_real_sample_arrives() {
        let vehicle_id = Uuid::new_v4();
        let started_at = Utc::now();
        let mut detector = ChargeDetectorState::new(vehicle_id);

        let mut start = event(vehicle_id, started_at, Some(ChargerState::Charging));
        start.latitude = Some(0.0);
        start.longitude = Some(0.0);
        assert!(matches!(
            detector.process(&start),
            ChargeEvent::SessionStarted
        ));

        let mut follow_up = event(vehicle_id, started_at + Duration::minutes(3), None);
        follow_up.latitude = Some(29.81);
        follow_up.longitude = Some(-95.38);
        follow_up.battery_level = Some(43.0);
        assert!(matches!(
            detector.process(&follow_up),
            ChargeEvent::NoChange
        ));

        let mut end = event(
            vehicle_id,
            started_at + Duration::minutes(63),
            Some(ChargerState::Done),
        );
        end.battery_level = Some(55.0);
        let ChargeEvent::SessionEnded(session) = detector.process(&end) else {
            panic!("expected completed charge session");
        };

        assert_eq!(session.location_lat, Some(29.81));
        assert_eq!(session.location_lng, Some(-95.38));
    }

    #[test]
    fn classifies_from_average_rate_when_peak_power_is_missing() {
        let vehicle_id = Uuid::new_v4();
        let started_at = Utc::now();
        let mut detector = ChargeDetectorState::new(vehicle_id);

        let mut start = event(vehicle_id, started_at, Some(ChargerState::Charging));
        start.battery_level = Some(40.0);
        start.battery_capacity_wh = Some(100_000.0);
        detector.process(&start);

        let mut end = event(
            vehicle_id,
            started_at + Duration::minutes(70),
            Some(ChargerState::Done),
        );
        end.battery_level = Some(50.0);
        let ChargeEvent::SessionEnded(session) = detector.process(&end) else {
            panic!("expected completed charge session");
        };

        assert_eq!(session.charger_type.as_deref(), Some("ac"));
    }

    #[test]
    fn keeps_partial_charging_patches_in_one_session() {
        let vehicle_id = Uuid::new_v4();
        let started_at = Utc::now();
        let mut detector = ChargeDetectorState::new(vehicle_id);

        let mut start = event(vehicle_id, started_at, Some(ChargerState::Charging));
        start.battery_level = Some(33.0);
        start.battery_capacity_wh = Some(111_000.0);
        assert!(matches!(
            detector.process(&start),
            ChargeEvent::SessionStarted
        ));
        let session_id = detector.active_session_id();

        let mut patch = event(vehicle_id, started_at + Duration::minutes(45), None);
        patch.battery_level = Some(38.0);
        patch.time_to_end_of_charge_min = Some(250);
        assert!(matches!(detector.process(&patch), ChargeEvent::NoChange));
        assert_eq!(detector.active_session_id(), session_id);

        let mut end = event(vehicle_id, started_at + Duration::minutes(120), None);
        end.battery_level = Some(75.0);
        end.charger_status = Some("chrgr_sts_connected_no_chrg".to_string());
        let ChargeEvent::SessionEnded(session) = detector.process(&end) else {
            panic!("expected completed charge session");
        };

        assert_eq!(session.session_id, session_id.unwrap());
        assert_eq!(session.soc_start, Some(33.0));
        assert_eq!(session.soc_end, Some(75.0));
    }

    #[test]
    fn rehydrated_session_keeps_existing_session_id_until_completion() {
        let vehicle_id = Uuid::new_v4();
        let session_id = Uuid::new_v4();
        let started_at = Utc::now() - Duration::minutes(45);
        let mut detector = ChargeDetectorState::from_snapshot(
            vehicle_id,
            ActiveChargeSessionSnapshot {
                session_id,
                started_at,
                location_lat: Some(29.81),
                location_lng: Some(-95.38),
                soc_start: Some(40.0),
                last_soc: Some(48.0),
                charge_limit: Some(80.0),
                battery_capacity_wh: Some(111_000.0),
                last_charge_ts: started_at + Duration::minutes(40),
                last_power_ts: Some(started_at + Duration::minutes(40)),
                energy_used_wh: 18_000.0,
                peak_charge_kw: 10.5,
            },
        );

        let mut patch = event(vehicle_id, started_at + Duration::minutes(50), None);
        patch.battery_level = Some(50.0);
        patch.time_to_end_of_charge_min = Some(25);
        assert!(matches!(detector.process(&patch), ChargeEvent::NoChange));
        assert_eq!(detector.active_session_id(), Some(session_id));

        let mut end = event(
            vehicle_id,
            started_at + Duration::minutes(70),
            Some(ChargerState::Done),
        );
        end.battery_level = Some(60.0);
        let ChargeEvent::SessionEnded(session) = detector.process(&end) else {
            panic!("expected completed charge session");
        };

        assert_eq!(session.session_id, session_id);
        assert_eq!(session.soc_start, Some(40.0));
        assert_eq!(session.soc_end, Some(60.0));
        assert!(session.energy_used_wh.unwrap_or_default() >= 18_000.0);
    }
}
