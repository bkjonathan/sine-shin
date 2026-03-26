pub mod client;

use serde::{Deserialize, Serialize};
use sea_orm::{ConnectionTrait, DatabaseConnection, FromQueryResult, Statement};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use crate::state::AppState;

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

#[derive(Debug, Serialize, Deserialize, Clone, FromQueryResult)]
pub struct SyncQueueItem {
    pub id: i64,
    pub table_name: String,
    pub operation: String,
    pub record_id: String,
    pub record_uuid: Option<String>,
    pub payload: String,
    pub status: Option<String>,
    pub retry_count: Option<i32>,
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

#[derive(Debug, Serialize, Deserialize, Clone, FromQueryResult)]
pub struct SyncSession {
    pub id: i64,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub total_queued: Option<i32>,
    pub total_synced: Option<i32>,
    pub total_failed: Option<i32>,
    pub status: Option<String>,
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
async fn cleanup_old_sync_data(db: &DatabaseConnection) {
    let backend = db.get_database_backend();
    let _ = db
        .execute(Statement::from_string(
            backend,
            "DELETE FROM sync_sessions WHERE id NOT IN (SELECT id FROM sync_sessions ORDER BY started_at DESC LIMIT 100)".to_string(),
        ))
        .await;

    let _ = db
        .execute(Statement::from_string(
            backend,
            "DELETE FROM sync_queue WHERE status = 'synced' AND id NOT IN (SELECT id FROM sync_queue WHERE status = 'synced' ORDER BY synced_at DESC LIMIT 100)".to_string(),
        ))
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

async fn local_record_is_active(db: &DatabaseConnection, table: &str, record_id: &str) -> bool {
    let backend = db.get_database_backend();

    #[derive(FromQueryResult)]
    struct ExistsRow {
        exists_val: i64,
    }

    let exists = match table {
        "shop_settings" => {
            ExistsRow::find_by_statement(Statement::from_sql_and_values(
                backend,
                "SELECT 1 as exists_val FROM shop_settings WHERE id = $1 LIMIT 1",
                [record_id.into()],
            ))
            .one(db)
            .await
            .ok()
            .flatten()
            .is_some()
        }
        "customers" | "orders" | "order_items" | "expenses" => {
            let query = format!(
                "SELECT 1 as exists_val FROM {} WHERE id = $1 AND deleted_at IS NULL LIMIT 1",
                table
            );
            ExistsRow::find_by_statement(Statement::from_sql_and_values(
                backend,
                &query,
                [record_id.into()],
            ))
            .one(db)
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
        .get("uuid")
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
        .map(|s| s.to_string())
        .unwrap_or_else(|| record_id.to_string());
    obj.insert("local_id".to_string(), serde_json::json!(local_id));
    obj.remove("id");
    obj.remove("synced");
    let normalized_uuid = obj
        .get("uuid")
        .and_then(|v| v.as_str())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());
    if let Some(uuid) = normalized_uuid {
        obj.insert("uuid".to_string(), serde_json::json!(uuid));
    } else {
        obj.remove("uuid");
    }

    obj.insert(
        "synced_from_device_at".to_string(),
        serde_json::json!(chrono::Utc::now().to_rfc3339()),
    );

    Ok(value)
}

async fn mark_local_synced(
    db: &DatabaseConnection,
    table: &str,
    record_id: &str,
    remote_uuid: Option<&str>,
) {
    if !supports_synced_marker(table) {
        return;
    }

    let backend = db.get_database_backend();
    let now = chrono::Utc::now().to_rfc3339();

    let query = if remote_uuid.is_some() {
        format!(
            "UPDATE {} SET synced = 1, uuid = COALESCE($1, uuid), updated_at = $2 WHERE id = $3",
            table
        )
    } else {
        format!(
            "UPDATE {} SET synced = 1, updated_at = $1 WHERE id = $2",
            table
        )
    };

    if let Some(uuid) = remote_uuid {
        let _ = db
            .execute(Statement::from_sql_and_values(
                backend,
                &query,
                [uuid.to_string().into(), now.into(), record_id.into()],
            ))
            .await;
    } else {
        let _ = db
            .execute(Statement::from_sql_and_values(
                backend,
                &query,
                [now.into(), record_id.into()],
            ))
            .await;
    }
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
    db: &DatabaseConnection,
    _app: &AppHandle,
    table: &str,
    op: &str,
    record_id: &str,
    payload: serde_json::Value,
) {
    let db_clone = db.clone();
    let table_name = table.to_string();
    let operation = op.to_string();
    let record_uuid = extract_record_uuid(&payload);
    let payload_str = payload.to_string();
    let record_id_str = record_id.to_string();

    tauri::async_runtime::spawn(async move {
        let config = match load_sync_config(&db_clone).await {
            Some(c) if c.sync_enabled => c,
            _ => return,
        };

        let backend = db_clone.get_database_backend();
        let now = chrono::Utc::now().to_rfc3339();

        match operation.as_str() {
            "INSERT" | "UPDATE" => {
                let _ = db_clone
                    .execute(Statement::from_sql_and_values(
                        backend,
                        "DELETE FROM sync_queue WHERE table_name = $1 AND record_id = $2 AND operation IN ('INSERT', 'UPDATE') AND status IN ('pending', 'failed')",
                        [table_name.clone().into(), record_id_str.clone().into()],
                    ))
                    .await;
            }
            "DELETE" => {
                let _ = db_clone
                    .execute(Statement::from_sql_and_values(
                        backend,
                        "DELETE FROM sync_queue WHERE table_name = $1 AND record_id = $2 AND status IN ('pending', 'failed')",
                        [table_name.clone().into(), record_id_str.clone().into()],
                    ))
                    .await;
            }
            _ => {}
        }

        match push_sync_item(
            &config,
            &table_name,
            &operation,
            &record_id_str,
            record_uuid.as_deref(),
            &payload_str,
        )
        .await
        {
            Ok(result) => {
                mark_local_synced(
                    &db_clone,
                    &table_name,
                    &record_id_str,
                    result.remote_uuid.as_deref(),
                )
                .await;
            }
            Err(sync_error) => {
                let _ = db_clone
                    .execute(Statement::from_sql_and_values(
                        backend,
                        "INSERT INTO sync_queue (table_name, operation, record_id, record_uuid, payload, status, error_message, created_at) VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)",
                        [
                            table_name.into(),
                            operation.into(),
                            record_id_str.into(),
                            record_uuid.into(),
                            payload_str.into(),
                            sync_error.into(),
                            now.into(),
                        ],
                    ))
                    .await;
            }
        }
    });
}

/// Load sync config from DB
async fn load_sync_config(db: &DatabaseConnection) -> Option<SyncConfig> {
    let backend = db.get_database_backend();

    #[derive(FromQueryResult)]
    struct ConfigRow {
        id: i64,
        supabase_url: String,
        supabase_anon_key: String,
        supabase_service_key: String,
        sync_enabled: i64,
        sync_interval: i64,
    }

    let row = ConfigRow::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT id, supabase_url, supabase_anon_key, supabase_service_key, sync_enabled, COALESCE(sync_interval, 30) as sync_interval FROM sync_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1",
        [],
    ))
    .one(db)
    .await
    .ok()?;

    row.map(|r| SyncConfig {
        id: Some(r.id),
        supabase_url: r.supabase_url,
        supabase_anon_key: r.supabase_anon_key,
        supabase_service_key: r.supabase_service_key,
        sync_enabled: r.sync_enabled == 1,
        sync_interval: r.sync_interval as i32,
    })
}

/// Process all pending/failed sync queue items
pub async fn process_sync_queue(app: &AppHandle) {
    let state = app.state::<Arc<AppState>>();
    let db = &state.db;
    let backend = db.get_database_backend();

    let config = match load_sync_config(db).await {
        Some(c) if c.sync_enabled => c,
        _ => return,
    };

    let items = SyncQueueItem::find_by_statement(Statement::from_string(
        backend,
        "SELECT * FROM sync_queue WHERE status = 'pending' OR (status = 'failed' AND retry_count < 5) ORDER BY created_at ASC".to_string(),
    ))
    .all(db.as_ref())
    .await
    .unwrap_or_default();

    if items.is_empty() {
        return;
    }

    let _ = app.emit("sync://started", ());

    let now_str = chrono::Utc::now().to_rfc3339();

    // Create session
    #[derive(FromQueryResult)]
    struct IdRow {
        id: i64,
    }

    let session_id = IdRow::find_by_statement(Statement::from_sql_and_values(
        backend,
        "INSERT INTO sync_sessions (status, started_at) VALUES ('running', $1) RETURNING id",
        [now_str.clone().into()],
    ))
    .one(db.as_ref())
    .await
    .ok()
    .flatten()
    .map(|r| r.id)
    .unwrap_or(0);

    let total_queued = items.len() as i64;
    let _ = db
        .execute(Statement::from_sql_and_values(
            backend,
            "UPDATE sync_sessions SET total_queued = $1 WHERE id = $2",
            [total_queued.into(), session_id.into()],
        ))
        .await;

    let mut total_synced: i64 = 0;
    let mut total_failed: i64 = 0;

    for item in &items {
        if item.operation != "DELETE"
            && !local_record_is_active(db, &item.table_name, &item.record_id).await
        {
            let skip_now = chrono::Utc::now().to_rfc3339();
            let _ = db
                .execute(Statement::from_sql_and_values(
                    backend,
                    "UPDATE sync_queue SET status = 'synced', synced_at = $1, error_message = COALESCE(error_message, 'Skipped stale queue item: local record missing') WHERE id = $2",
                    [skip_now.into(), item.id.into()],
                ))
                .await;
            continue;
        }

        let _ = db
            .execute(Statement::from_sql_and_values(
                backend,
                "UPDATE sync_queue SET status = 'syncing' WHERE id = $1",
                [item.id.into()],
            ))
            .await;

        let status_val = item.status.as_deref().unwrap_or("pending");
        match push_sync_item(
            &config,
            &item.table_name,
            &item.operation,
            &item.record_id,
            item.record_uuid.as_deref(),
            &item.payload,
        )
        .await
        {
            Ok(result) => {
                let synced_now = chrono::Utc::now().to_rfc3339();
                let _ = db
                    .execute(Statement::from_sql_and_values(
                        backend,
                        "UPDATE sync_queue SET status = 'synced', synced_at = $1 WHERE id = $2",
                        [synced_now.into(), item.id.into()],
                    ))
                    .await;
                mark_local_synced(
                    db,
                    &item.table_name,
                    &item.record_id,
                    result.remote_uuid.as_deref(),
                )
                .await;
                total_synced += 1;
            }
            Err(error_text) => {
                let _ = db
                    .execute(Statement::from_sql_and_values(
                        backend,
                        "UPDATE sync_queue SET status = 'failed', retry_count = retry_count + 1, error_message = $1 WHERE id = $2",
                        [error_text.into(), item.id.into()],
                    ))
                    .await;
                total_failed += 1;
            }
        }
    }

    let session_status = if total_failed > 0 && total_synced == 0 {
        "failed"
    } else {
        "completed"
    };

    let finished_now = chrono::Utc::now().to_rfc3339();
    let _ = db
        .execute(Statement::from_sql_and_values(
            backend,
            "UPDATE sync_sessions SET finished_at = $1, total_synced = $2, total_failed = $3, status = $4 WHERE id = $5",
            [
                finished_now.into(),
                total_synced.into(),
                total_failed.into(),
                session_status.into(),
                session_id.into(),
            ],
        ))
        .await;

    cleanup_old_sync_data(db).await;

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
        let mut last_sync: Option<tokio::time::Instant> = None;

        loop {
            tokio::time::sleep(Duration::from_secs(5)).await;

            let state = app.state::<Arc<AppState>>();
            let db = &state.db;

            if let Some(config) = load_sync_config(db).await {
                if config.sync_enabled {
                    let interval_secs = config.sync_interval as u64;

                    let should_sync = match last_sync {
                        Some(last) => last.elapsed() >= Duration::from_secs(interval_secs),
                        None => true,
                    };

                    if should_sync {
                        drop(state);
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
    let state = app.state::<Arc<AppState>>();
    let db = &state.db;
    let backend = db.get_database_backend();

    #[derive(FromQueryResult)]
    struct IntervalRow {
        sync_interval: i32,
    }

    let current_interval = IntervalRow::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT COALESCE(sync_interval, 30) as sync_interval FROM sync_config WHERE is_active = 1 LIMIT 1",
        [],
    ))
    .one(db.as_ref())
    .await
    .map_err(|e| e.to_string())?
    .map(|r| r.sync_interval)
    .unwrap_or(30);

    db.execute(Statement::from_sql_and_values(
        backend,
        "UPDATE sync_config SET is_active = 0",
        [],
    ))
    .await
    .map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().to_rfc3339();
    db.execute(Statement::from_sql_and_values(
        backend,
        "INSERT INTO sync_config (supabase_url, supabase_anon_key, supabase_service_key, is_active, sync_enabled, sync_interval, created_at) VALUES ($1, $2, $3, 1, 1, $4, $5)",
        [url.into(), anon_key.into(), service_key.into(), current_interval.into(), now.into()],
    ))
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_sync_config(app: AppHandle) -> Result<Option<SyncConfig>, String> {
    let state = app.state::<Arc<AppState>>();
    let config = load_sync_config(&state.db).await;
    Ok(config)
}

#[tauri::command]
pub async fn update_sync_interval(app: AppHandle, interval: i32) -> Result<(), String> {
    let state = app.state::<Arc<AppState>>();
    let db = &state.db;
    let backend = db.get_database_backend();

    db.execute(Statement::from_sql_and_values(
        backend,
        "UPDATE sync_config SET sync_interval = $1 WHERE is_active = 1",
        [interval.into()],
    ))
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn test_sync_connection(app: AppHandle) -> Result<TestConnectionResult, String> {
    let state = app.state::<Arc<AppState>>();
    let config = load_sync_config(&state.db)
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
    let state = app.state::<Arc<AppState>>();
    let db = &state.db;
    let backend = db.get_database_backend();

    #[derive(FromQueryResult)]
    struct CountRow {
        count: i64,
    }

    let pending = CountRow::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending'",
        [],
    ))
    .one(db.as_ref())
    .await
    .map_err(|e| e.to_string())?
    .map(|r| r.count)
    .unwrap_or(0);

    let syncing = CountRow::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT COUNT(*) as count FROM sync_queue WHERE status = 'syncing'",
        [],
    ))
    .one(db.as_ref())
    .await
    .map_err(|e| e.to_string())?
    .map(|r| r.count)
    .unwrap_or(0);

    let synced = CountRow::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT COUNT(*) as count FROM sync_queue WHERE status = 'synced'",
        [],
    ))
    .one(db.as_ref())
    .await
    .map_err(|e| e.to_string())?
    .map(|r| r.count)
    .unwrap_or(0);

