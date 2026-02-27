use std::time::Duration;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::state::{AppDb, Database};
use crate::{db_query, db_query_as, db_query_scalar, db_query_scalar_optional, db_query_as_optional};

// ─── Structs ─────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncConfig {
    pub id: Option<i64>,
    pub supabase_url: String,
    pub supabase_anon_key: String,
    pub supabase_service_key: String,
    pub sync_enabled: bool,
    pub sync_interval: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct SyncQueueItem {
    pub id: i64,
    pub table_name: String,
    pub operation: String,
    pub record_id: i64,
    pub payload: String,
    pub status: String,
    pub retry_count: i32,
    pub error_message: Option<String>,
    pub created_at: Option<String>,
    pub synced_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncStats {
    pub pending: i64,
    pub syncing: i64,
    pub synced: i64,
    pub failed: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct SyncSession {
    pub id: i64,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub total_queued: i64,
    pub total_synced: i64,
    pub total_failed: i64,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncCompletedEvent {
    pub session_id: i64,
    pub total_queued: i64,
    pub total_synced: i64,
    pub total_failed: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TestConnectionResult {
    pub connected: bool,
    pub tables_exist: bool,
    pub message: String,
}

// ─── Core Sync Functions ─────────────────────────────────────────

/// Auto-prune sync_sessions and sync_queue to keep only the latest 100 rows each.
async fn cleanup_old_sync_data(pool: &Database) {
    // Keep only latest 100 sync_sessions
    let _ = db_query!(
        pool,
        "DELETE FROM sync_sessions WHERE id NOT IN (SELECT id FROM sync_sessions ORDER BY started_at DESC LIMIT 100)"
    );

    // Keep only latest 100 synced queue items (already processed)
    let _ = db_query!(
        pool,
        "DELETE FROM sync_queue WHERE status = 'synced' AND id NOT IN (SELECT id FROM sync_queue WHERE status = 'synced' ORDER BY synced_at DESC LIMIT 100)"
    );
}

/// Insert a row into sync_queue. Call this after every write operation.
pub async fn enqueue_sync(
    pool: &Database,
    table: &str,
    op: &str,
    record_id: i64,
    payload: serde_json::Value,
) {
    let payload_str = payload.to_string();
    let _ = db_query!(
        pool,
        "INSERT INTO sync_queue (table_name, operation, record_id, payload, status) VALUES (?, ?, ?, ?, 'pending')",
        table,
        op,
        record_id,
        payload_str
    );
}

/// Load sync config from SQLite
async fn load_sync_config(pool: &Database) -> Option<SyncConfig> {
    let row: Option<(i64, String, String, String, i64, i64)> = db_query_as_optional!(
        (i64, String, String, String, i64, i64),
        pool,
        "SELECT id, supabase_url, supabase_anon_key, supabase_service_key, sync_enabled, COALESCE(sync_interval, 30) FROM sync_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1"
    )
    .ok()?;

    row.map(|(id, url, anon, service, enabled, interval)| SyncConfig {
        id: Some(id),
        supabase_url: url,
        supabase_anon_key: anon,
        supabase_service_key: service,
        sync_enabled: enabled == 1,
        sync_interval: interval as i32,
    })
}

/// Process all pending/failed sync queue items
pub async fn process_sync_queue(app: &AppHandle) {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let config = match load_sync_config(&pool).await {
        Some(c) if c.sync_enabled => c,
        _ => return,
    };

    // Emit sync started event
    let _ = app.emit("sync://started", ());

    // Create session
    let session_id: i64 = db_query_scalar!(
        i64,
        &*pool,
        "INSERT INTO sync_sessions (status) VALUES ('running') RETURNING id"
    )
    .unwrap_or(0);

    // Fetch items to sync
    let items: Vec<SyncQueueItem> = db_query_as!(
        SyncQueueItem,
        &*pool,
        "SELECT * FROM sync_queue WHERE status = 'pending' OR (status = 'failed' AND retry_count < 5) ORDER BY created_at ASC"
    )
    .unwrap_or_default();

    let total_queued = items.len() as i64;
    let _ = db_query!(
        &*pool,
        "UPDATE sync_sessions SET total_queued = ? WHERE id = ?",
        total_queued, session_id
    );

    let client = reqwest::Client::new();
    let mut total_synced: i64 = 0;
    let mut total_failed: i64 = 0;

    for item in &items {
        // Mark as syncing
        let _ = db_query!(
            &*pool,
            "UPDATE sync_queue SET status = 'syncing' WHERE id = ?",
            item.id
        );

        let result = match item.operation.as_str() {
            "INSERT" => {
                let url = format!("{}/rest/v1/{}", config.supabase_url, item.table_name);
                client
                    .post(&url)
                    .header("apikey", &config.supabase_service_key)
                    .header("Authorization", format!("Bearer {}", config.supabase_service_key))
                    .header("Content-Type", "application/json")
                    .header("Prefer", "resolution=merge-duplicates")
                    .body(item.payload.clone())
                    .send()
                    .await
            }
            "UPDATE" => {
                let url = format!(
                    "{}/rest/v1/{}?id=eq.{}",
                    config.supabase_url, item.table_name, item.record_id
                );
                client
                    .patch(&url)
                    .header("apikey", &config.supabase_service_key)
                    .header("Authorization", format!("Bearer {}", config.supabase_service_key))
                    .header("Content-Type", "application/json")
                    .body(item.payload.clone())
                    .send()
                    .await
            }
            "DELETE" => {
                // Soft delete: PATCH with deleted_at
                let url = format!(
                    "{}/rest/v1/{}?id=eq.{}",
                    config.supabase_url, item.table_name, item.record_id
                );
                client
                    .patch(&url)
                    .header("apikey", &config.supabase_service_key)
                    .header("Authorization", format!("Bearer {}", config.supabase_service_key))
                    .header("Content-Type", "application/json")
                    .body(item.payload.clone())
                    .send()
                    .await
            }
            _ => continue,
        };

        match result {
            Ok(resp) if resp.status().is_success() || resp.status().as_u16() == 201 || resp.status().as_u16() == 204 => {
                let _ = db_query!(
                    &*pool,
                    "UPDATE sync_queue SET status = 'synced', synced_at = datetime('now') WHERE id = ?",
                    item.id
                );
                total_synced += 1;
            }
            Ok(resp) => {
                let error_text = resp.text().await.unwrap_or_else(|_| "Unknown error".to_string());
                let _ = db_query!(
                    &*pool,
                    "UPDATE sync_queue SET status = 'failed', retry_count = retry_count + 1, error_message = ? WHERE id = ?",
                    &error_text, item.id
                );
                total_failed += 1;
            }
            Err(e) => {
                let _ = db_query!(
                    &*pool,
                    "UPDATE sync_queue SET status = 'failed', retry_count = retry_count + 1, error_message = ? WHERE id = ?",
                    e.to_string(), item.id
                );
                total_failed += 1;
            }
        }
    }

    // Update session
    let session_status = if total_failed > 0 && total_synced == 0 {
        "failed"
    } else {
        "completed"
    };
    let _ = db_query!(
        &*pool,
        "UPDATE sync_sessions SET finished_at = datetime('now'), total_synced = ?, total_failed = ?, status = ? WHERE id = ?",
        total_synced, total_failed, session_status, session_id
    );

    // Auto-cleanup old sync data (keep latest 100 rows)
    cleanup_old_sync_data(&pool).await;

    // Emit sync completed
    let _ = app.emit("sync://completed", SyncCompletedEvent {
        session_id,
        total_queued,
        total_synced,
        total_failed,
    });
}

/// Start the background sync loop
pub fn start_sync_loop(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // We wake up every 5 seconds to check if it's time to sync
        let mut last_sync: Option<tokio::time::Instant> = None;

        loop {
            tokio::time::sleep(Duration::from_secs(5)).await;

            let db = app.state::<AppDb>();
            let pool = db.0.lock().await;
            
            if let Some(config) = load_sync_config(&pool).await {
                if config.sync_enabled {
                    let interval_secs = config.sync_interval as u64;
                    
                    let should_sync = match last_sync {
                        Some(last) => last.elapsed() >= Duration::from_secs(interval_secs),
                        None => true,
                    };

                    if should_sync {
                        // Drop the lock before running process_sync_queue which takes its own lock
                        drop(pool);
                        process_sync_queue(&app).await;
                        last_sync = Some(tokio::time::Instant::now());
                    }
                }
            }
        }
    });
}

// ─── Tauri Commands ──────────────────────────────────────────────

#[tauri::command]
pub async fn save_sync_config(
    app: AppHandle,
    url: String,
    anon_key: String,
    service_key: String,
) -> Result<(), String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    // Fetch existing interval or default to 30
    let current_interval: i32 = db_query_scalar_optional!(i32, &*pool, "SELECT COALESCE(sync_interval, 30) FROM sync_config WHERE is_active = 1 LIMIT 1")
        .map_err(|e| e.to_string())?
        .unwrap_or(30);

    // Deactivate existing configs
    db_query!(&*pool, "UPDATE sync_config SET is_active = 0")
        .map_err(|e| e.to_string())?;

    // Insert new config
    db_query!(
        &*pool,
        "INSERT INTO sync_config (supabase_url, supabase_anon_key, supabase_service_key, is_active, sync_enabled, sync_interval) VALUES (?, ?, ?, 1, 1, ?)",
        url, anon_key, service_key, current_interval
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_sync_config(app: AppHandle) -> Result<Option<SyncConfig>, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;
    let config = load_sync_config(&pool).await;
    Ok(config)
}

#[tauri::command]
pub async fn update_sync_interval(app: AppHandle, interval: i32) -> Result<(), String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    db_query!(&*pool, "UPDATE sync_config SET sync_interval = ? WHERE is_active = 1", interval)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn test_sync_connection(app: AppHandle) -> Result<TestConnectionResult, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let config = load_sync_config(&pool).await.ok_or("No sync configuration found")?;

    let client = reqwest::Client::new();
    let url = format!("{}/rest/v1/", config.supabase_url);
    let resp = client
        .get(&url)
        .header("apikey", &config.supabase_anon_key)
        .header("Authorization", format!("Bearer {}", config.supabase_anon_key))
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    if !resp.status().is_success() {
        return Ok(TestConnectionResult {
            connected: false,
            tables_exist: false,
            message: format!("Connection failed with status: {}", resp.status()),
        });
    }

    // Parse the response body to check for expected tables
    let body = resp.text().await.unwrap_or_default();
    let required_tables = ["customers", "orders", "order_items", "expenses", "shop_settings", "sync_log"];
    let tables_exist = required_tables.iter().all(|table| body.contains(table));

    if tables_exist {
        Ok(TestConnectionResult {
            connected: true,
            tables_exist: true,
            message: "Connection successful! All tables found.".to_string(),
        })
    } else {
        Ok(TestConnectionResult {
            connected: true,
            tables_exist: false,
            message: "Connected, but required tables are missing. Please run the migration SQL in the Supabase SQL Editor.".to_string(),
        })
    }
}

#[tauri::command]
pub async fn trigger_sync_now(app: AppHandle) -> Result<String, String> {
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        process_sync_queue(&app_clone).await;
    });
    Ok("Sync triggered".to_string())
}

