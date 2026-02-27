use tauri::{AppHandle, Manager};

use crate::db::copy_logo_to_app_data;
use crate::models::ShopSettings;
use crate::state::AppDb;
use crate::{db_query, db_query_as_one, db_query_scalar_optional};
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

    db_query!(
        &*pool,
        "INSERT INTO shop_settings (shop_name, phone, address, logo_path) VALUES (?, ?, ?, ?)",
        &name,
        &phone,
        &address,
        &internal_logo_path
    )
    .map_err(|e| e.to_string())?;

    // Enqueue sync for shop settings
    if let Ok(record) = db_query_as_one!(ShopSettings, &*pool, "SELECT * FROM shop_settings ORDER BY id DESC LIMIT 1")
    {
        enqueue_sync(&pool, "shop_settings", "INSERT", record.id, serde_json::json!(record)).await;
    }

    Ok(())
}

#[tauri::command]
pub async fn get_shop_settings(app: AppHandle) -> Result<ShopSettings, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let settings: ShopSettings =
        db_query_as_one!(ShopSettings, &*pool, "SELECT * FROM shop_settings ORDER BY id DESC LIMIT 1")
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
        db_query_scalar_optional!(i64, &*pool, "SELECT id FROM shop_settings ORDER BY id DESC LIMIT 1")
            .map_err(|e| e.to_string())?;

    if let Some(id) = latest_id {
        let new_internal_logo_path = match logo_path {
            Some(path) => copy_logo_to_app_data(&app, &path)?,
            None => None,
        };

        if let Some(internal_path) = new_internal_logo_path {
            db_query!(
                &*pool,
                "UPDATE shop_settings SET shop_name = ?, phone = ?, address = ?, logo_path = ?, customer_id_prefix = ?, order_id_prefix = ? WHERE id = ?",
                shop_name, phone, address, internal_path, customer_id_prefix, order_id_prefix, id
            )
            .map_err(|e| e.to_string())?;
        } else {
            db_query!(
                &*pool,
                "UPDATE shop_settings SET shop_name = ?, phone = ?, address = ?, customer_id_prefix = ?, order_id_prefix = ? WHERE id = ?",
                shop_name, phone, address, customer_id_prefix, order_id_prefix, id
            )
            .map_err(|e| e.to_string())?;
        }
    } else {
        return Err("No shop settings found to update".to_string());
    }

    // Enqueue sync
    if let Ok(record) = db_query_as_one!(ShopSettings, &*pool, "SELECT * FROM shop_settings ORDER BY id DESC LIMIT 1")
    {
        enqueue_sync(&pool, "shop_settings", "UPDATE", record.id, serde_json::json!(record)).await;
    }

    Ok(())
}