    let failed = CountRow::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT COUNT(*) as count FROM sync_queue WHERE status = 'failed'",
        [],
    ))
    .one(db.as_ref())
    .await
    .map_err(|e| e.to_string())?
    .map(|r| r.count)
    .unwrap_or(0);

    Ok(SyncStats {
        pending,
        syncing,
        synced,
        failed,
    })
}

#[tauri::command]
pub async fn get_sync_sessions(app: AppHandle, limit: i64) -> Result<Vec<SyncSession>, String> {
    let state = app.state::<Arc<AppState>>();
    let db = &state.db;
    let backend = db.get_database_backend();

    let sessions = SyncSession::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT id, started_at, finished_at, total_queued, total_synced, total_failed, status FROM sync_sessions ORDER BY started_at DESC LIMIT $1",
        [limit.into()],
    ))
    .all(db.as_ref())
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
    let state = app.state::<Arc<AppState>>();
    let db = &state.db;
    let backend = db.get_database_backend();

    let items = if let Some(s) = status {
        SyncQueueItem::find_by_statement(Statement::from_sql_and_values(
            backend,
            "SELECT id, table_name, operation, record_id, record_uuid, payload, status, retry_count, error_message, created_at, synced_at FROM sync_queue WHERE status = $1 ORDER BY created_at DESC LIMIT $2",
            [s.into(), limit.into()],
        ))
        .all(db.as_ref())
        .await
        .map_err(|e| e.to_string())?
    } else {
        SyncQueueItem::find_by_statement(Statement::from_sql_and_values(
            backend,
            "SELECT id, table_name, operation, record_id, record_uuid, payload, status, retry_count, error_message, created_at, synced_at FROM sync_queue ORDER BY created_at DESC LIMIT $1",
            [limit.into()],
        ))
        .all(db.as_ref())
        .await
        .map_err(|e| e.to_string())?
    };

    Ok(items)
}

