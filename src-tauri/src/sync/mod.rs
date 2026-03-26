pub mod client;

use serde::{Deserialize, Serialize};
use sqlx::AnyPool;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use crate::state::AppDb;

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
    pub record_id: String,
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

#[derive(Debug, Clone)]
struct PushSyncResult {
    remote_uuid: Option<String>,
}

// ─── Core Sync Functions ─────────────────────────────────────────

/// Auto-prune sync_sessions and sync_queue to keep only the latest 100 rows each.
async fn cleanup_old_sync_data(pool: &AnyPool) {
    // Keep only latest 100 sync_sessions
    let _ = sqlx::query(
        "DELETE FROM sync_sessions WHERE id NOT IN (SELECT id FROM sync_sessions ORDER BY started_at DESC LIMIT 100)"
    )
    .execute(pool)
    .await;

    // Keep only latest 100 synced queue items (already processed)
    let _ = sqlx::query(
        "DELETE FROM sync_queue WHERE status = 'synced' AND id NOT IN (SELECT id FROM sync_queue WHERE status = 'synced' ORDER BY synced_at DESC LIMIT 100)"
    )
    .execute(pool)
    .await;
}

fn supports_synced_marker(table: &str) -> bool {
    matches!(
        table,
        "shop_settings" | "customers" | "orders" | "order_items" | "expenses"
    )
}

fn supports_deleted_at(table: &str) -> bool {
    matches!(table, "customers" | "orders" | "order_items" | "expenses")
}

fn remote_row_is_deleted(row: &serde_json::Value) -> bool {
    row.get("deleted_at")
        .and_then(|v| v.as_str())
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false)
}

fn parse_timestamp_millis(ts: &str) -> Option<i64> {
    if ts.trim().is_empty() {
        return None;
    }

    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(ts) {
        return Some(dt.timestamp_millis());
    }

    if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%d %H:%M:%S") {
        return Some(naive.and_utc().timestamp_millis());
    }

    None
}

fn remote_row_timestamp_millis(row: &serde_json::Value) -> i64 {
    let ts = row
        .get("updated_at")
        .and_then(|v| v.as_str())
        .or_else(|| row.get("created_at").and_then(|v| v.as_str()))
        .unwrap_or("");

    parse_timestamp_millis(ts).unwrap_or(0)
}

fn remote_order_item_signature(row: &serde_json::Value) -> Option<String> {
    let order_id = row.get("order_id").and_then(|v| v.as_str())?;
    let product_url = row
        .get("product_url")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let product_qty = row.get("product_qty").and_then(|v| v.as_i64()).unwrap_or(0);
    let price = row.get("price").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let weight = row
        .get("product_weight")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    Some(format!(
        "{}|{}|{}|{:.6}|{:.6}",
        order_id, product_url, product_qty, price, weight
    ))
}

async fn local_record_is_active(pool: &AnyPool, table: &str, record_id: &str) -> bool {
    let exists = match table {
        "shop_settings" => {
            sqlx::query_scalar::<_, i64>("SELECT 1 FROM shop_settings WHERE id = ? LIMIT 1")
                .bind(record_id)
                .fetch_optional(pool)
                .await
                .ok()
                .flatten()
                .is_some()
        }
        "customers" | "orders" | "order_items" | "expenses" => {
            let query = format!(
                "SELECT 1 FROM {} WHERE id = ? AND deleted_at IS NULL LIMIT 1",
                table
            );
            sqlx::query_scalar::<_, i64>(&query)
                .bind(record_id)
                .fetch_optional(pool)
                .await
                .ok()
                .flatten()
                .is_some()
        }
        _ => false,
    };

    exists
}