#[tauri::command]
pub async fn get_sync_queue_stats(app: AppHandle) -> Result<SyncStats, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let pending: i64 = db_query_scalar!(i64, &*pool, "SELECT COUNT(*) FROM sync_queue WHERE status = 'pending'")
        .map_err(|e| e.to_string())?;
    let syncing: i64 = db_query_scalar!(i64, &*pool, "SELECT COUNT(*) FROM sync_queue WHERE status = 'syncing'")
        .map_err(|e| e.to_string())?;
    let synced: i64 = db_query_scalar!(i64, &*pool, "SELECT COUNT(*) FROM sync_queue WHERE status = 'synced'")
        .map_err(|e| e.to_string())?;
    let failed: i64 = db_query_scalar!(i64, &*pool, "SELECT COUNT(*) FROM sync_queue WHERE status = 'failed'")
        .map_err(|e| e.to_string())?;

    Ok(SyncStats { pending, syncing, synced, failed })
}

#[tauri::command]
pub async fn get_sync_sessions(app: AppHandle, limit: i64) -> Result<Vec<SyncSession>, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let sessions = db_query_as!(
        SyncSession,
        &*pool,
        "SELECT * FROM sync_sessions ORDER BY started_at DESC LIMIT ?",
        limit
    )
    .map_err(|e| e.to_string())?;

    Ok(sessions)
}