#[tauri::command]
pub async fn retry_failed_items(app: AppHandle) -> Result<i64, String> {
    let state = app.state::<Arc<AppState>>();
    let db = &state.db;
    let backend = db.get_database_backend();

    let result = db
        .execute(Statement::from_sql_and_values(
            backend,
            "UPDATE sync_queue SET status = 'pending', retry_count = 0, error_message = NULL WHERE status = 'failed'",
            [],
        ))
        .await
        .map_err(|e| e.to_string())?;

    Ok(result.rows_affected() as i64)
}

#[tauri::command]
pub async fn clear_synced_items(app: AppHandle, older_than_days: i64) -> Result<i64, String> {
    let state = app.state::<Arc<AppState>>();
    let db = &state.db;
    let backend = db.get_database_backend();

    let cutoff = chrono::Utc::now()
        .checked_sub_signed(chrono::Duration::days(older_than_days))
        .map(|d| d.to_rfc3339())
        .unwrap_or_default();

    let result = db
        .execute(Statement::from_sql_and_values(
            backend,
            "DELETE FROM sync_queue WHERE status = 'synced' AND synced_at < $1",
            [cutoff.into()],
        ))
        .await
        .map_err(|e| e.to_string())?;

    Ok(result.rows_affected() as i64)
}

#[tauri::command]
pub async fn clean_sync_data(app: AppHandle) -> Result<i64, String> {
    let state = app.state::<Arc<AppState>>();
    let db = &state.db;
    let backend = db.get_database_backend();

    let sessions_deleted = db
        .execute(Statement::from_sql_and_values(
            backend,
            "DELETE FROM sync_sessions WHERE status IN ('completed', 'failed')",
            [],
        ))
        .await
        .map_err(|e| e.to_string())?
        .rows_affected();

    let queue_deleted = db
        .execute(Statement::from_sql_and_values(
            backend,
            "DELETE FROM sync_queue WHERE status = 'synced'",
            [],
        ))
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

    let state = app.state::<Arc<AppState>>();
    let db = &state.db;
    let backend = db.get_database_backend();

    #[derive(FromQueryResult)]
    struct UserRow {
        id: String,
        password_hash: String,
    }

    let user = UserRow::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT id, password_hash FROM users WHERE role = 'owner' LIMIT 1",
        [],
    ))
    .one(db.as_ref())
    .await
    .map_err(|e| e.to_string())?
    .ok_or("No owner account found")?;

    let valid = bcrypt::verify(&current_password, &user.password_hash).map_err(|e| e.to_string())?;
    if !valid {
        return Err("Invalid current password".to_string());
    }

    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let master_hash = argon2
        .hash_password(new_master.as_bytes(), &salt)
        .map_err(|e| format!("Failed to hash master password: {}", e))?
        .to_string();

    db.execute(Statement::from_sql_and_values(
        backend,
        "UPDATE users SET master_password_hash = $1 WHERE id = $2",
        [master_hash.into(), user.id.into()],
    ))
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn verify_master_password(app: AppHandle, input: String) -> Result<bool, String> {
    use argon2::{Argon2, PasswordHash, PasswordVerifier};

    let state = app.state::<Arc<AppState>>();
    let db = &state.db;
    let backend = db.get_database_backend();

    #[derive(FromQueryResult)]
    struct HashRow {
        master_password_hash: Option<String>,
    }

    let row = HashRow::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT master_password_hash FROM users WHERE role = 'owner' AND master_password_hash IS NOT NULL LIMIT 1",
        [],
    ))
    .one(db.as_ref())
    .await
    .map_err(|e| e.to_string())?;

    match row.and_then(|r| r.master_password_hash) {
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

    let state = app.state::<Arc<AppState>>();
    let db = &state.db;
    let backend = db.get_database_backend();

    #[derive(FromQueryResult)]
    struct HashRow {
        master_password_hash: Option<String>,
    }

    let row = HashRow::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT master_password_hash FROM users WHERE role = 'owner' AND master_password_hash IS NOT NULL LIMIT 1",
        [],
    ))
    .one(db.as_ref())
    .await
    .map_err(|e| e.to_string())?;

    let h = row
        .and_then(|r| r.master_password_hash)
        .ok_or("No master password set. Please set one first.")?;
    let parsed = PasswordHash::new(&h).map_err(|e| format!("Invalid hash: {}", e))?;
    if Argon2::default()
        .verify_password(master_password.as_bytes(), &parsed)
        .is_err()
    {
        return Err("Invalid master password".to_string());
    }

    #[derive(FromQueryResult)]
    struct IntervalRow {
        sync_interval: i32,
    }

    let current_interval = IntervalRow::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT COALESCE(sync_interval, 30) as sync_interval FROM sync_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1",
        [],
    ))
    .one(db.as_ref())
    .await
    .map_err(|e| e.to_string())?
    .map(|r| r.sync_interval)
    .unwrap_or(30);

    db.execute(Statement::from_sql_and_values(
        backend,
        "UPDATE sync_config SET is_active = 0",
        [],
    ))
    .await
    .map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().to_rfc3339();
    db.execute(Statement::from_sql_and_values(
        backend,
        "INSERT INTO sync_config (supabase_url, supabase_anon_key, supabase_service_key, is_active, sync_enabled, sync_interval, created_at) VALUES ($1, $2, $3, 1, 1, $4, $5)",
        [new_supabase_url.into(), new_anon_key.into(), new_service_key.into(), current_interval.into(), now.into()],
    ))
    .await
    .map_err(|e| e.to_string())?;

    drop(state);
    trigger_full_sync(app).await
}

