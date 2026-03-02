use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::db::init_db;
use crate::models::{DbStatus, TableSequenceResetStatus, TableStatus};
use crate::state::AppDb;

#[tauri::command]
pub async fn reset_app_data(app: AppHandle) -> Result<(), String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    sqlx::query("DROP TABLE IF EXISTS shop_settings")
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DROP TABLE IF EXISTS users")
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DROP TABLE IF EXISTS orders")
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DROP TABLE IF EXISTS order_items")
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DROP TABLE IF EXISTS customers")
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DROP TABLE IF EXISTS expenses")
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DROP TABLE IF EXISTS _sqlx_migrations")
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let logos_dir = app_data_dir.join("logos");
        if logos_dir.exists() {
            let _ = fs::remove_dir_all(&logos_dir);
        }
    }

    if let Err(e) = init_db(&*pool).await {
        return Err(e.to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn backup_database(app: AppHandle, dest_path: String) -> Result<u64, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_data_dir.join("shop.db");

    if !db_path.exists() {
        return Err("Database file not found".to_string());
    }

    let dest = PathBuf::from(&dest_path);
    let bytes_copied =
        fs::copy(&db_path, &dest).map_err(|e| format!("Failed to copy database: {}", e))?;

    Ok(bytes_copied)
}

#[tauri::command]
pub async fn restore_database(app: AppHandle, restore_path: String) -> Result<(), String> {
    let db = app.state::<AppDb>();
    let mut pool_guard = db.0.lock().await;

    // 1. Close the existing pool
    pool_guard.close().await;

    // 2. Overwrite the database file
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_data_dir.join("shop.db");

    let restore_source = PathBuf::from(&restore_path);
    if !restore_source.exists() {
        return Err("Restore file not found".to_string());
    }

    fs::copy(&restore_source, &db_path)
        .map_err(|e| format!("Failed to restore database: {}", e))?;

    // 3. Re-initialize the pool
    let db_url = format!("sqlite:{}?mode=rwc", db_path.to_string_lossy());
    let new_pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await
        .map_err(|e| format!("Failed to reconnect to database: {}", e))?;

    *pool_guard = new_pool;

    Ok(())
}

#[tauri::command]
pub async fn get_db_status(app: AppHandle) -> Result<DbStatus, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let tables: Vec<(String,)> = sqlx::query_as(
        "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut table_statuses = Vec::new();

    for (name,) in &tables {
        let query = format!("SELECT COUNT(*) FROM {}", name);
        let count: (i64,) = sqlx::query_as(&query)
            .fetch_one(&*pool)
            .await
            .map_err(|e| e.to_string())?;

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

#[tauri::command]
pub async fn reset_table_sequence(
    app: AppHandle,
    table_name: String,
) -> Result<TableSequenceResetStatus, String> {
    let table_name = table_name.trim();
    if table_name.is_empty() {
        return Err("Table name is required".to_string());
    }

    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let table_exists: Option<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_schema WHERE type='table' AND name = ? AND name NOT LIKE 'sqlite_%' LIMIT 1",
    )
    .bind(table_name)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let table_name = table_exists.ok_or_else(|| format!("Table not found: {}", table_name))?;
    let quoted_table = quote_sqlite_identifier(&table_name);

    let max_id_query = format!("SELECT COALESCE(MAX(id), 0) FROM {}", quoted_table);
    let max_id: i64 = sqlx::query_scalar(&max_id_query)
        .fetch_one(&*pool)
        .await
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("no such column: id") {
                format!("Table '{}' does not have an 'id' column", table_name)
            } else {
                msg
            }
        })?;

    let update_result = sqlx::query("UPDATE sqlite_sequence SET seq = ? WHERE name = ?")
        .bind(max_id)
        .bind(&table_name)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    if update_result.rows_affected() == 0 {
        sqlx::query("INSERT INTO sqlite_sequence(name, seq) VALUES(?, ?)")
            .bind(&table_name)
            .bind(max_id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    let sequence_value: i64 =
        sqlx::query_scalar("SELECT COALESCE(seq, 0) FROM sqlite_sequence WHERE name = ? LIMIT 1")
            .bind(&table_name)
            .fetch_one(&*pool)
            .await
            .map_err(|e| e.to_string())?;

    Ok(TableSequenceResetStatus {
        table_name,
        max_id,
        sequence_value,
    })
}
