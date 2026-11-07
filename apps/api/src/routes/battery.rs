use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use uuid::Uuid;

use crate::{
    db::vehicles::require_vehicle_read_access,
    errors::AppError,
    middleware::auth::{require_vehicle_access, AppState, AuthUser},
    routes::idle_drain::fetch_validated_idle_drain_periods_for_chart,
    routes::range_normalization::{
        normalize_remaining_range_miles_strict, projected_full_charge_range_miles,
    },
};

/// Smallest capacity, in Wh, that counts as a real pack reading. Smaller values are
/// placeholders or partial telemetry and must not become the "new" baseline.
const MIN_PLAUSIBLE_CAPACITY_WH: f64 = 10_000.0;

/// Where the "new" capacity baseline for battery health comes from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum NewCapacitySource {
    /// The stored vehicle capacity (`vehicles.battery_capacity_wh`): the model default
    /// or the value the owner sets in Settings → Vehicles.
    Factory,
    /// The highest capacity seen in telemetry. This can hide wear that happened before
    /// Riviamigo first saw the vehicle.
    HighestSeen,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct NewCapacityBaseline {
    wh: f64,
    source: NewCapacitySource,
}

fn plausible_capacity_wh(value: Option<f64>) -> Option<f64> {
    value.filter(|w| w.is_finite() && *w > MIN_PLAUSIBLE_CAPACITY_WH)
}

/// Picks the "new" capacity baseline: the stored factory capacity when it is plausible,
/// else the highest observed capacity, else nothing.
fn select_new_capacity_baseline(
    stored_wh: Option<f64>,
    highest_seen_wh: Option<f64>,
) -> Option<NewCapacityBaseline> {
    if let Some(wh) = plausible_capacity_wh(stored_wh) {
        return Some(NewCapacityBaseline {
            wh,
            source: NewCapacitySource::Factory,
        });
    }
    plausible_capacity_wh(highest_seen_wh).map(|wh| NewCapacityBaseline {
        wh,
        source: NewCapacitySource::HighestSeen,
    })
}

/// Resolves the "new" capacity baseline for health % with its source. Reads the stored
/// factory capacity (vehicles.battery_capacity_wh) first and only queries telemetry for
/// the highest observed capacity when no plausible factory value exists.
async fn resolve_new_capacity_baseline(
    pool: &sqlx::PgPool,
    vehicle_id: uuid::Uuid,
) -> Result<Option<NewCapacityBaseline>, crate::errors::AppError> {
    let stored: Option<f64> =
        sqlx::query_scalar("SELECT battery_capacity_wh FROM riviamigo.vehicles WHERE id = $1")
            .bind(vehicle_id)
            .fetch_optional(pool)
            .await?
            .flatten();

    if let Some(baseline) = select_new_capacity_baseline(stored, None) {
        return Ok(Some(baseline));
    }

    let highest_seen: Option<f64> = sqlx::query_scalar(
        "SELECT max(battery_capacity_wh) FROM timeseries.telemetry \
         WHERE vehicle_id = $1 AND battery_capacity_wh > $2",
    )
    .bind(vehicle_id)
    .bind(MIN_PLAUSIBLE_CAPACITY_WH)
    .fetch_optional(pool)
    .await?
    .flatten();

    Ok(select_new_capacity_baseline(stored, highest_seen))
}

/// The "new" capacity baseline in Wh, without its source.
async fn resolve_usable_new_wh(
    pool: &sqlx::PgPool,
    vehicle_id: uuid::Uuid,
) -> Result<Option<f64>, crate::errors::AppError> {
    Ok(resolve_new_capacity_baseline(pool, vehicle_id)
        .await?
        .map(|baseline| baseline.wh))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/battery/soc", get(get_soc))
        .route("/battery/range", get(get_range))
        .route("/battery/capacity", get(get_capacity))
        .route("/battery/health", get(get_health))
        .route("/battery/mileage", get(get_mileage))
        .route("/battery/phantom-drain", get(get_phantom_drain))
        .route("/battery/degradation", get(get_degradation))
}

