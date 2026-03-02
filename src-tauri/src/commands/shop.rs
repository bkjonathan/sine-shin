use aws_config::BehaviorVersion;
use aws_credential_types::provider::SharedCredentialsProvider;
use aws_sdk_s3::config::{Credentials, Region};
use aws_sdk_s3::primitives::ByteStream;
use chrono::Utc;
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Manager};

use crate::commands::settings::get_app_settings;
use crate::db::copy_logo_to_app_data;
use crate::models::ShopSettings;
use crate::state::AppDb;
use crate::sync::enqueue_sync;

#[tauri::command]
pub async fn save_shop_setup(
    app: AppHandle,
    name: String,
    phone: String,
    address: String,
    logo_file_path: String,
) -> Result<(), String> {
    let internal_logo_path = copy_logo_to_app_data(&app, &logo_file_path)?;

    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    sqlx::query(
        "INSERT INTO shop_settings (shop_name, phone, address, logo_path) VALUES (?, ?, ?, ?)",
    )
    .bind(&name)
    .bind(&phone)
    .bind(&address)
    .bind(&internal_logo_path)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // Enqueue sync for shop settings
    if let Ok(record) = sqlx::query_as::<_, ShopSettings>("SELECT * FROM shop_settings ORDER BY id DESC LIMIT 1")
        .fetch_one(&*pool)
        .await
    {
        enqueue_sync(&pool, &app, "shop_settings", "INSERT", record.id, serde_json::json!(record)).await;
    }

    Ok(())
}

#[tauri::command]
pub async fn get_shop_settings(app: AppHandle) -> Result<ShopSettings, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let settings: ShopSettings =
        sqlx::query_as("SELECT * FROM shop_settings ORDER BY id DESC LIMIT 1")
            .fetch_one(&*pool)
            .await
            .map_err(|e| e.to_string())?;

    Ok(settings)
}

#[tauri::command]
pub async fn update_shop_settings(
    app: AppHandle,
    shop_name: String,
    phone: String,
    address: String,
    logo_path: Option<String>,
    customer_id_prefix: Option<String>,
    order_id_prefix: Option<String>,
) -> Result<(), String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let latest_id: Option<i64> =
        sqlx::query_scalar("SELECT id FROM shop_settings ORDER BY id DESC LIMIT 1")
            .fetch_optional(&*pool)
            .await
            .map_err(|e| e.to_string())?;

    if let Some(id) = latest_id {
        let new_internal_logo_path = match logo_path {
            Some(path) => copy_logo_to_app_data(&app, &path)?,
            None => None,
        };

        if let Some(internal_path) = new_internal_logo_path {
            sqlx::query("UPDATE shop_settings SET shop_name = ?, phone = ?, address = ?, logo_path = ?, customer_id_prefix = ?, order_id_prefix = ? WHERE id = ?")
                .bind(shop_name)
                .bind(phone)
                .bind(address)
                .bind(internal_path)
                .bind(customer_id_prefix)
                .bind(order_id_prefix)
                .bind(id)
                .execute(&*pool)
                .await
                .map_err(|e| e.to_string())?;
        } else {
            sqlx::query("UPDATE shop_settings SET shop_name = ?, phone = ?, address = ?, customer_id_prefix = ?, order_id_prefix = ? WHERE id = ?")
                .bind(shop_name)
                .bind(phone)
                .bind(address)
                .bind(customer_id_prefix)
                .bind(order_id_prefix)
                .bind(id)
                .execute(&*pool)
                .await
                .map_err(|e| e.to_string())?;
        }
    } else {
        return Err("No shop settings found to update".to_string());
    }

    // Enqueue sync
    if let Ok(record) = sqlx::query_as::<_, ShopSettings>("SELECT * FROM shop_settings ORDER BY id DESC LIMIT 1")
        .fetch_one(&*pool)
        .await
    {
        enqueue_sync(&pool, &app, "shop_settings", "UPDATE", record.id, serde_json::json!(record)).await;
    }

    Ok(())
}

fn normalize_s3_bucket_name(bucket_name: &str) -> String {
    bucket_name
        .trim()
        .trim_start_matches("s3://")
        .trim_end_matches('/')
        .to_string()
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

#[tauri::command]
pub async fn upload_shop_logo_to_s3(
    app: AppHandle,
    logo_path: Option<String>,
) -> Result<String, String> {
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
        return Err(
            "AWS S3 is not configured. Please set access key, secret key, region, and bucket in Settings."
                .to_string(),
        );
    }

    let maybe_new_logo_path = logo_path
        .map(|path| path.trim().to_string())
        .filter(|path| !path.is_empty());
    let new_internal_logo_path = match maybe_new_logo_path {
        Some(path) => copy_logo_to_app_data(&app, &path)?,
        None => None,
    };

    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;
    let latest: ShopSettings =
        sqlx::query_as("SELECT * FROM shop_settings ORDER BY id DESC LIMIT 1")
            .fetch_one(&*pool)
            .await
            .map_err(|e| e.to_string())?;
    drop(pool);

    let logo_to_upload = new_internal_logo_path
        .clone()
        .or(latest.logo_path.clone())
        .ok_or_else(|| "No shop logo found. Please set a shop logo first.".to_string())?;

    if !Path::new(&logo_to_upload).exists() {
        return Err(format!("Logo file not found: {}", logo_to_upload));
    }

    let file_bytes = fs::read(&logo_to_upload).map_err(|e| e.to_string())?;
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
        .map_err(|e| format!("Failed to upload logo to S3: {}", e))?;

    let s3_cloud_url = format!(
        "https://{}.s3.{}.amazonaws.com/{}",
        aws_bucket_name, aws_region, object_key
    );
    let cloud_url = if imagekit_base_url.is_empty() {
        s3_cloud_url
    } else {
        format!("{}/{}", imagekit_base_url, object_key)
    };

    let pool = db.0.lock().await;
    if let Some(local_logo_path) = new_internal_logo_path {
        sqlx::query("UPDATE shop_settings SET logo_path = ?, logo_cloud_url = ? WHERE id = ?")
            .bind(local_logo_path)
            .bind(&cloud_url)
            .bind(latest.id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
    } else {
        sqlx::query("UPDATE shop_settings SET logo_cloud_url = ? WHERE id = ?")
            .bind(&cloud_url)
            .bind(latest.id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    if let Ok(record) = sqlx::query_as::<_, ShopSettings>("SELECT * FROM shop_settings ORDER BY id DESC LIMIT 1")
        .fetch_one(&*pool)
        .await
    {
        enqueue_sync(&pool, &app, "shop_settings", "UPDATE", record.id, serde_json::json!(record)).await;
    }

    Ok(cloud_url)
}