#[tauri::command]
pub async fn trigger_full_sync(app: AppHandle) -> Result<String, String> {
    let state = app.state::<Arc<AppState>>();
    let db = &state.db;
    let backend = db.get_database_backend();

    let _config = load_sync_config(db)
        .await
        .ok_or("No sync configuration found. Please save your Supabase config first.")?;

    db.execute(Statement::from_sql_and_values(
        backend,
        "DELETE FROM sync_queue WHERE status IN ('pending', 'failed')",
        [],
    ))
    .await
    .map_err(|e| e.to_string())?;

    let tables: Vec<(&str, &str)> = vec![
        ("shop_settings", "json_object('id', id, 'shop_name', shop_name, 'phone', phone, 'address', address, 'logo_path', logo_path, 'logo_cloud_url', logo_cloud_url, 'customer_id_prefix', customer_id_prefix, 'order_id_prefix', order_id_prefix, 'created_at', created_at, 'updated_at', updated_at)"),
        ("customers", "json_object('id', id, 'customer_id', customer_id, 'name', name, 'phone', phone, 'address', address, 'city', city, 'social_media_url', social_media_url, 'platform', platform, 'created_at', created_at, 'updated_at', updated_at, 'deleted_at', deleted_at)"),
        ("orders", "json_object('id', id, 'order_id', order_id, 'customer_id', customer_id, 'status', status, 'order_from', order_from, 'exchange_rate', exchange_rate, 'shipping_fee', shipping_fee, 'delivery_fee', delivery_fee, 'cargo_fee', cargo_fee, 'order_date', order_date, 'arrived_date', arrived_date, 'shipment_date', shipment_date, 'user_withdraw_date', user_withdraw_date, 'service_fee', service_fee, 'product_discount', product_discount, 'service_fee_type', service_fee_type, 'shipping_fee_paid', shipping_fee_paid, 'delivery_fee_paid', delivery_fee_paid, 'cargo_fee_paid', cargo_fee_paid, 'service_fee_paid', service_fee_paid, 'shipping_fee_by_shop', shipping_fee_by_shop, 'delivery_fee_by_shop', delivery_fee_by_shop, 'cargo_fee_by_shop', cargo_fee_by_shop, 'exclude_cargo_fee', exclude_cargo_fee, 'created_at', created_at, 'updated_at', updated_at, 'deleted_at', deleted_at)"),
        ("order_items", "json_object('id', id, 'order_id', order_id, 'product_url', product_url, 'product_qty', product_qty, 'price', price, 'product_weight', product_weight, 'created_at', created_at, 'updated_at', updated_at, 'deleted_at', deleted_at)"),
        ("expenses", "json_object('id', id, 'expense_id', expense_id, 'title', title, 'amount', amount, 'category', category, 'payment_method', payment_method, 'notes', notes, 'expense_date', expense_date, 'created_at', created_at, 'updated_at', updated_at, 'deleted_at', deleted_at)"),
    ];

    let mut total: i64 = 0;
    let now = chrono::Utc::now().to_rfc3339();

    for (table, json_expr) in &tables {
        #[derive(FromQueryResult)]
        struct RowData {
            id: String,
            payload: String,
        }

        let query = format!("SELECT id, {} as payload FROM {}", json_expr, table);
        let rows = RowData::find_by_statement(Statement::from_string(backend, query))
            .all(db.as_ref())
            .await
            .unwrap_or_default();

        for row in &rows {
            let _ = db
                .execute(Statement::from_sql_and_values(
                    backend,
                    "INSERT INTO sync_queue (table_name, operation, record_id, record_uuid, payload, status, created_at) VALUES ($1, 'INSERT', $2, NULL, $3, 'pending', $4)",
                    [
                        table.to_string().into(),
                        row.id.clone().into(),
                        row.payload.clone().into(),
                        now.clone().into(),
                    ],
                ))
                .await;
        }

        total += rows.len() as i64;
    }

    for table in &["customers", "orders", "order_items", "expenses", "shop_settings"] {
        let _ = db
            .execute(Statement::from_string(
                backend,
                format!("UPDATE {} SET synced = 0", table),
            ))
            .await;
    }

    drop(state);
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
    let state = app.state::<Arc<AppState>>();
    let db = &state.db;

    let config = load_sync_config(db)
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

    drop(state);
    trigger_full_sync(app).await
}

