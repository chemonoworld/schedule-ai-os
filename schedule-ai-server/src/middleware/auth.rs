use axum::{
    body::Body,
    extract::State,
    http::{header::AUTHORIZATION, Request},
    middleware::Next,
    response::Response,
};

use crate::{error::AppError, services::AuthService, AppState};

/// Authentication middleware
/// Extracts and validates JWT from Authorization header
/// Adds Claims to request extensions
pub async fn auth_middleware(
    State(state): State<AppState>,
    mut req: Request<Body>,
    next: Next,
) -> Result<Response, AppError> {
    let auth_header = req
        .headers()
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .ok_or(AppError::Unauthorized)?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or(AppError::Unauthorized)?;

    // Create auth service and verify token
    let auth_service = AuthService::new(state.pool.clone(), state.config.clone());
    let claims = auth_service.verify_access_token(token)?;

    // Add claims to request extensions
    req.extensions_mut().insert(claims);

    Ok(next.run(req).await)
}

/// Optional authentication middleware
/// Similar to auth_middleware but doesn't fail if no token present
pub async fn optional_auth_middleware(
    State(state): State<AppState>,
    mut req: Request<Body>,
    next: Next,
) -> Response {
    if let Some(auth_header) = req
        .headers()
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
    {
        if let Some(token) = auth_header.strip_prefix("Bearer ") {
            let auth_service = AuthService::new(state.pool.clone(), state.config.clone());
            if let Ok(claims) = auth_service.verify_access_token(token) {
                req.extensions_mut().insert(claims);
            }
        }
    }

    next.run(req).await
}
