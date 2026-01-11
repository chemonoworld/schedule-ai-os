use std::sync::Arc;

use axum::{
    extract::{Query, State},
    middleware as axum_middleware,
    response::{IntoResponse, Redirect, Response},
    routing::{get, post},
    Extension, Json, Router,
};
use axum_extra::extract::cookie::CookieJar;
use oauth2::PkceCodeVerifier;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use std::collections::HashMap;

use crate::{
    error::{AppError, AppResult},
    middleware::auth_middleware,
    models::UserResponse,
    services::{AuthResponse, AuthService, Claims, RefreshResponse},
    AppState,
};

/// OAuth state storage (in production, use Redis)
type OAuthStateStore = Arc<RwLock<HashMap<String, PkceCodeVerifier>>>;

/// Auth routes state
#[derive(Clone)]
pub struct AuthState {
    pub auth_service: Arc<AuthService>,
    pub oauth_states: OAuthStateStore,
}

/// Query params for OAuth callback
#[derive(Debug, Deserialize)]
pub struct OAuthCallbackQuery {
    pub code: String,
    pub state: String,
}

/// Request body for token refresh
#[derive(Debug, Deserialize)]
pub struct RefreshTokenRequest {
    pub refresh_token: String,
}

/// Request body for logout
#[derive(Debug, Deserialize)]
pub struct LogoutRequest {
    pub refresh_token: String,
}

/// Response for /auth/me endpoint
#[derive(Debug, Serialize)]
pub struct MeResponse {
    pub user: UserResponse,
}

pub fn auth_routes(app_state: AppState) -> Router<AppState> {
    let auth_service = Arc::new(AuthService::new(
        app_state.pool.clone(),
        app_state.config.clone(),
    ));

    let auth_state = AuthState {
        auth_service,
        oauth_states: Arc::new(RwLock::new(HashMap::new())),
    };

    // Protected routes (require authentication)
    let protected = Router::new()
        .route("/me", get(get_me))
        .route("/logout", post(logout))
        .route_layer(axum_middleware::from_fn_with_state(
            app_state.clone(),
            auth_middleware,
        ));

    // Public routes
    let public = Router::new()
        .route("/google", get(google_auth))
        .route("/google/callback", get(google_callback))
        .route("/refresh", post(refresh_token));

    Router::new()
        .merge(public)
        .merge(protected)
        .layer(Extension(auth_state))
}

/// GET /api/auth/google - Start OAuth flow
async fn google_auth(Extension(state): Extension<AuthState>) -> impl IntoResponse {
    let (auth_url, csrf_token, pkce_verifier) = state.auth_service.get_auth_url();

    // Store PKCE verifier with CSRF token as key
    state
        .oauth_states
        .write()
        .await
        .insert(csrf_token.secret().clone(), pkce_verifier);

    Redirect::temporary(&auth_url)
}

/// GET /api/auth/google/callback - OAuth callback
async fn google_callback(
    Extension(state): Extension<AuthState>,
    Query(query): Query<OAuthCallbackQuery>,
    jar: CookieJar,
) -> Result<(CookieJar, Response), AppError> {
    // Get and remove PKCE verifier
    let pkce_verifier = state
        .oauth_states
        .write()
        .await
        .remove(&query.state)
        .ok_or(AppError::BadRequest("Invalid OAuth state".to_string()))?;

    // Exchange code for tokens
    let auth_response = state
        .auth_service
        .exchange_code(query.code, pkce_verifier)
        .await?;

    // For desktop app, redirect to deep link with tokens
    // For web, could set cookies instead
    let redirect_url = format!(
        "scheduleai://auth/callback?access_token={}&refresh_token={}&expires_in={}",
        auth_response.access_token, auth_response.refresh_token, auth_response.expires_in
    );

    // Also return JSON response for API testing
    // In production, you'd choose one approach
    let response = Json(auth_response).into_response();

    Ok((jar, response))
}

/// POST /api/auth/refresh - Refresh access token
async fn refresh_token(
    Extension(state): Extension<AuthState>,
    Json(body): Json<RefreshTokenRequest>,
) -> AppResult<Json<RefreshResponse>> {
    let response = state
        .auth_service
        .refresh_access_token(&body.refresh_token)
        .await?;

    Ok(Json(response))
}

/// GET /api/auth/me - Get current user info
async fn get_me(
    Extension(auth_state): Extension<AuthState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<MeResponse>> {
    let user_id = claims
        .sub
        .parse()
        .map_err(|_| AppError::Internal("Invalid user ID in token".to_string()))?;

    let user = auth_state.auth_service.get_user_by_id(user_id).await?;

    Ok(Json(MeResponse { user: user.into() }))
}

/// POST /api/auth/logout - Logout (revoke refresh token)
async fn logout(
    Extension(state): Extension<AuthState>,
    Json(body): Json<LogoutRequest>,
) -> AppResult<Json<serde_json::Value>> {
    state
        .auth_service
        .revoke_refresh_token(&body.refresh_token)
        .await?;

    Ok(Json(serde_json::json!({ "message": "Logged out successfully" })))
}