#[tauri::command]
pub async fn get_sync_queue_items(
    app: AppHandle,
    status: Option<String>,
    limit: i64,
) -> Result<Vec<SyncQueueItem>, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let items = if let Some(s) = status {
        db_query_as!(
            SyncQueueItem,
            &*pool,
            "SELECT * FROM sync_queue WHERE status = ? ORDER BY created_at DESC LIMIT ?",
            s, limit
        )
        .map_err(|e| e.to_string())?
    } else {
        db_query_as!(
            SyncQueueItem,
            &*pool,
            "SELECT * FROM sync_queue ORDER BY created_at DESC LIMIT ?",
            limit
        )
        .map_err(|e| e.to_string())?
    };

    Ok(items)
}

#[tauri::command]
pub async fn retry_failed_items(app: AppHandle) -> Result<i64, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let rows_affected = match &*pool {
        crate::state::Database::Sqlite(p) => sqlx::query(
            "UPDATE sync_queue SET status = 'pending', retry_count = 0, error_message = NULL WHERE status = 'failed'"
        )
        .execute(p)
        .await
        .map_err(|e| e.to_string())?
        .rows_affected(),
        #[cfg(feature = "postgres")]
        crate::state::Database::Postgres(p) => sqlx::query(
            "UPDATE sync_queue SET status = 'pending', retry_count = 0, error_message = NULL WHERE status = 'failed'"
        )
        .execute(p)
        .await
        .map_err(|e| e.to_string())?
        .rows_affected(),
    };

    Ok(rows_affected as i64)
}

