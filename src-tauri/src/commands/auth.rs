use std::sync::Arc;

use tauri::State;
use tracing::instrument;

use crate::error::AppError;
use crate::models::User;
use crate::services::auth;
use crate::state::AppState;

/// Registers a new local user.
#[tauri::command]
#[instrument(skip(state, password), fields(username = %name))]
pub async fn register_user(
    state: State<'_, Arc<AppState>>,
    name: String,
    password: String,
) -> Result<(), AppError> {
    auth::register_user(state.inner().clone(), name, password).await
}

/// Logs in a local user by name and password.
#[tauri::command]
#[instrument(skip(state, password), fields(username = %name))]
pub async fn login_user(
    state: State<'_, Arc<AppState>>,
    name: String,
    password: String,
) -> Result<User, AppError> {
    auth::login_user(state.inner().clone(), name, password).await
}

/// Returns whether the app onboarding has completed.
#[tauri::command]
#[instrument(skip(state))]
pub async fn check_is_onboarded(state: State<'_, Arc<AppState>>) -> Result<bool, AppError> {
    auth::check_is_onboarded(state.inner().clone()).await
}