fn extract_record_uuid(payload: &serde_json::Value) -> Option<String> {
    payload
        .get("id")
        .and_then(|v| v.as_str())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn build_supabase_payload(
    table: &str,
    record_id: &str,
    payload: &str,
) -> Result<serde_json::Value, String> {
    let mut value: serde_json::Value = serde_json::from_str(payload)
        .map_err(|e| format!("Invalid payload JSON for {}: {}", table, e))?;
    let obj = value
        .as_object_mut()
        .ok_or_else(|| format!("Payload for {} must be a JSON object", table))?;

    let local_id = obj
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or(record_id)
        .to_string();
    obj.insert("local_id".to_string(), serde_json::json!(local_id));
    obj.remove("id");
    obj.remove("synced");

    obj.insert(
        "synced_from_device_at".to_string(),
        serde_json::json!(chrono::Utc::now().to_rfc3339()),
    );

    Ok(value)
}

async fn mark_local_synced(
    pool: &AnyPool,
    table: &str,
    record_id: &str,
    _remote_uuid: Option<&str>,
) {
    if !supports_synced_marker(table) {
        return;
    }

    let query = format!(
        "UPDATE {} SET synced = 1, updated_at = datetime('now') WHERE id = ?",
        table
    );

    let _ = sqlx::query(&query).bind(record_id).execute(pool).await;
}

/// Push one record to Supabase. Returns remote uuid when available.
async fn push_sync_item(
    config: &SyncConfig,
    table: &str,
    op: &str,
    record_id: &str,
    record_uuid: Option<&str>,
    payload: &str,
) -> Result<PushSyncResult, String> {
    if !matches!(op, "INSERT" | "UPDATE" | "DELETE") {
        return Err(format!("Unsupported sync operation: {}", op));
    }

    let client = reqwest::Client::new();

    // order_items are physically deleted locally during order edits; mirror that remotely
    // so Supabase row count matches local SQLite for active items.
    if op == "DELETE" && table == "order_items" {
        let url = format!(
            "{}/rest/v1/{}?local_id=eq.{}",
            config.supabase_url, table, record_id
        );

        let response = client
            .delete(&url)
            .header("apikey", &config.supabase_service_key)
            .header(
                "Authorization",
                format!("Bearer {}", config.supabase_service_key),
            )
            .header("Prefer", "return=representation")
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let status = response.status();
        let response_text = response.text().await.unwrap_or_default();

        if !status.is_success() {
            return Err(format!(
                "HTTP {} for {} {} ({}): {}",
                status, table, record_id, op, response_text
            ));
        }

        let remote_uuid = serde_json::from_str::<serde_json::Value>(&response_text)
            .ok()
            .and_then(|v| v.as_array().cloned())
            .and_then(|rows| rows.into_iter().next())
            .and_then(|row| row.get("uuid").cloned())
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .or_else(|| record_uuid.map(|v| v.to_string()));

        return Ok(PushSyncResult { remote_uuid });
    }

    let body_value = build_supabase_payload(table, record_id, payload)?;
    let url = format!(
        "{}/rest/v1/{}?on_conflict=local_id",
        config.supabase_url, table
    );

    let response = client
        .post(&url)
        .header("apikey", &config.supabase_service_key)
        .header(
            "Authorization",
            format!("Bearer {}", config.supabase_service_key),
        )
        .header("Content-Type", "application/json")
        .header(
            "Prefer",
            "resolution=merge-duplicates,return=representation",
        )
        .body(body_value.to_string())
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status();
    let response_text = response
        .text()
        .await
        .unwrap_or_else(|_| "Unknown error".to_string());

    if !status.is_success() {
        return Err(format!(
            "HTTP {} for {} {} ({}): {}",
            status, table, record_id, op, response_text
        ));
    }

    let remote_uuid = serde_json::from_str::<serde_json::Value>(&response_text)
        .ok()
        .and_then(|v| v.as_array().cloned())
        .and_then(|rows| rows.into_iter().next())
        .and_then(|row| row.get("uuid").cloned())
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .or_else(|| record_uuid.map(|v| v.to_string()));

    Ok(PushSyncResult { remote_uuid })
}

/// Try immediate sync first. If it fails, store item in queue for retry.
pub async fn enqueue_sync(
    pool: &AnyPool,
    _app: &AppHandle,
    table: &str,
    op: &str,
    record_id: &str,
    payload: serde_json::Value,
) {
    let pool_clone = pool.clone();
    let table_name = table.to_string();
    let operation = op.to_string();
    let record_id_owned = record_id.to_string();
    let record_uuid = extract_record_uuid(&payload);
    let payload_str = payload.to_string();

    tauri::async_runtime::spawn(async move {
        // Check if sync is enabled
        let config = match load_sync_config(&pool_clone).await {
            Some(c) if c.sync_enabled => c,
            _ => return, // sync is not enabled, so we don't enqueue anything
        };

        // Deduplicate queue entries to avoid stale inserts/updates being synced
        // after a record has changed again (especially for order_items edits).
        match operation.as_str() {
            "INSERT" | "UPDATE" => {
                let _ = sqlx::query(
                    "DELETE FROM sync_queue
                     WHERE table_name = ?
                       AND record_id = ?
                       AND operation IN ('INSERT', 'UPDATE')
                       AND status IN ('pending', 'failed')",
                )
                .bind(&table_name)
                .bind(&record_id_owned)
                .execute(&pool_clone)
                .await;
            }
            "DELETE" => {
                let _ = sqlx::query(
                    "DELETE FROM sync_queue
                     WHERE table_name = ?
                       AND record_id = ?
                       AND status IN ('pending', 'failed')",
                )
                .bind(&table_name)
                .bind(&record_id_owned)
                .execute(&pool_clone)
                .await;
            }
            _ => {}
        }

        // Online-first behavior: successful direct writes should not enter queue.
        match push_sync_item(
            &config,
            &table_name,
            &operation,
            &record_id_owned,
            record_uuid.as_deref(),
            &payload_str,
        )
        .await
        {
            Ok(result) => {
                mark_local_synced(
                    &pool_clone,
                    &table_name,
                    &record_id_owned,
                    result.remote_uuid.as_deref(),
                )
                .await;
            }
            Err(sync_error) => {
                let _ = sqlx::query(
                    "INSERT INTO sync_queue (table_name, operation, record_id, payload, status, error_message) VALUES (?, ?, ?, ?, 'pending', ?)"
            )
            .bind(table_name)
            .bind(operation)
            .bind(record_id_owned)
            .bind(payload_str)
            .bind(sync_error)
            .execute(&pool_clone)
            .await;
            }
        }
    });
}

/// Load sync config from SQLite
async fn load_sync_config(pool: &AnyPool) -> Option<SyncConfig> {
    let row: Option<(i64, String, String, String, i64, i64)> = sqlx::query_as(
        "SELECT id, supabase_url, supabase_anon_key, supabase_service_key, sync_enabled, COALESCE(sync_interval, 30) FROM sync_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1"
    )
    .fetch_optional(pool)
    .await
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

    // Fetch items to sync first
    let items: Vec<SyncQueueItem> = sqlx::query_as(
        "SELECT * FROM sync_queue WHERE status = 'pending' OR (status = 'failed' AND retry_count < 5) ORDER BY created_at ASC"
    )
    .fetch_all(&*pool)
    .await
    .unwrap_or_default();

    if items.is_empty() {
        return; // Nothing to sync, don't create empty session
    }

    // Emit sync started event
    let _ = app.emit("sync://started", ());

    // Create session
    let session_id: i64 =
        sqlx::query_scalar("INSERT INTO sync_sessions (status) VALUES ('running') RETURNING id")
            .fetch_one(&*pool)
            .await
            .unwrap_or(0);

    let total_queued = items.len() as i64;
    let _ = sqlx::query("UPDATE sync_sessions SET total_queued = ? WHERE id = ?")
        .bind(total_queued)
        .bind(session_id)
        .execute(&*pool)
        .await;

    let mut total_synced: i64 = 0;
    let mut total_failed: i64 = 0;

    for item in &items {
        // Skip stale queue rows where the local record no longer exists/active.
        // This prevents old order_items INSERTs from resurrecting replaced rows remotely.
        if item.operation != "DELETE"
            && !local_record_is_active(&pool, &item.table_name, &item.record_id).await
        {
            let _ = sqlx::query(
                "UPDATE sync_queue
                 SET status = 'synced',
                     synced_at = datetime('now'),
                     error_message = COALESCE(error_message, 'Skipped stale queue item: local record missing')
                 WHERE id = ?",
            )
            .bind(item.id)
            .execute(&*pool)
            .await;
            continue;
        }

        // Mark as syncing
        let _ = sqlx::query("UPDATE sync_queue SET status = 'syncing' WHERE id = ?")
            .bind(item.id)
            .execute(&*pool)
            .await;

        match push_sync_item(
            &config,
            &item.table_name,
            &item.operation,
            &item.record_id,
            None,
            &item.payload,
        )
        .await
        {
            Ok(result) => {
                let _ = sqlx::query(
                    "UPDATE sync_queue SET status = 'synced', synced_at = datetime('now') WHERE id = ?"
                )
                .bind(item.id)
                .execute(&*pool)
                .await;
                mark_local_synced(
                    &*pool,
                    &item.table_name,
                    &item.record_id,
                    result.remote_uuid.as_deref(),
                )
                .await;
                total_synced += 1;
            }
            Err(error_text) => {
                let _ = sqlx::query(
                    "UPDATE sync_queue SET status = 'failed', retry_count = retry_count + 1, error_message = ? WHERE id = ?"
                )
                .bind(&error_text)
                .bind(item.id)
                .execute(&*pool)
                .await;
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
    let _ = sqlx::query(
        "UPDATE sync_sessions SET finished_at = datetime('now'), total_synced = ?, total_failed = ?, status = ? WHERE id = ?"
    )
    .bind(total_synced)
    .bind(total_failed)
    .bind(session_status)
    .bind(session_id)
    .execute(&*pool)
    .await;

    // Auto-cleanup old sync data (keep latest 100 rows)
    cleanup_old_sync_data(&pool).await;

    // Emit sync completed
    let _ = app.emit(
        "sync://completed",
        SyncCompletedEvent {
            session_id,
            total_queued,
            total_synced,
            total_failed,
        },
    );
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
    let current_interval: i32 = sqlx::query_scalar(
        "SELECT COALESCE(sync_interval, 30) FROM sync_config WHERE is_active = 1 LIMIT 1",
    )
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .unwrap_or(30);

    // Deactivate existing configs
    sqlx::query("UPDATE sync_config SET is_active = 0")
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    // Insert new config
    sqlx::query(
        "INSERT INTO sync_config (supabase_url, supabase_anon_key, supabase_service_key, is_active, sync_enabled, sync_interval) VALUES (?, ?, ?, 1, 1, ?)"
    )
    .bind(url)
    .bind(anon_key)
    .bind(service_key)
    .bind(current_interval)
    .execute(&*pool)
    .await
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

    sqlx::query("UPDATE sync_config SET sync_interval = ? WHERE is_active = 1")
        .bind(interval)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn test_sync_connection(app: AppHandle) -> Result<TestConnectionResult, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let config = load_sync_config(&pool)
        .await
        .ok_or("No sync configuration found")?;

    let client = reqwest::Client::new();
    let url = format!("{}/rest/v1/", config.supabase_url);
    let resp = client
        .get(&url)
        .header("apikey", &config.supabase_anon_key)
        .header(
            "Authorization",
            format!("Bearer {}", config.supabase_anon_key),
        )
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
    let required_tables = [
        "customers",
        "orders",
        "order_items",
        "expenses",
        "shop_settings",
        "sync_log",
    ];
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

    let pending: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sync_queue WHERE status = 'pending'")
            .fetch_one(&*pool)
            .await
            .map_err(|e| e.to_string())?;
    let syncing: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sync_queue WHERE status = 'syncing'")
            .fetch_one(&*pool)
            .await
            .map_err(|e| e.to_string())?;
    let synced: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sync_queue WHERE status = 'synced'")
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    let failed: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sync_queue WHERE status = 'failed'")
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(SyncStats {
        pending,
        syncing,
        synced,
        failed,
    })
}

#[tauri::command]
pub async fn get_sync_sessions(app: AppHandle, limit: i64) -> Result<Vec<SyncSession>, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let sessions = sqlx::query_as::<_, SyncSession>(
        "SELECT * FROM sync_sessions ORDER BY started_at DESC LIMIT ?",
    )
    .bind(limit)
    .fetch_all(&*pool)
    .await
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
        sqlx::query_as::<_, SyncQueueItem>(
            "SELECT * FROM sync_queue WHERE status = ? ORDER BY created_at DESC LIMIT ?",
        )
        .bind(s)
        .bind(limit)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?
    } else {
        sqlx::query_as::<_, SyncQueueItem>(
            "SELECT * FROM sync_queue ORDER BY created_at DESC LIMIT ?",
        )
        .bind(limit)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?
    };

    Ok(items)
}

#[tauri::command]
pub async fn retry_failed_items(app: AppHandle) -> Result<i64, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let result = sqlx::query(
        "UPDATE sync_queue SET status = 'pending', retry_count = 0, error_message = NULL WHERE status = 'failed'"
    )
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(result.rows_affected() as i64)
}

#[tauri::command]
pub async fn clear_synced_items(app: AppHandle, older_than_days: i64) -> Result<i64, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let result = sqlx::query(
        "DELETE FROM sync_queue WHERE status = 'synced' AND synced_at < datetime('now', ? || ' days')"
    )
    .bind(format!("-{}", older_than_days))
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(result.rows_affected() as i64)
}

