use std::fs;
use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, Manager};
use tracing::instrument;

use crate::db::init_db;
use crate::error::{AppError, AppResult};
use crate::models::{DbStatus, TableSequenceResetStatus, TableStatus};
use crate::state::AppState;

/// Resets core app data tables and re-initializes schema.
#[instrument(skip(state, app))]
pub async fn reset_app_data(state: Arc<AppState>, app: &AppHandle) -> AppResult<()> {
    let pool = state.db.lock().await;

    sqlx::query("DROP TABLE IF EXISTS shop_settings")
        .execute(&*pool)
        .await?;
    sqlx::query("DROP TABLE IF EXISTS users")
        .execute(&*pool)
        .await?;
    sqlx::query("DROP TABLE IF EXISTS orders")
        .execute(&*pool)
        .await?;
    sqlx::query("DROP TABLE IF EXISTS order_items")
        .execute(&*pool)
        .await?;
    sqlx::query("DROP TABLE IF EXISTS customers")
        .execute(&*pool)
        .await?;
    sqlx::query("DROP TABLE IF EXISTS expenses")
        .execute(&*pool)
        .await?;
    sqlx::query("DROP TABLE IF EXISTS _sqlx_migrations")
        .execute(&*pool)
        .await?;

    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let logos_dir = app_data_dir.join("logos");
        if logos_dir.exists() {
            let _ = fs::remove_dir_all(&logos_dir);
        }
    }

    init_db(&pool)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;
    Ok(())
}

/// Backs up sqlite DB file to destination path.
#[instrument(skip(app))]
pub async fn backup_database(app: &AppHandle, dest_path: String) -> AppResult<u64> {
    let app_data_dir = app.path().app_data_dir()?;
    let db_path = app_data_dir.join("shop.db");

    if !db_path.exists() {
        return Err(AppError::not_found("Database file not found"));
    }

    let dest = PathBuf::from(&dest_path);
    let bytes_copied = fs::copy(&db_path, &dest)
        .map_err(|e| AppError::internal(format!("Failed to copy database: {}", e)))?;
    Ok(bytes_copied)
}

/// Restores sqlite DB file and reconnects pool.
#[instrument(skip(state, app))]
pub async fn restore_database(
    state: Arc<AppState>,
    app: &AppHandle,
    restore_path: String,
) -> AppResult<()> {
    let mut pool_guard = state.db.lock().await;
    pool_guard.close().await;

    let app_data_dir = app.path().app_data_dir()?;
    let db_path = app_data_dir.join("shop.db");

    let restore_source = PathBuf::from(&restore_path);
    if !restore_source.exists() {
        return Err(AppError::not_found("Restore file not found"));
    }

    fs::copy(&restore_source, &db_path)
        .map_err(|e| AppError::internal(format!("Failed to restore database: {}", e)))?;

    let db_url = format!("sqlite:{}?mode=rwc", db_path.to_string_lossy());
    let new_pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await
        .map_err(|e| AppError::internal(format!("Failed to reconnect to database: {}", e)))?;

    *pool_guard = new_pool;
    Ok(())
}

/// Returns DB table row counts and DB file size.
#[instrument(skip(state, app))]
pub async fn get_db_status(state: Arc<AppState>, app: &AppHandle) -> AppResult<DbStatus> {
    let pool = state.db.lock().await;

    let tables: Vec<(String,)> = sqlx::query_as(
        "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .fetch_all(&*pool)
    .await?;

    let mut table_statuses = Vec::new();
    for (name,) in &tables {
        let query = format!("SELECT COUNT(*) FROM {}", name);
        let count: (i64,) = sqlx::query_as(&query).fetch_one(&*pool).await?;
        table_statuses.push(TableStatus {
            name: name.clone(),
            row_count: count.0,
        });
    }

    let size_bytes = if let Ok(app_data_dir) = app.path().app_data_dir() {
        let db_path = app_data_dir.join("shop.db");
        if let Ok(metadata) = fs::metadata(db_path) {
            Some(metadata.len())
        } else {
            None
        }
    } else {
        None
    };

    Ok(DbStatus {
        total_tables: tables.len() as i64,
        tables: table_statuses,
        size_bytes,
    })
}

fn quote_sqlite_identifier(identifier: &str) -> String {
    format!("\"{}\"", identifier.replace('"', "\"\""))
}

/// Resets sqlite sequence for a table to its current MAX(id).
#[instrument(skip(state))]
pub async fn reset_table_sequence(
    state: Arc<AppState>,
    table_name: String,
) -> AppResult<TableSequenceResetStatus> {
    let table_name = table_name.trim();
    if table_name.is_empty() {
        return Err(AppError::invalid_input("Table name is required"));
    }

    let pool = state.db.lock().await;
    let table_exists: Option<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_schema WHERE type='table' AND name = ? AND name NOT LIKE 'sqlite_%' LIMIT 1",
    )
    .bind(table_name)
    .fetch_optional(&*pool)
    .await?;

    let table_name = table_exists
        .ok_or_else(|| AppError::not_found(format!("Table not found: {}", table_name)))?;
    let quoted_table = quote_sqlite_identifier(&table_name);

    let max_id_query = format!("SELECT COALESCE(MAX(id), 0) FROM {}", quoted_table);
    let max_id: i64 = sqlx::query_scalar(&max_id_query)
        .fetch_one(&*pool)
        .await
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("no such column: id") {
                AppError::invalid_input(format!(
                    "Table '{}' does not have an 'id' column",
                    table_name
                ))
            } else {
                AppError::internal(msg)
            }
        })?;

    let update_result = sqlx::query("UPDATE sqlite_sequence SET seq = ? WHERE name = ?")
        .bind(max_id)
        .bind(&table_name)
        .execute(&*pool)
        .await?;

    if update_result.rows_affected() == 0 {
        sqlx::query("INSERT INTO sqlite_sequence(name, seq) VALUES(?, ?)")
            .bind(&table_name)
            .bind(max_id)
            .execute(&*pool)
            .await?;
    }

    let sequence_value: i64 =
        sqlx::query_scalar("SELECT COALESCE(seq, 0) FROM sqlite_sequence WHERE name = ? LIMIT 1")
            .bind(&table_name)
            .fetch_one(&*pool)
            .await?;

    Ok(TableSequenceResetStatus {
        table_name,
        max_id,
        sequence_value,
    })
}
