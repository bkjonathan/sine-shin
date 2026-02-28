use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;
use tauri::Manager;

use crate::state::AppDb;
use crate::sync::SyncConfig;

#[derive(Serialize, Deserialize, Debug)]
pub struct StaffUser {
    pub id: String,
    pub email: String,
    pub user_metadata: Value,
    pub created_at: String,
    pub updated_at: String,
}

/// Load the active sync config
async fn get_active_sync_config(app: &AppHandle) -> Result<SyncConfig, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let row: Option<(i64, String, String, String, i64, i64)> = sqlx::query_as(
        "SELECT id, supabase_url, supabase_anon_key, supabase_service_key, sync_enabled, COALESCE(sync_interval, 30) FROM sync_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1"
    )
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let config = row.map(|(id, url, anon, service, enabled, interval)| SyncConfig {
        id: Some(id),
        supabase_url: url,
        supabase_anon_key: anon,
        supabase_service_key: service,
        sync_enabled: enabled == 1,
        sync_interval: interval as i32,
    });

    config.ok_or_else(|| "Sync is not configured or enabled.".to_string())
}

#[tauri::command]
pub async fn get_staff_users(app: AppHandle) -> Result<Value, String> {
    let config = get_active_sync_config(&app).await?;
    let client = Client::new();
    let url = format!("{}/auth/v1/admin/users", config.supabase_url);

    let res = client
        .get(&url)
        .header("apikey", &config.supabase_service_key)
        .header("Authorization", format!("Bearer {}", config.supabase_service_key))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        let text = res.text().await.map_err(|e| e.to_string())?;
        let json: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
        Ok(json)
    } else {
        let err = res.text().await.unwrap_or_default();
        Err(format!("Failed to retrieve staff users: {}", err))
    }
}

#[tauri::command]
pub async fn create_staff_user(app: AppHandle, email: String, password: String, data: Value) -> Result<Value, String> {
    let config = get_active_sync_config(&app).await?;
    let client = Client::new();
    let url = format!("{}/auth/v1/admin/users", config.supabase_url);

    let payload = serde_json::json!({
        "email": email,
        "password": password,
        "email_confirm": true,
        "user_metadata": data
    });

    let res = client
        .post(&url)
        .header("apikey", &config.supabase_service_key)
        .header("Authorization", format!("Bearer {}", config.supabase_service_key))
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        let text = res.text().await.map_err(|e| e.to_string())?;
        let json: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
        Ok(json)
    } else {
        let err = res.text().await.unwrap_or_default();
        Err(format!("Failed to create staff user: {}", err))
    }
}

#[tauri::command]
pub async fn update_staff_user(app: AppHandle, id: String, email: Option<String>, password: Option<String>, data: Option<Value>) -> Result<Value, String> {
    let config = get_active_sync_config(&app).await?;
    let client = Client::new();
    let url = format!("{}/auth/v1/admin/users/{}", config.supabase_url, id);

    let mut payload = serde_json::json!({});
    if let Some(e) = email {
        payload["email"] = serde_json::json!(e);
    }
    if let Some(p) = password {
        if !p.is_empty() {
             payload["password"] = serde_json::json!(p);
        }
    }
    if let Some(d) = data {
        payload["user_metadata"] = d;
    }

    let res = client
        .put(&url)
        .header("apikey", &config.supabase_service_key)
        .header("Authorization", format!("Bearer {}", config.supabase_service_key))
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        let text = res.text().await.map_err(|e| e.to_string())?;
        let json: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
        Ok(json)
    } else {
        let err = res.text().await.unwrap_or_default();
        Err(format!("Failed to update staff user: {}", err))
    }
}

#[tauri::command]
pub async fn delete_staff_user(app: AppHandle, id: String) -> Result<(), String> {
    let config = get_active_sync_config(&app).await?;
    let client = Client::new();
    let url = format!("{}/auth/v1/admin/users/{}", config.supabase_url, id);

    let res = client
        .delete(&url)
        .header("apikey", &config.supabase_service_key)
        .header("Authorization", format!("Bearer {}", config.supabase_service_key))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        Ok(())
    } else {
        let err = res.text().await.unwrap_or_default();
        Err(format!("Failed to delete staff user: {}", err))
    }
}
