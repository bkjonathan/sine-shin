use std::sync::Arc;

use sea_orm::Database;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use tracing::instrument;

use crate::error::AppError;
use crate::models::{DbStatus, TableSequenceResetStatus};
use crate::services::{settings, system};
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
#[instrument(skip(app, state))]
pub async fn backup_database(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    dest_path: String,
) -> Result<u64, AppError> {
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

/// Tests a PostgreSQL connection URL by attempting to connect.
#[tauri::command]
#[instrument]
pub async fn test_postgres_connection(url: String) -> Result<bool, AppError> {
    Database::connect(url.as_str())
        .await
        .map(|_| true)
        .map_err(|e| AppError::internal(format!("PostgreSQL connection failed: {e}")))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DatabaseConfig {
    pub database_type: String,
    pub postgres_url: String,
}

/// Saves the database type and optional PostgreSQL URL to settings.
#[tauri::command]
#[instrument(skip(app))]
pub fn save_database_config(
    app: AppHandle,
    database_type: String,
    postgres_url: String,
) -> Result<(), AppError> {
    let mut s = settings::get_app_settings(app.clone())?;
    s.database_type = database_type;
    s.postgres_url = postgres_url;
    settings::update_app_settings(app, s)
}

/// Returns the stored database configuration.
#[tauri::command]
#[instrument(skip(app))]
pub fn get_database_config(app: AppHandle) -> Result<DatabaseConfig, AppError> {
    let s = settings::get_app_settings(app)?;
    Ok(DatabaseConfig {
        database_type: s.database_type,
        postgres_url: s.postgres_url,
    })
}

/// Restarts the Tauri application.
#[tauri::command]
#[instrument(skip(app))]
pub fn restart_app(app: AppHandle) -> Result<(), AppError> {
    app.restart();
}