#[derive(Debug, Deserialize)]
pub struct TimeRangeParams {
    pub vehicle_id: Option<Uuid>,
    pub from: Option<DateTime<Utc>>,
    pub to: Option<DateTime<Utc>>,
    pub lifetime: Option<bool>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct TimeSeriesPoint {
    pub ts: DateTime<Utc>,
    pub value: Option<f64>,
}

fn resolve_time_bounds(
    from: Option<DateTime<Utc>>,
    to: Option<DateTime<Utc>>,
    lifetime: bool,
    default_days: i64,
) -> (DateTime<Utc>, DateTime<Utc>) {
    let resolved_to = to.unwrap_or_else(Utc::now);
    let resolved_from = if lifetime {
        DateTime::<Utc>::from_timestamp(0, 0).unwrap_or(resolved_to - chrono::Duration::days(3650))
    } else {
        from.unwrap_or_else(|| Utc::now() - chrono::Duration::days(default_days))
    };
    (resolved_from, resolved_to)
}

async fn get_soc(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(p): Query<TimeRangeParams>,
) -> Result<Json<Vec<TimeSeriesPoint>>, AppError> {
    let vid = p
        .vehicle_id
        .ok_or(AppError::Validation("vehicle_id required".into()))?;
    require_vehicle_access(&auth, vid)?;
    require_vehicle_read_access(&state.pool, &auth, vid).await?;
    let (from, to) = resolve_time_bounds(p.from, p.to, p.lifetime.unwrap_or(false), 7);

    let points = sqlx::query_as::<_, TimeSeriesPoint>(
        "SELECT ts, battery_level AS value
         FROM timeseries.telemetry
         WHERE vehicle_id=$1 AND ts>=$2 AND ts<=$3 AND battery_level IS NOT NULL
         ORDER BY ts",
    )
    .bind(vid)
    .bind(from)
    .bind(to)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(points))
}

async fn get_range(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(p): Query<TimeRangeParams>,
) -> Result<Json<Vec<TimeSeriesPoint>>, AppError> {
    let vid = p
        .vehicle_id
        .ok_or(AppError::Validation("vehicle_id required".into()))?;
    require_vehicle_access(&auth, vid)?;
    require_vehicle_read_access(&state.pool, &auth, vid).await?;
    let (from, to) = resolve_time_bounds(p.from, p.to, p.lifetime.unwrap_or(false), 30);

    let points = sqlx::query_as::<_, TimeSeriesPoint>(
        "SELECT ts, distance_to_empty_mi AS value
         FROM timeseries.telemetry
         WHERE vehicle_id=$1 AND ts>=$2 AND ts<=$3 AND distance_to_empty_mi IS NOT NULL
         ORDER BY ts",
    )
    .bind(vid)
    .bind(from)
    .bind(to)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(points))
}

