use std::sync::Arc;

use tauri::State;
use tracing::instrument;

use crate::error::AppError;
use crate::services::staff::{self, StaffUser, StaffUserMetadata, StaffUsersResponse};
use crate::state::AppState;

/// Returns all staff users from Supabase.
#[tauri::command]
#[instrument(skip(state), fields(command = "get_staff_users"))]
pub async fn get_staff_users(
    state: State<'_, Arc<AppState>>,
) -> Result<StaffUsersResponse, AppError> {
    staff::get_staff_users(state.inner().clone()).await
}

/// Creates a new staff user with metadata.
#[tauri::command]
#[instrument(skip(state, password, data), fields(command = "create_staff_user", email = %email))]
pub async fn create_staff_user(
    state: State<'_, Arc<AppState>>,
    email: String,
    password: String,
    data: StaffUserMetadata,
) -> Result<StaffUser, AppError> {
    staff::create_staff_user(state.inner().clone(), email, password, data).await
}

/// Updates an existing staff user by id.
#[tauri::command]
#[instrument(skip(state, password, data), fields(command = "update_staff_user", user_id = %id))]
pub async fn update_staff_user(
    state: State<'_, Arc<AppState>>,
    id: String,
    email: Option<String>,
    password: Option<String>,
    data: Option<StaffUserMetadata>,
) -> Result<StaffUser, AppError> {
    staff::update_staff_user(state.inner().clone(), id, email, password, data).await
}

/// Deletes a staff user by id.
#[tauri::command]
#[instrument(skip(state), fields(command = "delete_staff_user", user_id = %id))]
pub async fn delete_staff_user(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), AppError> {
    staff::delete_staff_user(state.inner().clone(), id).await
}
