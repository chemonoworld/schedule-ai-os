use std::sync::Arc;

use axum::{
    extract::Query,
    middleware as axum_middleware,
    routing::{get, post},
    Extension, Json, Router,
};
use chrono::Utc;
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    middleware::auth_middleware,
    models::{
        CalendarEventsResponse, CalendarListResponse, EventsQueryParams, SelectCalendarsRequest,
        SelectCalendarsResponse,
    },
    services::{CalendarService, Claims},
    AppState,
};

/// Calendar routes state
#[derive(Clone)]
pub struct CalendarState {
    pub calendar_service: Arc<CalendarService>,
}

pub fn calendar_routes(app_state: AppState) -> Router<AppState> {
    let calendar_service = Arc::new(CalendarService::new(
        app_state.pool.clone(),
        app_state.config.clone(),
    ));

    let calendar_state = CalendarState { calendar_service };

    // 모든 라우트는 인증 필요
    Router::new()
        .route("/list", get(list_calendars))
        .route("/list/select", post(select_calendars))
        .route("/events", get(list_events))
        .route_layer(axum_middleware::from_fn_with_state(
            app_state.clone(),
            auth_middleware,
        ))
        .layer(Extension(calendar_state))
}

/// GET /api/calendar/list - 캘린더 목록 조회
async fn list_calendars(
    Extension(state): Extension<CalendarState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<CalendarListResponse>> {
    let user_id: Uuid = claims
        .sub
        .parse()
        .map_err(|_| AppError::Internal("Invalid user ID in token".to_string()))?;

    let calendars = state.calendar_service.list_calendars(user_id).await?;

    Ok(Json(CalendarListResponse { calendars }))
}

/// POST /api/calendar/list/select - 표시할 캘린더 선택
async fn select_calendars(
    Extension(state): Extension<CalendarState>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<SelectCalendarsRequest>,
) -> AppResult<Json<SelectCalendarsResponse>> {
    let user_id: Uuid = claims
        .sub
        .parse()
        .map_err(|_| AppError::Internal("Invalid user ID in token".to_string()))?;

    let selected_count = state
        .calendar_service
        .save_selected_calendars(user_id, request.calendar_ids)
        .await?;

    Ok(Json(SelectCalendarsResponse {
        success: true,
        selected_count,
    }))
}

/// GET /api/calendar/events - 이벤트 조회
async fn list_events(
    Extension(state): Extension<CalendarState>,
    Extension(claims): Extension<Claims>,
    Query(params): Query<EventsQueryParams>,
) -> AppResult<Json<CalendarEventsResponse>> {
    let user_id: Uuid = claims
        .sub
        .parse()
        .map_err(|_| AppError::Internal("Invalid user ID in token".to_string()))?;

    let events = state
        .calendar_service
        .list_events(user_id, params.start, params.end)
        .await?;

    Ok(Json(CalendarEventsResponse {
        events,
        synced_at: Utc::now(),
    }))
}
