use tauri::AppHandle;
use tracing::instrument;

use crate::error::AppError;
use crate::services::drive;

pub use crate::services::drive::DriveStatus;

/// Starts Google OAuth flow for Drive backup integration.
#[tauri::command]
#[instrument(skip(app))]
pub async fn start_google_oauth(app: AppHandle) -> Result<DriveStatus, AppError> {
    drive::start_google_oauth(&app).await
}

/// Returns current Google Drive connection status.
#[tauri::command]
#[instrument(skip(app))]
pub async fn get_drive_connection_status(app: AppHandle) -> Result<DriveStatus, AppError> {
    drive::get_drive_connection_status(&app).await
}

/// Disconnects Google Drive by deleting stored token file.
#[tauri::command]
#[instrument(skip(app))]
pub async fn disconnect_google_drive(app: AppHandle) -> Result<(), AppError> {
    drive::disconnect_google_drive(&app).await
}

/// Triggers immediate Google Drive backup upload.
#[tauri::command]
#[instrument(skip(app))]
pub async fn trigger_drive_backup(app: AppHandle) -> Result<String, AppError> {
    drive::trigger_drive_backup(&app).await
}

/// Performs backup upload workflow and is reused by scheduler jobs.
#[instrument(skip(app))]
pub async fn perform_drive_backup(app: &AppHandle) -> Result<String, AppError> {
    drive::perform_drive_backup(app).await
}
