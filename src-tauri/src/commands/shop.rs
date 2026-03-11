use std::sync::Arc;

use tauri::{AppHandle, State};
use tracing::instrument;

use crate::error::AppError;
use crate::models::ShopSettings;
use crate::services::shop;
use crate::state::AppState;

/// Saves initial shop setup data.
#[tauri::command]
#[instrument(skip(state, app))]
pub async fn save_shop_setup(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    name: String,
    phone: String,
    address: String,
    logo_file_path: String,
) -> Result<(), AppError> {
    shop::save_shop_setup(
        state.inner().clone(),
        &app,
        name,
        phone,
        address,
        logo_file_path,
    )
    .await
}

/// Returns current shop settings.
#[tauri::command]
#[instrument(skip(state))]
pub async fn get_shop_settings(state: State<'_, Arc<AppState>>) -> Result<ShopSettings, AppError> {
    shop::get_shop_settings(state.inner().clone()).await
}

/// Updates current shop settings.
#[tauri::command]
#[instrument(skip(state, app))]
pub async fn update_shop_settings(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    shop_name: String,
    phone: String,
    address: String,
    logo_path: Option<String>,
    customer_id_prefix: Option<String>,
    order_id_prefix: Option<String>,
) -> Result<(), AppError> {
    shop::update_shop_settings(
        state.inner().clone(),
        &app,
        shop_name,
        phone,
        address,
        logo_path,
        customer_id_prefix,
        order_id_prefix,
    )
    .await
}

/// Uploads shop logo to S3 and persists cloud URL.
#[tauri::command]
#[instrument(skip(state, app))]
pub async fn upload_shop_logo_to_s3(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    logo_path: Option<String>,
) -> Result<String, AppError> {
    shop::upload_shop_logo_to_s3(state.inner().clone(), &app, logo_path).await
}
