use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::db::init_db;
use crate::models::{DbStatus, TableStatus};
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

    sqlx::query("DROP TABLE IF EXISTS customers")
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

    fs::copy(&restore_source, &db_path).map_err(|e| format!("Failed to restore database: {}", e))?;

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
