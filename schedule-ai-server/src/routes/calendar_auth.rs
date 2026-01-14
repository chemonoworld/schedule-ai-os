use std::collections::HashMap;
use std::sync::Arc;

use axum::{
    extract::Query,
    middleware as axum_middleware,
    response::{IntoResponse, Redirect, Response},
    routing::{get, post},
    Extension, Json, Router,
};
use oauth2::PkceCodeVerifier;
use serde::Deserialize;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    middleware::auth_middleware,
    models::CalendarConnectionStatus,
    services::{CalendarService, Claims},
    AppState,
};

/// Calendar OAuth state storage (in production, use Redis)
/// Key: CSRF token, Value: (user_id, PKCE verifier)
type CalendarOAuthStateStore = Arc<RwLock<HashMap<String, (Uuid, PkceCodeVerifier)>>>;

/// Calendar auth routes state
#[derive(Clone)]
pub struct CalendarAuthState {
    pub calendar_service: Arc<CalendarService>,
    pub oauth_states: CalendarOAuthStateStore,
}

/// Query params for Calendar OAuth callback
#[derive(Debug, Deserialize)]
pub struct CalendarOAuthCallbackQuery {
    pub code: String,
    pub state: String,
}

pub fn calendar_auth_routes(app_state: AppState) -> Router<AppState> {
    let calendar_service = Arc::new(CalendarService::new(
        app_state.pool.clone(),
        app_state.config.clone(),
    ));

    let calendar_state = CalendarAuthState {
        calendar_service,
        oauth_states: Arc::new(RwLock::new(HashMap::new())),
    };

    // Protected routes (require authentication)
    let protected = Router::new()
        .route("/google/calendar", get(start_calendar_oauth))
        .route("/calendar/status", get(get_connection_status))
        .route("/calendar/disconnect", post(disconnect_calendar))
        .route_layer(axum_middleware::from_fn_with_state(
            app_state.clone(),
            auth_middleware,
        ));

    // Public routes (callback doesn't need auth - user comes from Google)
    let public = Router::new()
        .route("/google/calendar/callback", get(calendar_oauth_callback));

    Router::new()
        .merge(public)
        .merge(protected)
        .layer(Extension(calendar_state))
}

/// GET /api/auth/google/calendar - Start Calendar OAuth flow
/// 인증된 사용자만 호출 가능 (user_id를 OAuth state에 저장)
async fn start_calendar_oauth(
    Extension(state): Extension<CalendarAuthState>,
    Extension(claims): Extension<Claims>,
) -> Result<impl IntoResponse, AppError> {
    let user_id: Uuid = claims
        .sub
        .parse()
        .map_err(|_| AppError::Internal("Invalid user ID in token".to_string()))?;

    let (auth_url, csrf_token, pkce_verifier) = state.calendar_service.get_calendar_auth_url();

    // Store user_id and PKCE verifier with CSRF token as key
    state
        .oauth_states
        .write()
        .await
        .insert(csrf_token.secret().clone(), (user_id, pkce_verifier));

    Ok(Redirect::temporary(&auth_url))
}

/// GET /api/auth/google/calendar/callback - Calendar OAuth callback
/// Google에서 리다이렉트됨 (JWT 토큰 없음, OAuth state로 user_id 확인)
async fn calendar_oauth_callback(
    Extension(state): Extension<CalendarAuthState>,
    Query(query): Query<CalendarOAuthCallbackQuery>,
) -> Result<Response, AppError> {
    // Get and remove user_id and PKCE verifier
    let (user_id, pkce_verifier) = state
        .oauth_states
        .write()
        .await
        .remove(&query.state)
        .ok_or(AppError::BadRequest("Invalid OAuth state".to_string()))?;

    // Exchange code for tokens and save to DB
    let result = state
        .calendar_service
        .exchange_calendar_code(user_id, query.code, pkce_verifier)
        .await;

    // Redirect to desktop app with result
    let redirect_url = match result {
        Ok(_) => "scheduleai://auth/calendar/success".to_string(),
        Err(e) => {
            tracing::error!("Calendar OAuth failed: {:?}", e);
            format!(
                "scheduleai://auth/calendar/error?message={}",
                urlencoding::encode(&e.to_string())
            )
        }
    };

    Ok(Redirect::temporary(&redirect_url).into_response())
}

/// GET /api/auth/calendar/status - Get calendar connection status
async fn get_connection_status(
    Extension(state): Extension<CalendarAuthState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<CalendarConnectionStatus>> {
    let user_id: Uuid = claims
        .sub
        .parse()
        .map_err(|_| AppError::Internal("Invalid user ID in token".to_string()))?;

    let status = state.calendar_service.get_connection_status(user_id).await?;

    Ok(Json(status))
}

/// POST /api/auth/calendar/disconnect - Disconnect calendar
async fn disconnect_calendar(
    Extension(state): Extension<CalendarAuthState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let user_id: Uuid = claims
        .sub
        .parse()
        .map_err(|_| AppError::Internal("Invalid user ID in token".to_string()))?;

    state.calendar_service.disconnect(user_id).await?;

    Ok(Json(serde_json::json!({ "message": "Calendar disconnected successfully" })))
}
