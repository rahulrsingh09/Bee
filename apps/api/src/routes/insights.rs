//! `GET /vehicles/{vehicle_id}/insights`: deterministic insight rules.
//!
//! The rules live in `services::insights`. This route only authorizes the
//! vehicle, parses the scope and returns the results.

use axum::{
    extract::{Path, Query, State},
    routing::get,
    Json, Router,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    db::vehicles::require_vehicle_read_access,
    errors::AppError,
    middleware::auth::{AppState, AuthUser},
    services::insights::{self, Insight, InsightScope},
};

pub fn router() -> Router<AppState> {
    Router::new().route("/vehicles/{vehicle_id}/insights", get(get_insights))
}

#[derive(Deserialize)]
struct InsightsParams {
    /// `now` (default), `trip:{id}` or `charge:{id}`.
    scope: Option<String>,
}

#[derive(Serialize)]
struct InsightsResponse {
    insights: Vec<Insight>,
}

async fn get_insights(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(vehicle_id): Path<Uuid>,
    Query(params): Query<InsightsParams>,
) -> Result<Json<InsightsResponse>, AppError> {
    require_vehicle_read_access(&state.pool, &auth, vehicle_id).await?;
    let scope = InsightScope::parse(params.scope.as_deref())?;
    let insights = insights::load_insights(&state.pool, vehicle_id, scope, Utc::now()).await?;
    Ok(Json(InsightsResponse { insights }))
}