// ─── Remote Fetch & Apply ────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteChange {
    pub table_name: String,
    pub record_id: String,
    pub record_uuid: Option<String>,
    pub change_type: String, // "new" | "modified" | "deleted"
    pub payload: serde_json::Value,
}

#[tauri::command]
pub async fn fetch_remote_changes(app: AppHandle) -> Result<Vec<RemoteChange>, String> {
    let state = app.state::<Arc<AppState>>();
    let db = &state.db;
    let backend = db.get_database_backend();

    let config = load_sync_config(db)
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
                    let mut deduped_rows: std::collections::HashMap<String, serde_json::Value> =
                        std::collections::HashMap::new();
                    for row in rows {
                        let key = row
                            .get("local_id")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string())
                            .or_else(|| {
                                row.get("id")
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string())
                            });

                        let Some(local_id_key) = key else {
                            continue;
                        };

                        let should_replace = if let Some(existing) = deduped_rows.get(&local_id_key)
                        {
                            let existing_ts = remote_row_timestamp_millis(existing);
                            let current_ts = remote_row_timestamp_millis(&row);
                            if current_ts > existing_ts {
                                true
                            } else if current_ts < existing_ts {
                                false
                            } else {
                                let existing_deleted = remote_row_is_deleted(existing);
                                let current_deleted = remote_row_is_deleted(&row);
                                !current_deleted && existing_deleted
                            }
                        } else {
                            true
                        };

                        if should_replace {
                            deduped_rows.insert(local_id_key, row);
                        }
                    }

                    let rows_to_process: Vec<serde_json::Value> = if table == "order_items" {
                        let mut deduped_by_signature: std::collections::HashMap<
                            String,
                            serde_json::Value,
                        > = std::collections::HashMap::new();

                        for row in deduped_rows.into_values() {
                            let signature =
                                remote_order_item_signature(&row).unwrap_or_else(|| {
                                    format!(
                                        "raw:{}",
                                        row.get("uuid")
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
                        let local_id = row
                            .get("local_id")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string())
                            .or_else(|| {
                                row.get("id")
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string())
                            });
                        let remote_uuid = row
                            .get("uuid")
                            .and_then(|v| v.as_str())
                            .map(|v| v.trim().to_string())
                            .filter(|v| !v.is_empty());
                        let remote_deleted_at = row
                            .get("deleted_at")
                            .and_then(|v| v.as_str())
                            .map(|v| v.trim().to_string())
                            .filter(|v| !v.is_empty());
                        let is_remote_deleted = remote_deleted_at.is_some();
                        let remote_updated_at =
                            row.get("updated_at").and_then(|v| v.as_str()).unwrap_or("");

                        if let Some(local_id) = local_id {
                            let json_expr = table_json_fields
                                .get(table)
                                .unwrap_or(&"json_object('id', id)");
                            let deleted_at_expr = if supports_deleted_at(table) {
                                "deleted_at".to_string()
                            } else {
                                "NULL as deleted_at".to_string()
                            };
                            let query = format!(
                                "SELECT updated_at, {}, {} as payload FROM {} WHERE (uuid = $1 OR id = $2) LIMIT 1",
                                deleted_at_expr, json_expr, table
                            );

                            #[derive(FromQueryResult)]
                            struct LocalRow {
                                updated_at: Option<String>,
                                deleted_at: Option<String>,
                                payload: String,
                            }

                            let local_row = LocalRow::find_by_statement(
                                Statement::from_sql_and_values(
                                    backend,
                                    &query,
                                    [
                                        remote_uuid.clone().unwrap_or_default().into(),
                                        local_id.clone().into(),
                                    ],
                                ),
                            )
                            .one(db.as_ref())
                            .await
                            .unwrap_or(None);

                            match local_row {
                                None => {
                                    if is_remote_deleted {
                                        continue;
                                    }

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

                                        if let Some(order_id) = remote_order_id {
                                            #[derive(FromQueryResult)]
                                            struct UpdatedAtRow {
                                                updated_at: Option<String>,
                                            }

                                            let local_order_updated_at = UpdatedAtRow::find_by_statement(
                                                Statement::from_sql_and_values(
                                                    backend,
                                                    "SELECT updated_at FROM orders WHERE id = $1 AND deleted_at IS NULL LIMIT 1",
                                                    [order_id.clone().into()],
                                                ),
                                            )
                                            .one(db.as_ref())
                                            .await
                                            .unwrap_or(None)
                                            .and_then(|r| r.updated_at);

                                            if let Some(local_updated) = local_order_updated_at.as_deref() {
                                                let remote_created_ms =
                                                    parse_timestamp_millis(&remote_created_at);
                                                let local_updated_ms =
                                                    parse_timestamp_millis(local_updated);
                                                if let (Some(remote_created_ms), Some(local_updated_ms)) =
                                                    (remote_created_ms, local_updated_ms)
                                                {
                                                    if remote_created_ms <= local_updated_ms + 1000 {
                                                        continue;
                                                    }
                                                }
                                            }

                                            #[derive(FromQueryResult)]
                                            struct ExistingItem {
                                                id: String,
                                                uuid: Option<String>,
                                            }

                                            let existing_match = ExistingItem::find_by_statement(
                                                Statement::from_sql_and_values(
                                                    backend,
                                                    "SELECT id, uuid FROM order_items WHERE deleted_at IS NULL AND order_id = $1 AND COALESCE(product_url, '') = $2 AND COALESCE(product_qty, 0) = $3 AND ABS(COALESCE(price, 0) - $4) < 0.000001 AND ABS(COALESCE(product_weight, 0) - $5) < 0.000001 LIMIT 1",
                                                    [
                                                        order_id.into(),
                                                        remote_product_url.into(),
                                                        remote_product_qty.into(),
                                                        remote_price.into(),
                                                        remote_weight.into(),
                                                    ],
                                                ),
                                            )
                                            .one(db.as_ref())
                                            .await
                                            .unwrap_or(None);

                                            if let Some(existing) = existing_match {
                                                if existing.uuid.is_none()
                                                    || !remote_updated_at.is_empty()
                                                {
                                                    let _ = db
                                                        .execute(Statement::from_sql_and_values(
                                                            backend,
                                                            "UPDATE order_items SET uuid = COALESCE(uuid, $1), updated_at = COALESCE($2, updated_at) WHERE id = $3",
                                                            [
                                                                remote_uuid.clone().into(),
                                                                if remote_updated_at.is_empty() {
                                                                    sea_orm::Value::String(None)
                                                                } else {
                                                                    remote_updated_at.to_string().into()
                                                                },
                                                                existing.id.into(),
                                                            ],
                                                        ))
                                                        .await;
                                                }
                                                continue;
                                            }
                                        }
                                    }

                                    changes.push(RemoteChange {
                                        table_name: table.to_string(),
                                        record_id: local_id.clone(),
                                        record_uuid: remote_uuid.clone(),
                                        change_type: "new".to_string(),
                                        payload: row,
                                    });
                                }
                                Some(local_row_data) => {
                                    if is_remote_deleted {
                                        let local_is_deleted = local_row_data
                                            .deleted_at
                                            .as_deref()
                                            .map(|v| !v.trim().is_empty())
                                            .unwrap_or(false);

                                        if !local_is_deleted {
                                            changes.push(RemoteChange {
                                                table_name: table.to_string(),
                                                record_id: local_id.clone(),
                                                record_uuid: remote_uuid.clone(),
                                                change_type: "deleted".to_string(),
                                                payload: row,
                                            });
                                        }
                                        continue;
                                    }

                                    let mut is_newer = false;

                                    if !remote_updated_at.is_empty() {
                                        if let Ok(r_time) =
                                            chrono::DateTime::parse_from_rfc3339(remote_updated_at)
                                        {
                                            if let Some(l_str) = local_row_data.updated_at {
                                                if let Ok(l_naive) =
                                                    chrono::NaiveDateTime::parse_from_str(
                                                        &l_str,
                                                        "%Y-%m-%d %H:%M:%S",
                                                    )
                                                {
                                                    let l_time = l_naive.and_utc();
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
                                                is_newer = true;
                                            }
                                        }
                                    }

                                    if is_newer {
                                        let mut actual_change = true;
                                        if let Ok(local_json) =
                                            serde_json::from_str::<serde_json::Value>(
                                                &local_row_data.payload,
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
                                                record_id: local_id.clone(),
                                                record_uuid: remote_uuid.clone(),
                                                change_type: "modified".to_string(),
                                                payload: row,
                                            });
                                        } else {
                                            if let Ok(r_time) =
                                                chrono::DateTime::parse_from_rfc3339(remote_updated_at)
                                            {
                                                let sqlite_time = r_time
                                                    .with_timezone(&chrono::Utc)
                                                    .format("%Y-%m-%d %H:%M:%S")
                                                    .to_string();
                                                let _ = db
                                                    .execute(Statement::from_sql_and_values(
                                                        backend,
                                                        &format!(
                                                            "UPDATE {} SET updated_at = $1 WHERE (uuid = $2 OR id = $3)",
                                                            table
                                                        ),
                                                        [
                                                            sqlite_time.into(),
                                                            remote_uuid.clone().unwrap_or_default().into(),
                                                            local_id.clone().into(),
                                                        ],
                                                    ))
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
    let state = app.state::<Arc<AppState>>();
    let db = &state.db;
    let backend = db.get_database_backend();

    // First, cache the local valid columns for each table we are going to touch
    let mut table_columns: std::collections::HashMap<String, std::collections::HashSet<String>> =
        std::collections::HashMap::new();
    for change in &changes {
        let table = change.table_name.clone();
        if !table_columns.contains_key(&table) {
            #[derive(FromQueryResult)]
            struct ColRow {
                name: String,
            }

            let cols = if backend == sea_orm::DatabaseBackend::Sqlite {
                ColRow::find_by_statement(Statement::from_string(
                    backend,
                    format!("SELECT name FROM PRAGMA_TABLE_INFO('{}')", table),
                ))
                .all(db.as_ref())
                .await
                .unwrap_or_default()
                .into_iter()
                .map(|r| r.name)
                .collect::<std::collections::HashSet<_>>()
            } else {
                ColRow::find_by_statement(Statement::from_sql_and_values(
                    backend,
                    "SELECT column_name as name FROM information_schema.columns WHERE table_name = $1",
                    [table.clone().into()],
                ))
                .all(db.as_ref())
                .await
                .unwrap_or_default()
                .into_iter()
                .map(|r| r.name)
                .collect::<std::collections::HashSet<_>>()
            };

            table_columns.insert(table, cols);
        }
    }

    let mut applied_count = 0;
    let now = chrono::Utc::now().to_rfc3339();

    for change in changes {
        let table = change.table_name.as_str();
        let payload = change.payload;
        let valid_cols = table_columns.get(table);

        if let Some(obj) = payload.as_object() {
            if change.change_type == "deleted" {
                if table == "order_items" {
                    let res = db
                        .execute(Statement::from_sql_and_values(
                            backend,
                            "DELETE FROM order_items WHERE (uuid = $1 OR id = $2)",
                            [
                                change.record_uuid.clone().unwrap_or_default().into(),
                                change.record_id.clone().into(),
                            ],
                        ))
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
                            .filter(|v| !v.is_empty())
                            .unwrap_or_else(|| now.clone());
                        let updated_at = obj
                            .get("updated_at")
                            .and_then(|v| v.as_str())
                            .map(|v| v.trim().to_string())
                            .filter(|v| !v.is_empty())
                            .unwrap_or_else(|| now.clone());

                        let query_str = format!(
                            "UPDATE {} SET deleted_at = $1, updated_at = $2 WHERE (uuid = $3 OR id = $4)",
                            table
                        );
                        let res = db
                            .execute(Statement::from_sql_and_values(
                                backend,
                                &query_str,
                                [
                                    deleted_at.into(),
                                    updated_at.into(),
                                    change.record_uuid.clone().unwrap_or_default().into(),
                                    change.record_id.clone().into(),
                                ],
                            ))
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
                let mut keys = Vec::new();
                let mut vals: Vec<sea_orm::Value> = Vec::new();
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
                    if keys.iter().any(|existing: &String| existing == mapped_key) {
                        continue;
                    }
                    keys.push(mapped_key.to_string());
                    vals.push(json_to_sea_value(v));
                }

                if keys.is_empty() {
                    continue;
                }

                let cols_str = keys.join(", ");
                let placeholders = (1..=keys.len())
                    .map(|i| format!("${}", i))
                    .collect::<Vec<_>>()
                    .join(", ");
                let query_str = format!(
                    "INSERT OR REPLACE INTO {} ({}) VALUES ({})",
                    table, cols_str, placeholders
                );

                let res = db
                    .execute(Statement::from_sql_and_values(backend, &query_str, vals))
                    .await;
                if res.is_ok() {
                    applied_count += 1;
                } else {
                    eprintln!("Failed to apply NEW change for {}: {:?}", table, res.err());
                }
            } else if change.change_type == "modified" {
                let mut updates = Vec::new();
                let mut vals: Vec<sea_orm::Value> = Vec::new();
                let mut idx = 1usize;
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
                    updates.push(format!("{} = ${}", mapped_key, idx));
                    vals.push(json_to_sea_value(v));
                    idx += 1;
                }

                if updates.is_empty() {
                    continue;
                }

                let update_str = updates.join(", ");
                let query_str = format!(
                    "UPDATE {} SET {} WHERE (uuid = ${} OR id = ${})",
                    table,
                    update_str,
                    idx,
                    idx + 1
                );

                vals.push(change.record_uuid.clone().unwrap_or_default().into());
                vals.push(change.record_id.clone().into());

                let res = db
                    .execute(Statement::from_sql_and_values(backend, &query_str, vals))
                    .await;
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

fn json_to_sea_value(v: &serde_json::Value) -> sea_orm::Value {
    if v.is_null() {
        sea_orm::Value::String(None)
    } else if let Some(s) = v.as_str() {
        s.to_string().into()
    } else if let Some(i) = v.as_i64() {
        i.into()
    } else if let Some(n) = v.as_f64() {
        n.into()
    } else if let Some(b) = v.as_bool() {
        (b as i32).into()
    } else {
        v.to_string().into()
    }
}
