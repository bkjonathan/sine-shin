use tracing::instrument;

use crate::error::AppError;
use crate::services::settings;

pub use crate::services::settings::{AppSettings, AwsS3ConnectionInput, AwsS3ConnectionStatus};

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