#[tauri::command]
pub async fn clean_sync_data(app: AppHandle) -> Result<i64, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    // Delete all completed/failed sessions
    let sessions_deleted =
        sqlx::query("DELETE FROM sync_sessions WHERE status IN ('completed', 'failed')")
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?
            .rows_affected();

    // Delete all synced queue items
    let queue_deleted = sqlx::query("DELETE FROM sync_queue WHERE status = 'synced'")
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .rows_affected();

    Ok((sessions_deleted + queue_deleted) as i64)
}

// ─── Master Password Commands ────────────────────────────────────

#[tauri::command]
pub async fn set_master_password(
    app: AppHandle,
    current_password: String,
    new_master: String,
) -> Result<(), String> {
    use argon2::{password_hash::SaltString, Argon2, PasswordHasher};
    use rand_core::OsRng;

    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    // Verify current login password for the owner
    let user: Option<(i64, String)> =
        sqlx::query_as("SELECT id, password_hash FROM users WHERE role = 'owner' LIMIT 1")
            .fetch_optional(&*pool)
            .await
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

    sqlx::query("UPDATE users SET master_password_hash = ? WHERE id = ?")
        .bind(master_hash)
        .bind(user_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn verify_master_password(app: AppHandle, input: String) -> Result<bool, String> {
    use argon2::{Argon2, PasswordHash, PasswordVerifier};

    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let hash: Option<String> = sqlx::query_scalar(
        "SELECT master_password_hash FROM users WHERE role = 'owner' AND master_password_hash IS NOT NULL LIMIT 1"
    )
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    match hash {
        Some(h) => {
            let parsed = PasswordHash::new(&h).map_err(|e| format!("Invalid hash: {}", e))?;
            Ok(Argon2::default()
                .verify_password(input.as_bytes(), &parsed)
                .is_ok())
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
    use argon2::{Argon2, PasswordHash, PasswordVerifier};

    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    // 1. Verify master password
    let hash: Option<String> = sqlx::query_scalar(
        "SELECT master_password_hash FROM users WHERE role = 'owner' AND master_password_hash IS NOT NULL LIMIT 1"
    )
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let h = hash.ok_or("No master password set. Please set one first.")?;
    let parsed = PasswordHash::new(&h).map_err(|e| format!("Invalid hash: {}", e))?;
    if Argon2::default()
        .verify_password(master_password.as_bytes(), &parsed)
        .is_err()
    {
        return Err("Invalid master password".to_string());
    }

    // 2. Preserve current interval before deactivating existing config
    let current_interval: i32 = sqlx::query_scalar(
        "SELECT COALESCE(sync_interval, 30) FROM sync_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1",
    )
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .unwrap_or(30);

    // 3. Save new Supabase config
    sqlx::query("UPDATE sync_config SET is_active = 0")
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO sync_config (supabase_url, supabase_anon_key, supabase_service_key, is_active, sync_enabled, sync_interval) VALUES (?, ?, ?, 1, 1, ?)"
    )
    .bind(&new_supabase_url)
    .bind(&new_anon_key)
    .bind(&new_service_key)
    .bind(current_interval)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // 4. Trigger a proper full sync rebuild using complete payloads.
    drop(pool);
    trigger_full_sync(app).await
}

#[tauri::command]
pub async fn trigger_full_sync(app: AppHandle) -> Result<String, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    // Verify config exists
    let _config = load_sync_config(&pool)
        .await
        .ok_or("No sync configuration found. Please save your Supabase config first.")?;

    // Clear any existing pending/failed items to avoid duplicates
    sqlx::query("DELETE FROM sync_queue WHERE status IN ('pending', 'failed')")
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    // Table definitions: (table_name, json_object columns SQL)
    let tables: Vec<(&str, &str)> = vec![
        ("shop_settings", "json_object('id', id, 'shop_name', shop_name, 'phone', phone, 'address', address, 'logo_path', logo_path, 'logo_cloud_url', logo_cloud_url, 'customer_id_prefix', customer_id_prefix, 'order_id_prefix', order_id_prefix, 'created_at', created_at, 'updated_at', updated_at)"),
        ("customers", "json_object('id', id, 'customer_id', customer_id, 'name', name, 'phone', phone, 'address', address, 'city', city, 'social_media_url', social_media_url, 'platform', platform, 'created_at', created_at, 'updated_at', updated_at, 'deleted_at', deleted_at)"),
        ("orders", "json_object('id', id, 'order_id', order_id, 'customer_id', customer_id, 'status', status, 'order_from', order_from, 'exchange_rate', exchange_rate, 'shipping_fee', shipping_fee, 'delivery_fee', delivery_fee, 'cargo_fee', cargo_fee, 'order_date', order_date, 'arrived_date', arrived_date, 'shipment_date', shipment_date, 'user_withdraw_date', user_withdraw_date, 'service_fee', service_fee, 'product_discount', product_discount, 'service_fee_type', service_fee_type, 'shipping_fee_paid', shipping_fee_paid, 'delivery_fee_paid', delivery_fee_paid, 'cargo_fee_paid', cargo_fee_paid, 'service_fee_paid', service_fee_paid, 'shipping_fee_by_shop', shipping_fee_by_shop, 'delivery_fee_by_shop', delivery_fee_by_shop, 'cargo_fee_by_shop', cargo_fee_by_shop, 'exclude_cargo_fee', exclude_cargo_fee, 'created_at', created_at, 'updated_at', updated_at, 'deleted_at', deleted_at)"),
        ("order_items", "json_object('id', id, 'order_id', order_id, 'product_url', product_url, 'product_qty', product_qty, 'price', price, 'product_weight', product_weight, 'created_at', created_at, 'updated_at', updated_at, 'deleted_at', deleted_at)"),
        ("expenses", "json_object('id', id, 'expense_id', expense_id, 'title', title, 'amount', amount, 'category', category, 'payment_method', payment_method, 'notes', notes, 'expense_date', expense_date, 'created_at', created_at, 'updated_at', updated_at, 'deleted_at', deleted_at)"),
    ];

    let mut total: i64 = 0;

    for (table, json_expr) in &tables {
        let query = format!("SELECT id, {} as payload FROM {}", json_expr, table);
        let rows: Vec<(String, String)> = sqlx::query_as(&query)
            .fetch_all(&*pool)
            .await
            .unwrap_or_default();

        for (id, payload) in &rows {
            let _ = sqlx::query(
                "INSERT INTO sync_queue (table_name, operation, record_id, payload, status) VALUES (?, 'INSERT', ?, ?, 'pending')"
            )
            .bind(table)
            .bind(id)
            .bind(payload)
            .execute(&*pool)
            .await;
        }

        total += rows.len() as i64;
    }

    // Mark all records as unsynced
    for table in &[
        "customers",
        "orders",
        "order_items",
        "expenses",
        "shop_settings",
    ] {
        let _ = sqlx::query(&format!("UPDATE {} SET synced = 0", table))
            .execute(&*pool)
            .await;
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

#[tauri::command]
pub async fn truncate_and_sync(app: AppHandle) -> Result<String, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    // Verify config exists
    let config = load_sync_config(&pool)
        .await
        .ok_or("No sync configuration found. Please save your Supabase config first.")?;

    let client = reqwest::Client::new();
    let tables = vec![
        "shop_settings",
        "customers",
        "orders",
        "order_items",
        "expenses",
    ];

    // Truncate tables on Supabase
    for table in &tables {
        let url = format!("{}/rest/v1/{}?uuid=not.is.null", config.supabase_url, table);
        let res = client
            .delete(&url)
            .header("apikey", &config.supabase_service_key)
            .header(
                "Authorization",
                format!("Bearer {}", config.supabase_service_key),
            )
            .send()
            .await;

        if let Err(e) = res {
            eprintln!("Failed to truncate table {}: {}", table, e);
        } else if let Ok(resp) = res {
            if !resp.status().is_success() {
                let status = resp.status();
                let error_text = resp
                    .text()
                    .await
                    .unwrap_or_else(|_| "Unknown error".to_string());
                eprintln!(
                    "Failed to truncate table {} (Status {}): {}",
                    table, status, error_text
                );
            }
        }
    }

    // Drop lock before calling trigger_full_sync
    drop(pool);

    // Call trigger_full_sync which will queue everything up and start the sync
    trigger_full_sync(app).await
}

// ─── Remote Fetch & Apply ────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteChange {
    pub table_name: String,
    pub record_id: String,
    pub change_type: String, // "new" | "modified" | "deleted"
    pub payload: serde_json::Value,
}

#[tauri::command]
pub async fn fetch_remote_changes(app: AppHandle) -> Result<Vec<RemoteChange>, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    // Verify config exists
    let config = load_sync_config(&pool)
        .await
        .ok_or("No sync configuration found.")?;

    let client = reqwest::Client::new();
    let tables = vec![
        "shop_settings",
        "customers",
        "orders",
        "order_items",
        "expenses",
    ];

    let table_json_fields: std::collections::HashMap<&str, &str> = [
        ("shop_settings", "json_object('id', id, 'shop_name', shop_name, 'phone', phone, 'address', address, 'logo_path', logo_path, 'logo_cloud_url', logo_cloud_url, 'customer_id_prefix', customer_id_prefix, 'order_id_prefix', order_id_prefix, 'created_at', created_at, 'updated_at', updated_at)"),
        ("customers", "json_object('id', id, 'customer_id', customer_id, 'name', name, 'phone', phone, 'address', address, 'city', city, 'social_media_url', social_media_url, 'platform', platform, 'created_at', created_at, 'updated_at', updated_at, 'deleted_at', deleted_at)"),
        ("orders", "json_object('id', id, 'order_id', order_id, 'customer_id', customer_id, 'status', status, 'order_from', order_from, 'exchange_rate', exchange_rate, 'shipping_fee', shipping_fee, 'delivery_fee', delivery_fee, 'cargo_fee', cargo_fee, 'order_date', order_date, 'arrived_date', arrived_date, 'shipment_date', shipment_date, 'user_withdraw_date', user_withdraw_date, 'service_fee', service_fee, 'product_discount', product_discount, 'service_fee_type', service_fee_type, 'shipping_fee_paid', shipping_fee_paid, 'delivery_fee_paid', delivery_fee_paid, 'cargo_fee_paid', cargo_fee_paid, 'service_fee_paid', service_fee_paid, 'shipping_fee_by_shop', shipping_fee_by_shop, 'delivery_fee_by_shop', delivery_fee_by_shop, 'cargo_fee_by_shop', cargo_fee_by_shop, 'exclude_cargo_fee', exclude_cargo_fee, 'created_at', created_at, 'updated_at', updated_at, 'deleted_at', deleted_at)"),
        ("order_items", "json_object('id', id, 'order_id', order_id, 'product_url', product_url, 'product_qty', product_qty, 'price', price, 'product_weight', product_weight, 'created_at', created_at, 'updated_at', updated_at, 'deleted_at', deleted_at)"),
        ("expenses", "json_object('id', id, 'expense_id', expense_id, 'title', title, 'amount', amount, 'category', category, 'payment_method', payment_method, 'notes', notes, 'expense_date', expense_date, 'created_at', created_at, 'updated_at', updated_at, 'deleted_at', deleted_at)"),
    ]
    .into_iter()
    .collect();

    let mut changes = Vec::new();

    for table in tables {
        let url = format!("{}/rest/v1/{}?select=*", config.supabase_url, table);
        let resp = client
            .get(&url)
            .header("apikey", &config.supabase_anon_key)
            .header(
                "Authorization",
                format!("Bearer {}", config.supabase_anon_key),
            )
            .send()
            .await;

        if let Ok(res) = resp {
            if res.status().is_success() {
                if let Ok(rows) = res.json::<Vec<serde_json::Value>>().await {
                    // Keep a single remote row per uuid. If remote contains duplicate
                    // uuid records, prefer the newest updated_at/created_at row.
                    let mut deduped_rows: std::collections::HashMap<String, serde_json::Value> =
                        std::collections::HashMap::new();
                    for row in rows {
                        let key = row
                            .get("uuid")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_lowercase())
                            .or_else(|| row.get("id").and_then(|v| v.as_str()).map(|s| s.to_lowercase()));

                        let Some(uuid_key) = key else {
                            continue;
                        };

                        let should_replace = if let Some(existing) = deduped_rows.get(&uuid_key)
                        {
                            let existing_ts = remote_row_timestamp_millis(existing);
                            let current_ts = remote_row_timestamp_millis(&row);
                            if current_ts > existing_ts {
                                true
                            } else if current_ts < existing_ts {
                                false
                            } else {
                                // If timestamps are equal, prefer non-deleted row over deleted row.
                                let existing_deleted = remote_row_is_deleted(existing);
                                let current_deleted = remote_row_is_deleted(&row);
                                !current_deleted && existing_deleted
                            }
                        } else {
                            true
                        };

                        if should_replace {
                            deduped_rows.insert(uuid_key, row);
                        }
                    }

                    let rows_to_process: Vec<serde_json::Value> = if table == "order_items" {
                        // Additional guard: collapse exact duplicate remote item lines for the same order.
                        let mut deduped_by_signature: std::collections::HashMap<
                            String,
                            serde_json::Value,
                        > = std::collections::HashMap::new();

                        for row in deduped_rows.into_values() {
                            let signature =
                                remote_order_item_signature(&row).unwrap_or_else(|| {
                                    format!(
                                        "raw:{}",
                                        row.get("id")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or_default()
                                    )
                                });

                            let should_replace =
                                if let Some(existing) = deduped_by_signature.get(&signature) {
                                    remote_row_timestamp_millis(&row)
                                        > remote_row_timestamp_millis(existing)
                                } else {
                                    true
                                };

                            if should_replace {
                                deduped_by_signature.insert(signature, row);
                            }
                        }

                        deduped_by_signature.into_values().collect()
                    } else {
                        deduped_rows.into_values().collect()
                    };

                    for row in rows_to_process {
                        // The remote record's uuid is what matches our local id (TEXT UUID PK)
                        let record_id_str = row
                            .get("uuid")
                            .and_then(|v| v.as_str())
                            .map(|v| v.trim().to_string())
                            .filter(|v| !v.is_empty())
                            .or_else(|| {
                                row.get("id")
                                    .and_then(|v| v.as_str())
                                    .map(|v| v.trim().to_string())
                                    .filter(|v| !v.is_empty())
                            });
                        let remote_deleted_at = row
                            .get("deleted_at")
                            .and_then(|v| v.as_str())
                            .map(|v| v.trim().to_string())
                            .filter(|v| !v.is_empty());
                        let is_remote_deleted = remote_deleted_at.is_some();
                        // try to get updated_at, fallback to current or empty string if not available
                        let remote_updated_at =
                            row.get("updated_at").and_then(|v| v.as_str()).unwrap_or("");

                        if let Some(ref record_id_str) = record_id_str {
                            // Check local DB
                            let json_expr = table_json_fields
                                .get(table)
                                .unwrap_or(&"json_object('id', id)");
                            let deleted_at_expr = if supports_deleted_at(table) {
                                "deleted_at".to_string()
                            } else {
                                "NULL as deleted_at".to_string()
                            };
                            let query = format!(
                                "SELECT updated_at, {}, {} as payload FROM {} WHERE id = ? LIMIT 1",
                                deleted_at_expr, json_expr, table
                            );
                            let local_row: Option<(Option<String>, Option<String>, String)> =
                                sqlx::query_as(&query)
                                    .bind(record_id_str.as_str())
                                    .fetch_optional(&*pool)
                                    .await
                                    .unwrap_or(None);

                            match local_row {
                                None => {
                                    // Ignore rows already deleted on remote when local also has no row.
                                    if is_remote_deleted {
                                        continue;
                                    }

                                    // Prevent duplicate order_items when remote has stale item rows that
                                    // match an existing active local item for the same order.
                                    if table == "order_items" {
                                        let remote_order_id =
                                            row.get("order_id").and_then(|v| v.as_str()).map(|s| s.to_string());
                                        let remote_created_at = row
                                            .get("created_at")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("")
                                            .to_string();
                                        let remote_product_url = row
                                            .get("product_url")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("")
                                            .to_string();
                                        let remote_product_qty = row
                                            .get("product_qty")
                                            .and_then(|v| v.as_i64())
                                            .unwrap_or(0);
                                        let remote_price = row
                                            .get("price")
                                            .and_then(|v| v.as_f64())
                                            .unwrap_or(0.0);
                                        let remote_weight = row
                                            .get("product_weight")
                                            .and_then(|v| v.as_f64())
                                            .unwrap_or(0.0);

                                        if let Some(ref order_id) = remote_order_id {
                                            // If local order was updated after this remote row was created,
                                            // this remote item is stale and should not be re-imported.
                                            let local_order_updated_at: Option<String> =
                                                sqlx::query_scalar(
                                                    "SELECT updated_at FROM orders WHERE id = ? AND deleted_at IS NULL LIMIT 1",
                                                )
                                                .bind(order_id.as_str())
                                                .fetch_optional(&*pool)
                                                .await
                                                .unwrap_or(None);

                                            if let Some(local_updated) =
                                                local_order_updated_at.as_deref()
                                            {
                                                let remote_created_ms =
                                                    parse_timestamp_millis(&remote_created_at);
                                                let local_updated_ms =
                                                    parse_timestamp_millis(local_updated);
                                                if let (
                                                    Some(remote_created_ms),
                                                    Some(local_updated_ms),
                                                ) = (remote_created_ms, local_updated_ms)
                                                {
                                                    if remote_created_ms <= local_updated_ms + 1000
                                                    {
                                                        continue;
                                                    }
                                                }
                                            }

                                            let existing_match: Option<(String,)> =
                                                sqlx::query_as(
                                                    "SELECT id FROM order_items
                                                     WHERE deleted_at IS NULL
                                                       AND order_id = ?
                                                       AND COALESCE(product_url, '') = ?
                                                       AND COALESCE(product_qty, 0) = ?
                                                       AND ABS(COALESCE(price, 0) - ?) < 0.000001
                                                       AND ABS(COALESCE(product_weight, 0) - ?) < 0.000001
                                                     LIMIT 1",
                                                )
                                                .bind(order_id.as_str())
                                                .bind(remote_product_url)
                                                .bind(remote_product_qty)
                                                .bind(remote_price)
                                                .bind(remote_weight)
                                                .fetch_optional(&*pool)
                                                .await
                                                .unwrap_or(None);

                                            if let Some((existing_id,)) = existing_match {
                                                if !remote_updated_at.is_empty() {
                                                    let _ = sqlx::query(
                                                        "UPDATE order_items
                                                         SET updated_at = COALESCE(?, updated_at)
                                                         WHERE id = ?",
                                                    )
                                                    .bind(if remote_updated_at.is_empty() {
                                                        None::<String>
                                                    } else {
                                                        Some(remote_updated_at.to_string())
                                                    })
                                                    .bind(&existing_id)
                                                    .execute(&*pool)
                                                    .await;
                                                }
                                                continue;
                                            }
                                        }
                                    }

                                    changes.push(RemoteChange {
                                        table_name: table.to_string(),
                                        record_id: record_id_str.clone(),
                                        change_type: "new".to_string(),
                                        payload: row,
                                    });
                                }
                                Some((local_updated_at, local_deleted_at, local_payload_str)) => {
                                    if is_remote_deleted {
                                        let local_is_deleted = local_deleted_at
                                            .as_deref()
                                            .map(|v| !v.trim().is_empty())
                                            .unwrap_or(false);

                                        if !local_is_deleted {
                                            changes.push(RemoteChange {
                                                table_name: table.to_string(),
                                                record_id: record_id_str.clone(),
                                                change_type: "deleted".to_string(),
                                                payload: row,
                                            });
                                        }
                                        continue;
                                    }

                                    // Exists locally. Compare updated_at.
                                    let mut is_newer = false;

                                    if !remote_updated_at.is_empty() {
                                        if let Ok(r_time) =
                                            chrono::DateTime::parse_from_rfc3339(remote_updated_at)
                                        {
                                            if let Some(l_str) = local_updated_at {
                                                // Local is likely "YYYY-MM-DD HH:MM:SS" SQLite format
                                                if let Ok(l_naive) =
                                                    chrono::NaiveDateTime::parse_from_str(
                                                        &l_str,
                                                        "%Y-%m-%d %H:%M:%S",
                                                    )
                                                {
                                                    let l_time = l_naive.and_utc();
                                                    // Allow 1 second buffer for precision loss
                                                    if r_time.with_timezone(&chrono::Utc)
                                                        > l_time + chrono::Duration::seconds(1)
                                                    {
                                                        is_newer = true;
                                                    }
                                                } else if let Ok(l_time2) =
                                                    chrono::DateTime::parse_from_rfc3339(&l_str)
                                                {
                                                    if r_time
                                                        > l_time2 + chrono::Duration::seconds(1)
                                                    {
                                                        is_newer = true;
                                                    }
                                                }
                                            } else {
                                                // Local has no updated_at -> treat remote as newer
                                                is_newer = true;
                                            }
                                        }
                                    }

                                    if is_newer {
                                        let mut actual_change = true;
                                        if let Ok(local_json) =
                                            serde_json::from_str::<serde_json::Value>(
                                                &local_payload_str,
                                            )
                                        {
                                            if let (Some(local_obj), Some(remote_obj)) =
                                                (local_json.as_object(), row.as_object())
                                            {
                                                let mut same = true;
                                                for (k, v) in remote_obj {
                                                    if k == "updated_at"
                                                        || k == "created_at"
                                                        || k == "deleted_at"
                                                        || k == "synced"
                                                        || k == "synced_from_device_at"
                                                        || k == "id"
                                                        || k == "local_id"
                                                    {
                                                        continue;
                                                    }

                                                    let local_key = if k == "local_id" {
                                                        "id"
                                                    } else {
                                                        k.as_str()
                                                    };
                                                    let local_v = local_obj.get(local_key);

                                                    let is_remote_null = v.is_null();
                                                    let is_local_null =
                                                        local_v.map_or(true, |lv| lv.is_null());

                                                    if is_remote_null && is_local_null {
                                                        continue;
                                                    }

                                                    // For numbers, compare as f64 to avoid float/int mismatches between SQLite and JSON
                                                    if let (Some(rv_n), Some(lv_n)) = (
                                                        v.as_f64(),
                                                        local_v.and_then(|lv| lv.as_f64()),
                                                    ) {
                                                        if (rv_n - lv_n).abs() > f64::EPSILON {
                                                            same = false;
                                                            break;
                                                        } else {
                                                            continue;
                                                        }
                                                    }

                                                    // For bool vs int matching (sqlite uses 0/1 for booleans)
                                                    if let Some(rv_b) = v.as_bool() {
                                                        if let Some(lv_i) =
                                                            local_v.and_then(|lv| lv.as_i64())
                                                        {
                                                            if (rv_b && lv_i != 1)
                                                                || (!rv_b && lv_i != 0)
                                                            {
                                                                same = false;
                                                                break;
                                                            } else {
                                                                continue;
                                                            }
                                                        }
                                                    }

                                                    if Some(v) != local_v {
                                                        same = false;
                                                        break;
                                                    }
                                                }
                                                if same {
                                                    actual_change = false;
                                                }
                                            }
                                        }

                                        if actual_change {
                                            changes.push(RemoteChange {
                                                table_name: table.to_string(),
                                                record_id: record_id_str.clone(),
                                                change_type: "modified".to_string(),
                                                payload: row,
                                            });
                                        } else {
                                            // Silently sync local updated_at to match remote so we skip this check next time
                                            // Convert RFC3339 back to local SQLite format (YYYY-MM-DD HH:MM:SS) roughly
                                            if let Ok(r_time) = chrono::DateTime::parse_from_rfc3339(
                                                remote_updated_at,
                                            ) {
                                                let sqlite_time = r_time
                                                    .with_timezone(&chrono::Utc)
                                                    .format("%Y-%m-%d %H:%M:%S")
                                                    .to_string();
                                                let _ = sqlx::query(&format!(
                                                    "UPDATE {} SET updated_at = ? WHERE id = ?",
                                                    table
                                                ))
                                                .bind(sqlite_time)
                                                .bind(record_id_str.as_str())
                                                .execute(&*pool)
                                                .await;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(changes)
}

#[tauri::command]
pub async fn apply_remote_changes(
    app: AppHandle,
    changes: Vec<RemoteChange>,
) -> Result<String, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    // First, cache the local valid columns for each table we are going to touch
    let mut table_columns: std::collections::HashMap<String, std::collections::HashSet<String>> =
        std::collections::HashMap::new();
    for change in &changes {
        let table = change.table_name.clone();
        if !table_columns.contains_key(&table) {
            let cols: Vec<(String,)> =
                sqlx::query_as(&format!("SELECT name FROM PRAGMA_TABLE_INFO('{}')", table))
                    .fetch_all(&*pool)
                    .await
                    .unwrap_or_default();
            let cols_set: std::collections::HashSet<String> =
                cols.into_iter().map(|(c,)| c).collect();
            table_columns.insert(table, cols_set);
        }
    }

    let mut applied_count = 0;

    for change in changes {
        let table = change.table_name.as_str();
        let payload = change.payload;
        let valid_cols = table_columns.get(table);

        if let Some(obj) = payload.as_object() {
            if change.change_type == "deleted" {
                if table == "order_items" {
                    let res = sqlx::query("DELETE FROM order_items WHERE id = ?")
                        .bind(&change.record_id)
                        .execute(&*pool)
                        .await;

                    if let Ok(result) = res {
                        if result.rows_affected() > 0 {
                            applied_count += 1;
                        }
                    } else {
                        eprintln!(
                            "Failed to apply DELETED change for {}: {:?}",
                            table,
                            res.err()
                        );
                    }
                } else {
                    let supports_soft_delete = valid_cols
                        .map(|cols| cols.contains("deleted_at"))
                        .unwrap_or(false);

                    if supports_soft_delete {
                        let deleted_at = obj
                            .get("deleted_at")
                            .and_then(|v| v.as_str())
                            .map(|v| v.trim().to_string())
                            .filter(|v| !v.is_empty());
                        let updated_at = obj
                            .get("updated_at")
                            .and_then(|v| v.as_str())
                            .map(|v| v.trim().to_string())
                            .filter(|v| !v.is_empty());

                        let query_str = format!(
                            "UPDATE {} SET deleted_at = COALESCE(?, deleted_at, datetime('now')), updated_at = COALESCE(?, updated_at, datetime('now')) WHERE id = ?",
                            table
                        );
                        let res = sqlx::query(&query_str)
                            .bind(deleted_at)
                            .bind(updated_at)
                            .bind(&change.record_id)
                            .execute(&*pool)
                            .await;

                        if let Ok(result) = res {
                            if result.rows_affected() > 0 {
                                applied_count += 1;
                            }
                        } else {
                            eprintln!(
                                "Failed to apply DELETED change for {}: {:?}",
                                table,
                                res.err()
                            );
                        }
                    }
                }
            } else if change.change_type == "new" {
                // We use QueryBuilder since dynamically binding in SQLite requires knowing exact counts up front,
                // but sqlx query string allows building.

                // Create parallel vecs of keys and values
                let mut keys = Vec::new();
                let mut vals = Vec::new();
                for (k, v) in obj {
                    let mapped_key = if k == "local_id" { "id" } else { k.as_str() };
                    if k == "id" {
                        continue;
                    }
                    if let Some(cols) = valid_cols {
                        if !cols.contains(mapped_key) {
                            continue;
                        }
                    }
                    if keys.iter().any(|existing| existing == mapped_key) {
                        continue;
                    }
                    keys.push(mapped_key.to_string());
                    vals.push(v);
                }

                if keys.is_empty() {
                    continue;
                }

                let cols_str = keys.join(", ");
                let placeholders = vec!["?"; keys.len()].join(", ");
                let query_str = format!(
                    "INSERT OR REPLACE INTO {} ({}) VALUES ({})",
                    table, cols_str, placeholders
                );

                let mut q = sqlx::query(&query_str);

                for v in vals {
                    if v.is_null() {
                        // For sqlite, binding Option::<String>::None effectively binds NULL
                        q = q.bind(Option::<String>::None);
                    } else if let Some(s) = v.as_str() {
                        q = q.bind(s.to_string());
                    } else if let Some(i) = v.as_i64() {
                        q = q.bind(i);
                    } else if let Some(n) = v.as_f64() {
                        q = q.bind(n);
                    } else if let Some(b) = v.as_bool() {
                        q = q.bind(b);
                    } else {
                        q = q.bind(v.to_string());
                    }
                }

                let res = q.execute(&*pool).await;
                if res.is_ok() {
                    applied_count += 1;
                } else {
                    eprintln!("Failed to apply NEW change for {}: {:?}", table, res.err());
                }
            } else if change.change_type == "modified" {
                let mut updates = Vec::new();
                let mut vals = Vec::new();
                for (k, v) in obj {
                    let mapped_key = if k == "local_id" { "id" } else { k.as_str() };
                    if mapped_key == "id" {
                        continue;
                    }
                    if let Some(cols) = valid_cols {
                        if !cols.contains(mapped_key) {
                            continue;
                        }
                    }
                    updates.push(format!("{} = ?", mapped_key));
                    vals.push(v);
                }

                if updates.is_empty() {
                    continue;
                }

                let update_str = updates.join(", ");
                let query_str = format!(
                    "UPDATE {} SET {} WHERE id = ?",
                    table, update_str
                );

                let mut q = sqlx::query(&query_str);

                for v in vals {
                    if v.is_null() {
                        q = q.bind(Option::<String>::None);
                    } else if let Some(s) = v.as_str() {
                        q = q.bind(s.to_string());
                    } else if let Some(i) = v.as_i64() {
                        q = q.bind(i);
                    } else if let Some(n) = v.as_f64() {
                        q = q.bind(n);
                    } else if let Some(b) = v.as_bool() {
                        q = q.bind(b);
                    } else {
                        q = q.bind(v.to_string());
                    }
                }

                q = q.bind(&change.record_id);

                let res = q.execute(&*pool).await;
                if res.is_ok() {
                    applied_count += 1;
                } else {
                    eprintln!(
                        "Failed to apply MODIFIED change for {}: {:?}",
                        table,
                        res.err()
                    );
                }
            }
        }
    }

    Ok(format!(
        "Successfully applied {} remote changes locally.",
        applied_count
    ))
}
