use std::sync::Arc;

use tauri::State;
use tracing::instrument;

use crate::error::AppError;
use crate::services::settings;
use crate::state::AppState;

pub use crate::services::settings::{
    AppSettings, AwsS3ConnectionInput, AwsS3ConnectionStatus, DatabaseConnectionInput,
    DatabaseConnectionStatus,
};

/// Returns app settings from local settings storage.
#[tauri::command]
#[instrument(skip(app))]
pub fn get_app_settings(app: tauri::AppHandle) -> Result<AppSettings, AppError> {
    settings::get_app_settings(app)
}

/// Updates app settings in local settings storage.
#[tauri::command]
#[instrument(skip(app, settings))]
pub fn update_app_settings(app: tauri::AppHandle, settings: AppSettings) -> Result<(), AppError> {
    settings::update_app_settings(app, settings)
}

/// Tests an AWS S3 connection using provided credentials.
#[tauri::command]
#[instrument(skip(config))]
pub async fn test_aws_s3_connection(
    config: AwsS3ConnectionInput,
) -> Result<AwsS3ConnectionStatus, AppError> {
    settings::test_aws_s3_connection(config).await
}

/// Returns current AWS S3 connection status from stored settings.
#[tauri::command]
#[instrument(skip(app))]
pub async fn get_aws_s3_connection_status(
    app: tauri::AppHandle,
) -> Result<AwsS3ConnectionStatus, AppError> {
    settings::get_aws_s3_connection_status(app).await
}

/// Tests a PostgreSQL connection string without switching the active database.
#[tauri::command]
#[instrument(skip(url))]
pub async fn test_postgresql_connection(url: String) -> Result<DatabaseConnectionStatus, AppError> {
    settings::test_postgresql_connection(url).await
}

/// Checks if the given PostgreSQL URL points to a database that already has onboarding data
/// (shop settings + at least one user). When true the frontend can skip the full setup wizard
/// and connect directly, mirroring the SQLite "restore from file" flow.
#[tauri::command]
#[instrument(skip(url))]
pub async fn check_postgresql_already_onboarded(url: String) -> Result<bool, AppError> {
    settings::check_postgresql_already_onboarded(url).await
}

/// Switches the active application database and persists the selection.
#[tauri::command]
#[instrument(skip(app, state, input))]
pub async fn configure_database(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
    input: DatabaseConnectionInput,
) -> Result<(), AppError> {
    settings::configure_database(app, state.inner().clone(), input).await
}