#[tauri::command]
pub async fn clear_synced_items(app: AppHandle, older_than_days: i64) -> Result<i64, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let rows_affected = match &*pool {
        crate::state::Database::Sqlite(p) => sqlx::query(
            "DELETE FROM sync_queue WHERE status = 'synced' AND synced_at < datetime('now', ? || ' days')"
        )
        .bind(format!("-{}", older_than_days))
        .execute(p)
        .await
        .map_err(|e| e.to_string())?
        .rows_affected(),
        #[cfg(feature = "postgres")]
        crate::state::Database::Postgres(p) => {
            let q = crate::db_macros::adapt_query_for_pg("DELETE FROM sync_queue WHERE status = 'synced' AND synced_at < CURRENT_TIMESTAMP - (? || ' days')::INTERVAL");
            sqlx::query(&q)
                .bind(format!("{}", older_than_days))
                .execute(p)
                .await
                .map_err(|e| e.to_string())?
                .rows_affected()
        }
    };

    Ok(rows_affected as i64)
}

#[tauri::command]
pub async fn clean_sync_data(app: AppHandle) -> Result<i64, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let rows_affected = match &*pool {
        crate::state::Database::Sqlite(p) => {
            let s = sqlx::query("DELETE FROM sync_sessions WHERE status IN ('completed', 'failed')")
                .execute(p).await.map_err(|e| e.to_string())?.rows_affected();
            let q = sqlx::query("DELETE FROM sync_queue WHERE status = 'synced'")
                .execute(p).await.map_err(|e| e.to_string())?.rows_affected();
            s + q
        },
        #[cfg(feature = "postgres")]
        crate::state::Database::Postgres(p) => {
            let s = sqlx::query("DELETE FROM sync_sessions WHERE status IN ('completed', 'failed')")
                .execute(p).await.map_err(|e| e.to_string())?.rows_affected();
            let q = sqlx::query("DELETE FROM sync_queue WHERE status = 'synced'")
                .execute(p).await.map_err(|e| e.to_string())?.rows_affected();
            s + q
        }
    };

    Ok(rows_affected as i64)
}

// ─── Master Password Commands ────────────────────────────────────