async fn get_capacity(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(p): Query<TimeRangeParams>,
) -> Result<Json<Vec<TimeSeriesPoint>>, AppError> {
    let vid = p
        .vehicle_id
        .ok_or(AppError::Validation("vehicle_id required".into()))?;
    require_vehicle_access(&auth, vid)?;
    require_vehicle_read_access(&state.pool, &auth, vid).await?;
    let (from, to) = resolve_time_bounds(p.from, p.to, p.lifetime.unwrap_or(false), 365);

    let points = sqlx::query_as::<_, TimeSeriesPoint>(
        "SELECT ts, battery_capacity_wh AS value FROM timeseries.telemetry \
         WHERE vehicle_id=$1 AND ts>=$2 AND ts<=$3 AND battery_capacity_wh IS NOT NULL ORDER BY ts",
    )
    .bind(vid)
    .bind(from)
    .bind(to)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(points))
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PhantomDrainPoint {
    pub day: Option<NaiveDate>,
    pub total_soc_lost: Option<f64>,
    pub avg_drain_rate: Option<f64>,
    pub hours_parked: Option<f64>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DegradationPoint {
    pub ts: DateTime<Utc>,
    pub odometer_mi: Option<f64>,
    pub usable_kwh: f64,
    pub rated_kwh: Option<f64>,
    pub capacity_pct: Option<f64>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct BatteryMileagePoint {
    pub ts: DateTime<Utc>,
    pub odometer_mi: Option<f64>,
    pub usable_kwh: Option<f64>,
    pub range_mi: Option<f64>,
    pub projected_max_range_mi: Option<f64>,
    pub degradation_pct: Option<f64>,
}

#[derive(Debug, sqlx::FromRow)]
struct BatteryMileageSampleRow {
    bucket: DateTime<Utc>,
    odometer_miles: Option<f64>,
    battery_capacity_wh: Option<f64>,
    distance_to_empty_mi: Option<f64>,
    battery_level: Option<f64>,
}

async fn get_degradation(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(p): Query<TimeRangeParams>,
) -> Result<Json<Vec<DegradationPoint>>, AppError> {
    let vid = p
        .vehicle_id
        .ok_or(AppError::Validation("vehicle_id required".into()))?;
    require_vehicle_access(&auth, vid)?;
    require_vehicle_read_access(&state.pool, &auth, vid).await?;

    let (from, to) = resolve_time_bounds(p.from, p.to, p.lifetime.unwrap_or(false), 365);
    let usable_new_wh = resolve_usable_new_wh(&state.pool, vid).await?;

    let rows = sqlx::query_as::<_, DegradationPoint>(
        "SELECT
             ts,
             odometer_miles AS odometer_mi,
             COALESCE(battery_capacity_wh / 1000.0, 0.0) AS usable_kwh,
             NULL::float8 AS rated_kwh,
             CASE WHEN $2 > 0
                  THEN battery_capacity_wh / $2 * 100.0
                  ELSE NULL END AS capacity_pct
          FROM timeseries.telemetry
          WHERE vehicle_id = $1 AND battery_capacity_wh > 10000
            AND ts >= $3 AND ts <= $4
          ORDER BY ts",
    )
    .bind(vid)
    .bind(usable_new_wh.unwrap_or(0.0))
    .bind(from)
    .bind(to)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(rows))
}

async fn get_health(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(p): Query<TimeRangeParams>,
) -> Result<Json<serde_json::Value>, AppError> {
    let vid = p
        .vehicle_id
        .ok_or(AppError::Validation("vehicle_id required".into()))?;
    require_vehicle_access(&auth, vid)?;
    require_vehicle_read_access(&state.pool, &auth, vid).await?;

    let new_baseline = resolve_new_capacity_baseline(&state.pool, vid).await?;

    // Average of daily-peak capacity readings over the last 30 days
    let usable_now_wh: Option<f64> = sqlx::query_scalar(
        "SELECT avg(daily_max) FROM (
             SELECT max(battery_capacity_wh) AS daily_max
             FROM timeseries.telemetry
             WHERE vehicle_id = $1
               AND battery_capacity_wh > 10000
               AND ts >= now() - INTERVAL '30 days'
             GROUP BY date_trunc('day', ts)
         ) sub",
    )
    .bind(vid)
    .fetch_optional(&state.pool)
    .await?
    .flatten();

    let charges = sqlx::query!(
        "SELECT COUNT(*) AS charge_count,
                SUM(COALESCE(kwh_added, energy_added_wh / 1000.0)) AS total_added_kwh,
                SUM(GREATEST(COALESCE(kwh_added, energy_added_wh / 1000.0), COALESCE(energy_used_wh / 1000.0, 0))) AS total_used_kwh
         FROM riviamigo.charge_sessions
         WHERE vehicle_id=$1 AND COALESCE(kwh_added, energy_added_wh / 1000.0) > 0.01",
        vid
    )
    .fetch_one(&state.pool)
    .await?;

    let usable_now_kwh = usable_now_wh.map(|w| w / 1000.0);
    let usable_new_kwh = new_baseline.map(|baseline| baseline.wh / 1000.0);
    let new_capacity_source = new_baseline.map(|baseline| baseline.source);
    let total_added = charges.total_added_kwh;
    let total_used = charges.total_used_kwh;
    let battery_health_pct = match (usable_now_kwh, usable_new_kwh) {
        (Some(now), Some(new)) if new > 0.0 => Some((now / new * 100.0).min(100.0)),
        _ => None,
    };
    let charging_cycles = match (total_added, usable_new_kwh) {
        (Some(added), Some(new)) if new > 0.0 => Some((added / new).floor()),
        _ => None,
    };
    let charging_efficiency_pct = match (total_added, total_used) {
        (Some(added), Some(used)) if used > 0.0 => Some(added / used * 100.0),
        _ => None,
    };

    Ok(Json(serde_json::json!({
        "usable_now_kwh": usable_now_kwh,
        "usable_new_kwh": usable_new_kwh,
        "new_capacity_kwh": usable_new_kwh,
        "new_capacity_source": new_capacity_source,
        "battery_health_pct": battery_health_pct,
        "estimated_degradation_pct": battery_health_pct.map(|pct| (100.0 - pct).max(0.0)),
        "charging_cycles": charging_cycles,
        "charge_count": charges.charge_count,
        "total_energy_added_kwh": total_added,
        "total_energy_used_kwh": total_used,
        "charging_efficiency_pct": charging_efficiency_pct,
    })))
}

