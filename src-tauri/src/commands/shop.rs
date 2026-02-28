use tauri::{AppHandle, Manager};

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