#[tauri::command]
pub async fn set_master_password(
    app: AppHandle,
    current_password: String,
    new_master: String,
) -> Result<(), String> {
    use argon2::{Argon2, PasswordHasher, password_hash::SaltString};
    use rand_core::OsRng;

    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    // Verify current login password for the owner
    let user: Option<(i64, String)> = db_query_as_optional!(
        (i64, String),
        &*pool,
        "SELECT id, password_hash FROM users WHERE role = 'owner' LIMIT 1"
    )
    .map_err(|e| e.to_string())?;

    let (user_id, password_hash) = user.ok_or("No owner account found")?;
    let valid = bcrypt::verify(&current_password, &password_hash).map_err(|e| e.to_string())?;
    if !valid {
        return Err("Invalid current password".to_string());
    }

    // Hash the new master password with argon2
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let master_hash = argon2
        .hash_password(new_master.as_bytes(), &salt)
        .map_err(|e| format!("Failed to hash master password: {}", e))?
        .to_string();

    db_query!(
        &*pool,
        "UPDATE users SET master_password_hash = ? WHERE id = ?",
        master_hash, user_id
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn verify_master_password(app: AppHandle, input: String) -> Result<bool, String> {
    use argon2::{Argon2, PasswordVerifier, PasswordHash};

    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let hash: Option<String> = db_query_scalar_optional!(
        String,
        &*pool,
        "SELECT master_password_hash FROM users WHERE role = 'owner' AND master_password_hash IS NOT NULL LIMIT 1"
    )
    .map_err(|e| e.to_string())?;

    match hash {
        Some(h) => {
            let parsed = PasswordHash::new(&h).map_err(|e| format!("Invalid hash: {}", e))?;
            Ok(Argon2::default().verify_password(input.as_bytes(), &parsed).is_ok())
        }
        None => Err("No master password set".to_string()),
    }
}

#[tauri::command]
pub async fn migrate_to_new_database(
    app: AppHandle,
    master_password: String,
    new_supabase_url: String,
    new_anon_key: String,
    new_service_key: String,
) -> Result<String, String> {
    use argon2::{Argon2, PasswordVerifier, PasswordHash};

    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    // 1. Verify master password
    let hash: Option<String> = db_query_scalar_optional!(
        String,
        &*pool,
        "SELECT master_password_hash FROM users WHERE role = 'owner' AND master_password_hash IS NOT NULL LIMIT 1"
    )
    .map_err(|e| e.to_string())?;

    let h = hash.ok_or("No master password set. Please set one first.")?;
    let parsed = PasswordHash::new(&h).map_err(|e| format!("Invalid hash: {}", e))?;
    if Argon2::default().verify_password(master_password.as_bytes(), &parsed).is_err() {
        return Err("Invalid master password".to_string());
    }

    // 2. Save new Supabase config
    db_query!(&*pool, "UPDATE sync_config SET is_active = 0")
        .map_err(|e| e.to_string())?;

    let current_interval: i32 = db_query_scalar_optional!(i32, &*pool, "SELECT COALESCE(sync_interval, 30) FROM sync_config WHERE is_active = 1 LIMIT 1")
        .map_err(|e| e.to_string())?
        .unwrap_or(30);

    db_query!(
        &*pool,
        "INSERT INTO sync_config (supabase_url, supabase_anon_key, supabase_service_key, is_active, sync_enabled, sync_interval) VALUES (?, ?, ?, 1, 1, ?)",
        &new_supabase_url, &new_anon_key, &new_service_key, current_interval
    )
    .map_err(|e| e.to_string())?;

    // 3. Reset all sync_queue to pending (full re-sync)
    db_query!(&*pool, "UPDATE sync_queue SET status = 'pending', retry_count = 0, error_message = NULL")
        .map_err(|e| e.to_string())?;

    // 4. Reset synced=0 on all records
    for table in &["customers", "orders", "order_items", "expenses", "shop_settings"] {
        let _ = db_query!(&*pool, &format!("UPDATE {} SET synced = 0", table));
    }

    // 5. Count total records to re-queue
    let mut total: i64 = 0;
    for table in &["customers", "orders", "order_items", "expenses", "shop_settings"] {
        let count: i64 = db_query_scalar!(i64, &*pool, &format!("SELECT COUNT(*) FROM {}", table))
            .unwrap_or(0);
        total += count;

        // Re-enqueue all existing records
        let ids: Vec<(i64,)> = db_query_as!((i64,), &*pool, &format!("SELECT id FROM {}", table))
            .unwrap_or_default();

        for (id,) in ids {
            // Fetch full record as JSON-like payload
            let query = format!("SELECT json_object('id', id) FROM {} WHERE id = ?", table);
            let query = if matches!(&*pool, crate::state::Database::Postgres(_)) {
                query.replace("json_object", "json_build_object")
            } else { query };
            let row: Option<(String,)> = db_query_as_optional!((String,), &*pool, &query, id)
                .unwrap_or(None);

            if let Some((payload,)) = row {
                let _ = db_query!(
                    &*pool,
                    "INSERT INTO sync_queue (table_name, operation, record_id, payload, status) VALUES (?, 'INSERT', ?, ?, 'pending')",
                    table, id, payload
                );
            }
        }
    }

    // 6. Trigger sync immediately (drop pool lock first)
    drop(pool);
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        process_sync_queue(&app_clone).await;
    });

    Ok(format!("Migration started. {} records queued for sync.", total))
}