async fn get_mileage(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(p): Query<TimeRangeParams>,
) -> Result<Json<Vec<BatteryMileagePoint>>, AppError> {
    let vid = p
        .vehicle_id
        .ok_or(AppError::Validation("vehicle_id required".into()))?;
    require_vehicle_access(&auth, vid)?;
    require_vehicle_read_access(&state.pool, &auth, vid).await?;

    let (from, to) = resolve_time_bounds(p.from, p.to, p.lifetime.unwrap_or(false), 730);
    let usable_new_wh = resolve_usable_new_wh(&state.pool, vid).await?;
    let vehicle_model: Option<String> =
        sqlx::query_scalar("SELECT model FROM riviamigo.vehicles WHERE id = $1")
            .bind(vid)
            .fetch_optional(&state.pool)
            .await?;

    let samples = sqlx::query_as::<_, BatteryMileageSampleRow>(
        "SELECT
             ts AS bucket,
             odometer_miles,
             battery_capacity_wh,
             distance_to_empty_mi,
             battery_level
         FROM timeseries.telemetry
         WHERE vehicle_id = $1
           AND battery_capacity_wh > 10000
           AND ts >= $2
           AND ts <= $3
          ORDER BY ts",
    )
    .bind(vid)
    .bind(from)
    .bind(to)
    .fetch_all(&state.pool)
    .await?;

    let usable_new_wh = usable_new_wh.unwrap_or(0.0);
    let rows = samples
        .iter()
        .map(|sample| {
            let usable_kwh = sample
                .battery_capacity_wh
                .filter(|value| value.is_finite() && *value > 0.0)
                .map(|capacity_wh| {
                    if capacity_wh > 1000.0 {
                        capacity_wh / 1000.0
                    } else {
                        capacity_wh
                    }
                });
            let range_mi = normalize_remaining_range_miles_strict(
                sample.distance_to_empty_mi,
                sample.battery_level,
                sample.battery_capacity_wh,
                vehicle_model.as_deref(),
            );
            let degradation_pct = match (usable_kwh, usable_new_wh > 0.0) {
                (Some(usable_kwh), true) => {
                    Some((100.0 - (usable_kwh * 1000.0 / usable_new_wh * 100.0)).max(0.0))
                }
                _ => None,
            };

            BatteryMileagePoint {
                ts: sample.bucket,
                odometer_mi: sample.odometer_miles.filter(|value| value.is_finite()),
                usable_kwh,
                range_mi,
                projected_max_range_mi: projected_full_charge_range_miles(
                    range_mi,
                    sample.battery_level,
                ),
                degradation_pct,
            }
        })
        .collect::<Vec<_>>();

    Ok(Json(rows))
}

