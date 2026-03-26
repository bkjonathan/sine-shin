use std::fs;
use std::path::Path;
use std::sync::Arc;

use aws_config::BehaviorVersion;
use aws_credential_types::provider::SharedCredentialsProvider;
use aws_sdk_s3::config::{Credentials, Region};
use aws_sdk_s3::primitives::ByteStream;
use chrono::Utc;
use sea_orm::{ConnectionTrait, FromQueryResult, Statement};
use tauri::AppHandle;
use tracing::instrument;
use uuid::Uuid;

use crate::db::copy_logo_to_app_data;
use crate::error::{AppError, AppResult};
use crate::models::ShopSettings;
use crate::services::settings::{get_app_settings, normalize_s3_bucket_name};
use crate::state::AppState;
use crate::sync::enqueue_sync;

/// Saves initial shop setup row and enqueues sync payload.
#[instrument(skip(state, app))]
pub async fn save_shop_setup(
    state: Arc<AppState>,
    app: &AppHandle,
    name: String,
    phone: String,
    address: String,
    logo_file_path: String,
) -> AppResult<()> {
    let internal_logo_path = copy_logo_to_app_data(app, &logo_file_path)?;
    let backend = state.db.as_ref().get_database_backend();
    let new_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    state
        .db
        .execute(Statement::from_sql_and_values(
            backend,
            "INSERT INTO shop_settings (id, shop_name, phone, address, logo_path, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
            [
                new_id.clone().into(),
                name.into(),
                phone.into(),
                address.into(),
                internal_logo_path.into(),
                now.into(),
            ],
        ))
        .await?;

    if let Ok(Some(record)) = ShopSettings::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT id, shop_name, phone, address, logo_path, logo_cloud_url, customer_id_prefix, order_id_prefix, created_at, updated_at FROM shop_settings ORDER BY id DESC LIMIT 1",
        [],
    ))
    .one(state.db.as_ref())
    .await
    {
        let id = record.id.clone();
        enqueue_sync(
            state.db.as_ref(),
            app,
            "shop_settings",
            "INSERT",
            &id,
            serde_json::json!(record),
        )
        .await;
    }

    Ok(())
}

/// Returns latest shop settings row.
#[instrument(skip(state))]
pub async fn get_shop_settings(state: Arc<AppState>) -> AppResult<ShopSettings> {
    let backend = state.db.as_ref().get_database_backend();
    let settings = ShopSettings::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT id, shop_name, phone, address, logo_path, logo_cloud_url, customer_id_prefix, order_id_prefix, created_at, updated_at FROM shop_settings ORDER BY id DESC LIMIT 1",
        [],
    ))
    .one(state.db.as_ref())
    .await?
    .ok_or_else(|| AppError::not_found("No shop settings found"))?;

    Ok(settings)
}

/// Updates latest shop settings row and enqueues sync payload.
#[instrument(skip(state, app))]
pub async fn update_shop_settings(
    state: Arc<AppState>,
    app: &AppHandle,
    shop_name: String,
    phone: String,
    address: String,
    logo_path: Option<String>,
    customer_id_prefix: Option<String>,
    order_id_prefix: Option<String>,
) -> AppResult<()> {
    let backend = state.db.as_ref().get_database_backend();

    #[derive(FromQueryResult)]
    struct IdRow {
        id: String,
    }

    let latest_id = IdRow::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT id FROM shop_settings ORDER BY id DESC LIMIT 1",
        [],
    ))
    .one(state.db.as_ref())
    .await?
    .map(|r| r.id);

    if let Some(id) = latest_id {
        let new_internal_logo_path = match logo_path {
            Some(path) => copy_logo_to_app_data(app, &path)?,
            None => None,
        };

        let now = chrono::Utc::now().to_rfc3339();

        if let Some(internal_path) = new_internal_logo_path {
            state
                .db
                .execute(Statement::from_sql_and_values(
                    backend,
                    "UPDATE shop_settings SET shop_name = $1, phone = $2, address = $3, logo_path = $4, customer_id_prefix = $5, order_id_prefix = $6, updated_at = $7 WHERE id = $8",
                    [
                        shop_name.into(),
                        phone.into(),
                        address.into(),
                        internal_path.into(),
                        customer_id_prefix.into(),
                        order_id_prefix.into(),
                        now.into(),
                        id.clone().into(),
                    ],
                ))
                .await?;
        } else {
            state
                .db
                .execute(Statement::from_sql_and_values(
                    backend,
                    "UPDATE shop_settings SET shop_name = $1, phone = $2, address = $3, customer_id_prefix = $4, order_id_prefix = $5, updated_at = $6 WHERE id = $7",
                    [
                        shop_name.into(),
                        phone.into(),
                        address.into(),
                        customer_id_prefix.into(),
                        order_id_prefix.into(),
                        now.into(),
                        id.clone().into(),
                    ],
                ))
                .await?;
        }
    } else {
        return Err(AppError::not_found("No shop settings found to update"));
    }

    if let Ok(Some(record)) = ShopSettings::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT id, shop_name, phone, address, logo_path, logo_cloud_url, customer_id_prefix, order_id_prefix, created_at, updated_at FROM shop_settings ORDER BY id DESC LIMIT 1",
        [],
    ))
    .one(state.db.as_ref())
    .await
    {
        let id = record.id.clone();
        enqueue_sync(
            state.db.as_ref(),
            app,
            "shop_settings",
            "UPDATE",
            &id,
            serde_json::json!(record),
        )
        .await;
    }

    Ok(())
}

