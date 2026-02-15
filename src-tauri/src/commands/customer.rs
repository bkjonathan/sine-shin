use tauri::{AppHandle, Manager};

use crate::db::DEFAULT_CUSTOMER_ID_PREFIX;
use crate::models::Customer;
use crate::state::AppDb;

#[tauri::command]
pub async fn create_customer(
    app: AppHandle,
    name: String,
    phone: Option<String>,
    address: Option<String>,
    city: Option<String>,
    social_media_url: Option<String>,
    platform: Option<String>,
) -> Result<i64, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let id = sqlx::query(
        "INSERT INTO customers (name, phone, address, city, social_media_url, platform) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(name)
    .bind(phone)
    .bind(address)
    .bind(city)
    .bind(social_media_url)
    .bind(platform)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .last_insert_rowid();

    let prefix: Option<String> =
        sqlx::query_scalar("SELECT customer_id_prefix FROM shop_settings ORDER BY id DESC LIMIT 1")
            .fetch_optional(&*pool)
            .await
            .unwrap_or(Some(DEFAULT_CUSTOMER_ID_PREFIX.to_string()));

    let prefix_str = prefix.unwrap_or_else(|| DEFAULT_CUSTOMER_ID_PREFIX.to_string());
    let customer_id = format!("{}{:05}", prefix_str, id);

    let _ = sqlx::query("UPDATE customers SET customer_id = ? WHERE id = ?")
        .bind(customer_id)
        .bind(id)
        .execute(&*pool)
        .await;

    Ok(id)
}

#[tauri::command]
pub async fn get_customers(app: AppHandle) -> Result<Vec<Customer>, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let customers =
        sqlx::query_as::<_, Customer>("SELECT * FROM customers ORDER BY created_at DESC")
            .fetch_all(&*pool)
            .await
            .map_err(|e| e.to_string())?;

    Ok(customers)
}

#[tauri::command]
pub async fn get_customer(app: AppHandle, id: i64) -> Result<Customer, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let customer = sqlx::query_as::<_, Customer>("SELECT * FROM customers WHERE id = ?")
        .bind(id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Customer not found".to_string())?;

    Ok(customer)
}

#[tauri::command]
pub async fn update_customer(
    app: AppHandle,
    id: i64,
    name: String,
    phone: Option<String>,
    address: Option<String>,
    city: Option<String>,
    social_media_url: Option<String>,
    platform: Option<String>,
) -> Result<(), String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    sqlx::query(
        "UPDATE customers SET name = ?, phone = ?, address = ?, city = ?, social_media_url = ?, platform = ? WHERE id = ?",
    )
    .bind(name)
    .bind(phone)
    .bind(address)
    .bind(city)
    .bind(social_media_url)
    .bind(platform)
    .bind(id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_customer(app: AppHandle, id: i64) -> Result<(), String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    sqlx::query("DELETE FROM customers WHERE id = ?")
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