async fn get_phantom_drain(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(p): Query<TimeRangeParams>,
) -> Result<Json<Vec<PhantomDrainPoint>>, AppError> {
    let vid = p
        .vehicle_id
        .ok_or(AppError::Validation("vehicle_id required".into()))?;
    require_vehicle_access(&auth, vid)?;
    require_vehicle_read_access(&state.pool, &auth, vid).await?;
    let (from, to) = resolve_time_bounds(p.from, p.to, p.lifetime.unwrap_or(false), 90);
    let periods = fetch_validated_idle_drain_periods_for_chart(&state.pool, vid, from, to).await?;

    let mut by_day = BTreeMap::<NaiveDate, (f64, f64)>::new();
    for period in periods {
        let Some(day) = period.period_start.map(|ts| ts.date_naive()) else {
            continue;
        };
        let duration = period.duration_hours.unwrap_or(0.0);
        let soc_lost = period.soc_lost_pct.unwrap_or(0.0);
        let entry = by_day.entry(day).or_insert((0.0, 0.0));
        entry.0 += soc_lost;
        entry.1 += duration;
    }

    let points = by_day
        .into_iter()
        .map(|(day, (total_soc_lost, hours_parked))| PhantomDrainPoint {
            day: Some(day),
            total_soc_lost: Some(total_soc_lost),
            avg_drain_rate: if hours_parked > 0.0 {
                Some(total_soc_lost / hours_parked)
            } else {
                None
            },
            hours_parked: Some(hours_parked),
        })
        .collect::<Vec<_>>();

    Ok(Json(points))
}

#[cfg(test)]
mod tests {
    use axum::body::Body;
    use http::{Request, StatusCode};
    use tower::ServiceExt;

    // Run with: cargo test -- --ignored

    async fn make_app() -> axum::Router {
        use crate::middleware::auth::{AppState, JwtKeys};
        use std::sync::Arc;

        let database_url =
            std::env::var("DATABASE_URL").expect("DATABASE_URL must be set for integration tests");
        let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1/".into());

        let pool = crate::db::pool::create_pool(&database_url)
            .await
            .expect("create_pool");
        let redis = redis::Client::open(redis_url).expect("redis client");

        let keys = crate::keys::generate_keys().expect("generate test keys");
        let jwt_keys =
            Arc::new(JwtKeys::new(&keys.jwt_private_pem, &keys.jwt_public_pem).expect("jwt keys"));

        let config = crate::config::Config {
            database_url: database_url.clone(),
            redis_url: "redis://127.0.0.1/".into(),
            jwt_secret: None,
            jwt_public_key: None,
            age_encryption_key: None,
            port: 3001,
            allowed_origins: vec!["http://localhost:3000".into()],
            s3_endpoint: None,
            s3_access_key: None,
            s3_secret_key: None,
            backup_artifact_dir: std::env::temp_dir()
                .join("riviamigo-route-test-backups")
                .to_string_lossy()
                .into_owned(),
            vehicle_image_cache_dir: std::env::temp_dir()
                .join("riviamigo-route-test-vehicle-images")
                .to_string_lossy()
                .into_owned(),
            backup_driver: "pg_dump".into(),
            backup_poll_interval_seconds: 60,
            restore_agent_url: "http://127.0.0.1:3002".into(),
            restore_agent_key_file: "/backups/.restore-agent-key".into(),
            recovery: crate::config::RecoveryConfig::default(),
            origin_bind: crate::config::OriginBindConfig::default(),
            security: Default::default(),
            rivian_ws_reconnect_initial_seconds: 10,
            rivian_ws_reconnect_max_seconds: 900,
            rivian_raw_event_retention_days: 7,
            rivian_persist_raw_events: true,
            rivian_suppress_duplicate_telemetry: true,
            riviamigo_env: None,
            cookie_insecure: None,
            allow_insecure_lan_http_auth: false,
            rate_limit: crate::config::RateLimitConfig::default(),
        };

        let state = AppState {
            pool,
            redis,
            jwt_keys,
            age_key: "AGE-SECRET-KEY-1QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ"
                .to_string(),
            config,
            nominatim_cache: std::sync::Arc::new(tokio::sync::RwLock::new(
                std::collections::HashMap::new(),
            )),
            supervisor: crate::ingestion::supervisor::SupervisorHandle::noop(),
            resources: Default::default(),
        };

        crate::routes::build_router(state)
    }

    async fn get_status(app: axum::Router, uri: &str) -> http::StatusCode {
        let req = Request::builder()
            .method("GET")
            .uri(uri)
            .body(Body::empty())
            .unwrap();
        app.oneshot(req).await.unwrap().status()
    }