fn normalize_base_url(url: &str) -> String {
    url.trim().trim_end_matches('/').to_string()
}

fn image_content_type(file_path: &str) -> &'static str {
    match Path::new(file_path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .as_deref()
    {
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        _ => "application/octet-stream",
    }
}

/// Uploads shop logo to S3, updates local setting, and enqueues sync payload.
#[instrument(skip(state, app))]
pub async fn upload_shop_logo_to_s3(
    state: Arc<AppState>,
    app: &AppHandle,
    logo_path: Option<String>,
) -> AppResult<String> {
    let app_settings = get_app_settings(app.clone())?;
    let aws_access_key_id = app_settings.aws_access_key_id.trim().to_string();
    let aws_secret_access_key = app_settings.aws_secret_access_key.trim().to_string();
    let aws_region = app_settings.aws_region.trim().to_string();
    let aws_bucket_name = normalize_s3_bucket_name(&app_settings.aws_bucket_name);
    let imagekit_base_url = normalize_base_url(&app_settings.imagekit_base_url);

    if aws_access_key_id.is_empty()
        || aws_secret_access_key.is_empty()
        || aws_region.is_empty()
        || aws_bucket_name.is_empty()
    {
        return Err(AppError::invalid_input(
            "AWS S3 is not configured. Please set access key, secret key, region, and bucket in Settings.",
        ));
    }

    let maybe_new_logo_path = logo_path
        .map(|path| path.trim().to_string())
        .filter(|path| !path.is_empty());
    let new_internal_logo_path = match maybe_new_logo_path {
        Some(path) => copy_logo_to_app_data(app, &path)?,
        None => None,
    };

    let backend = state.db.as_ref().get_database_backend();
    let latest = ShopSettings::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT id, shop_name, phone, address, logo_path, logo_cloud_url, customer_id_prefix, order_id_prefix, created_at, updated_at FROM shop_settings ORDER BY id DESC LIMIT 1",
        [],
    ))
    .one(state.db.as_ref())
    .await?
    .ok_or_else(|| AppError::not_found("No shop settings found"))?;

    let logo_to_upload = new_internal_logo_path
        .clone()
        .or(latest.logo_path.clone())
        .ok_or_else(|| AppError::not_found("No shop logo found. Please set a shop logo first."))?;

    if !Path::new(&logo_to_upload).exists() {
        return Err(AppError::not_found(format!(
            "Logo file not found: {}",
            logo_to_upload
        )));
    }

    let file_bytes = fs::read(&logo_to_upload)?;
    let extension = Path::new(&logo_to_upload)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .unwrap_or_else(|| "png".to_string());
    let object_key = format!(
        "shop-logos/shop_{}_{}.{}",
        latest.id,
        Utc::now().format("%Y%m%d%H%M%S"),
        extension
    );

    let credentials = Credentials::new(
        aws_access_key_id,
        aws_secret_access_key,
        None,
        None,
        "thai-htay-shop-logo",
    );

    let config = aws_config::defaults(BehaviorVersion::latest())
        .region(Region::new(aws_region.clone()))
        .credentials_provider(SharedCredentialsProvider::new(credentials))
        .load()
        .await;
    let s3_client = aws_sdk_s3::Client::new(&config);

    s3_client
        .put_object()
        .bucket(aws_bucket_name.clone())
        .key(&object_key)
        .body(ByteStream::from(file_bytes))
        .content_type(image_content_type(&logo_to_upload))
        .send()
        .await
        .map_err(|e| AppError::internal(format!("Failed to upload logo to S3: {}", e)))?;

    let s3_cloud_url = format!(
        "https://{}.s3.{}.amazonaws.com/{}",
        aws_bucket_name, aws_region, object_key
    );
    let cloud_url = if imagekit_base_url.is_empty() {
        s3_cloud_url
    } else {
        format!("{}/{}", imagekit_base_url, object_key)
    };

    let now = chrono::Utc::now().to_rfc3339();
    if let Some(local_logo_path) = new_internal_logo_path {
        state
            .db
            .execute(Statement::from_sql_and_values(
                backend,
                "UPDATE shop_settings SET logo_path = $1, logo_cloud_url = $2, updated_at = $3 WHERE id = $4",
                [
                    local_logo_path.into(),
                    cloud_url.clone().into(),
                    now.into(),
                    latest.id.clone().into(),
                ],
            ))
            .await?;
    } else {
        state
            .db
            .execute(Statement::from_sql_and_values(
                backend,
                "UPDATE shop_settings SET logo_cloud_url = $1, updated_at = $2 WHERE id = $3",
                [
                    cloud_url.clone().into(),
                    now.into(),
                    latest.id.clone().into(),
                ],
            ))
            .await?;
    }

    if let Ok(Some(record)) = ShopSettings::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT id, shop_name, phone, address, logo_path, logo_cloud_url, customer_id_prefix, order_id_prefix, created_at, updated_at FROM shop_settings ORDER BY id DESC LIMIT 1",
        [],
    ))
    .one(state.db.as_ref())
    .await
    {
        let id = record.id.clone();
        enqueue_sync(
            state.db.as_ref(),
            app,
            "shop_settings",
            "UPDATE",
            &id,
            serde_json::json!(record),
        )
        .await;
    }

    Ok(cloud_url)
}