#[tauri::command]
pub async fn trigger_full_sync(app: AppHandle) -> Result<String, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    // Verify config exists
    let _config = load_sync_config(&pool).await.ok_or("No sync configuration found. Please save your Supabase config first.")?;

    // Clear any existing pending/failed items to avoid duplicates
    db_query!(&*pool, "DELETE FROM sync_queue WHERE status IN ('pending', 'failed')")
        .map_err(|e| e.to_string())?;

    // Table definitions: (table_name, json_object columns SQL)
    let tables: Vec<(&str, &str)> = vec![
        ("shop_settings", "json_object('id', id, 'shop_name', shop_name, 'phone', phone, 'address', address, 'logo_path', logo_path, 'customer_id_prefix', customer_id_prefix, 'order_id_prefix', order_id_prefix, 'created_at', created_at, 'updated_at', updated_at)"),
        ("customers", "json_object('id', id, 'customer_id', customer_id, 'name', name, 'phone', phone, 'address', address, 'city', city, 'social_media_url', social_media_url, 'platform', platform, 'created_at', created_at, 'updated_at', updated_at, 'deleted_at', deleted_at)"),
        ("orders", "json_object('id', id, 'order_id', order_id, 'customer_id', customer_id, 'status', status, 'order_from', order_from, 'exchange_rate', exchange_rate, 'shipping_fee', shipping_fee, 'delivery_fee', delivery_fee, 'cargo_fee', cargo_fee, 'order_date', order_date, 'arrived_date', arrived_date, 'shipment_date', shipment_date, 'user_withdraw_date', user_withdraw_date, 'service_fee', service_fee, 'product_discount', product_discount, 'service_fee_type', service_fee_type, 'shipping_fee_paid', shipping_fee_paid, 'delivery_fee_paid', delivery_fee_paid, 'cargo_fee_paid', cargo_fee_paid, 'service_fee_paid', service_fee_paid, 'shipping_fee_by_shop', shipping_fee_by_shop, 'delivery_fee_by_shop', delivery_fee_by_shop, 'cargo_fee_by_shop', cargo_fee_by_shop, 'exclude_cargo_fee', exclude_cargo_fee, 'created_at', created_at, 'updated_at', updated_at, 'deleted_at', deleted_at)"),
        ("order_items", "json_object('id', id, 'order_id', order_id, 'product_url', product_url, 'product_qty', product_qty, 'price', price, 'product_weight', product_weight, 'created_at', created_at, 'updated_at', updated_at, 'deleted_at', deleted_at)"),
        ("expenses", "json_object('id', id, 'expense_id', expense_id, 'title', title, 'amount', amount, 'category', category, 'payment_method', payment_method, 'notes', notes, 'expense_date', expense_date, 'created_at', created_at, 'updated_at', updated_at, 'deleted_at', deleted_at)"),
    ];

    let mut total: i64 = 0;

    for (table, json_expr) in &tables {
        let query = format!("SELECT id, {} as payload FROM {}", json_expr, table);
        let query = if matches!(&*pool, crate::state::Database::Postgres(_)) {
            query.replace("json_object", "json_build_object")
        } else { query };
        let rows: Vec<(i64, String)> = db_query_as!((i64, String), &*pool, &query)
            .unwrap_or_default();

        for (id, payload) in &rows {
            let _ = db_query!(
                &*pool,
                "INSERT INTO sync_queue (table_name, operation, record_id, payload, status) VALUES (?, 'INSERT', ?, ?, 'pending')",
                table, id, payload
            );
        }

        total += rows.len() as i64;
    }

    // Mark all records as unsynced
    for table in &["customers", "orders", "order_items", "expenses", "shop_settings"] {
        let _ = db_query!(&*pool, &format!("UPDATE {} SET synced = 0", table));
    }

    // Drop pool lock and trigger sync immediately
    drop(pool);
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        process_sync_queue(&app_clone).await;
    });

    Ok(format!("{} records queued for initial sync.", total))
}

#[tauri::command]
pub async fn get_migration_sql() -> Result<String, String> {
    Ok(include_str!("../../supabase_migration.sql").to_string())
}