    #[tokio::test]
    #[ignore = "requires DATABASE_URL"]
    async fn battery_soc_requires_auth() {
        let app = make_app().await;
        assert_eq!(
            get_status(app, "/v1/battery/soc").await,
            StatusCode::UNAUTHORIZED
        );
    }

    #[tokio::test]
    #[ignore = "requires DATABASE_URL"]
    async fn battery_range_requires_auth() {
        let app = make_app().await;
        assert_eq!(
            get_status(app, "/v1/battery/range").await,
            StatusCode::UNAUTHORIZED
        );
    }

    #[tokio::test]
    #[ignore = "requires DATABASE_URL"]
    async fn battery_capacity_requires_auth() {
        let app = make_app().await;
        assert_eq!(
            get_status(app, "/v1/battery/capacity").await,
            StatusCode::UNAUTHORIZED
        );
    }

    #[tokio::test]
    #[ignore = "requires DATABASE_URL"]
    async fn battery_phantom_drain_requires_auth() {
        let app = make_app().await;
        assert_eq!(
            get_status(app, "/v1/battery/phantom-drain").await,
            StatusCode::UNAUTHORIZED
        );
    }

    #[tokio::test]
    #[ignore = "requires DATABASE_URL"]
    async fn battery_degradation_requires_auth() {
        let app = make_app().await;
        assert_eq!(
            get_status(app, "/v1/battery/degradation").await,
            StatusCode::UNAUTHORIZED
        );
    }

    // ── pure unit tests (no DB needed) ───────────────────────────────────────

    #[test]
    fn new_capacity_baseline_prefers_stored_factory_capacity() {
        use super::{select_new_capacity_baseline, NewCapacityBaseline, NewCapacitySource};
        assert_eq!(
            select_new_capacity_baseline(Some(87_900.0), Some(91_000.0)),
            Some(NewCapacityBaseline {
                wh: 87_900.0,
                source: NewCapacitySource::Factory,
            })
        );
    }

    #[test]
    fn new_capacity_baseline_falls_back_to_highest_seen() {
        use super::{select_new_capacity_baseline, NewCapacityBaseline, NewCapacitySource};
        let expected = Some(NewCapacityBaseline {
            wh: 91_500.0,
            source: NewCapacitySource::HighestSeen,
        });
        assert_eq!(select_new_capacity_baseline(None, Some(91_500.0)), expected);
        // A stored value at or below the plausibility floor is not a factory capacity.
        assert_eq!(
            select_new_capacity_baseline(Some(10_000.0), Some(91_500.0)),
            expected
        );
        assert_eq!(
            select_new_capacity_baseline(Some(f64::NAN), Some(91_500.0)),
            expected
        );
    }

    #[test]
    fn new_capacity_baseline_is_none_without_plausible_values() {
        use super::select_new_capacity_baseline;
        assert_eq!(select_new_capacity_baseline(None, None), None);
        assert_eq!(select_new_capacity_baseline(Some(0.0), Some(9_500.0)), None);
        assert_eq!(
            select_new_capacity_baseline(None, Some(f64::INFINITY)),
            None
        );
    }

    #[test]
    fn new_capacity_source_serializes_as_snake_case() {
        use super::NewCapacitySource;
        assert_eq!(
            serde_json::to_value(NewCapacitySource::Factory).unwrap(),
            serde_json::json!("factory")
        );
        assert_eq!(
            serde_json::to_value(NewCapacitySource::HighestSeen).unwrap(),
            serde_json::json!("highest_seen")
        );
        assert_eq!(
            serde_json::to_value(None::<NewCapacitySource>).unwrap(),
            serde_json::Value::Null
        );
    }

    #[test]
    fn lifetime_time_bounds_use_epoch_instead_of_default_window() {
        use super::resolve_time_bounds;
        let to = chrono::Utc::now();
        let (from, resolved_to) = resolve_time_bounds(None, Some(to), true, 90);

        assert_eq!(resolved_to, to);
        assert_eq!(
            from,
            chrono::DateTime::<chrono::Utc>::from_timestamp(0, 0).unwrap()
        );
    }
}
