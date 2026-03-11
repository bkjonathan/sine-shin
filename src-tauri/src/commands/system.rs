use std::sync::Arc;

use tauri::{AppHandle, State};
use tracing::instrument;

use crate::error::AppError;
use crate::models::{DbStatus, TableSequenceResetStatus};
use crate::services::system;
use crate::state::AppState;

/// Resets application tables and local runtime data.
#[tauri::command]
#[instrument(skip(state, app))]
pub async fn reset_app_data(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<(), AppError> {
    system::reset_app_data(state.inner().clone(), &app).await
}

/// Copies the sqlite database file to backup destination.
#[tauri::command]
#[instrument(skip(app))]
pub async fn backup_database(app: AppHandle, dest_path: String) -> Result<u64, AppError> {
    system::backup_database(&app, dest_path).await
}

/// Restores sqlite database file from source path.
#[tauri::command]
#[instrument(skip(state, app))]
pub async fn restore_database(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    restore_path: String,
) -> Result<(), AppError> {
    system::restore_database(state.inner().clone(), &app, restore_path).await
}

/// Returns sqlite metadata and table row counts.
#[tauri::command]
#[instrument(skip(state, app))]
pub async fn get_db_status(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<DbStatus, AppError> {
    system::get_db_status(state.inner().clone(), &app).await
}

/// Resets sqlite sequence for a specific table.
#[tauri::command]
#[instrument(skip(state))]
pub async fn reset_table_sequence(
    state: State<'_, Arc<AppState>>,
    table_name: String,
) -> Result<TableSequenceResetStatus, AppError> {
    system::reset_table_sequence(state.inner().clone(), table_name).await
}
