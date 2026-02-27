use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};


use crate::models::{DbStatus, TableStatus};
use crate::state::AppDb;
use crate::{db_query, db_query_as_one};
use crate::commands::settings::{get_app_settings, update_app_settings};
use sqlx::{sqlite::SqlitePoolOptions, postgres::PgPoolOptions};

#[tauri::command]
pub async fn reset_app_data(app: AppHandle) -> Result<(), String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    db_query!(&*pool, "DROP TABLE IF EXISTS shop_settings").map_err(|e| e.to_string())?;
    db_query!(&*pool, "DROP TABLE IF EXISTS users").map_err(|e| e.to_string())?;
    db_query!(&*pool, "DROP TABLE IF EXISTS orders").map_err(|e| e.to_string())?;
    db_query!(&*pool, "DROP TABLE IF EXISTS order_items").map_err(|e| e.to_string())?;
    db_query!(&*pool, "DROP TABLE IF EXISTS customers").map_err(|e| e.to_string())?;
    db_query!(&*pool, "DROP TABLE IF EXISTS expenses").map_err(|e| e.to_string())?;
    db_query!(&*pool, "DROP TABLE IF EXISTS _sqlx_migrations").map_err(|e| e.to_string())?;

    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let logos_dir = app_data_dir.join("logos");
        if logos_dir.exists() {
            let _ = fs::remove_dir_all(&logos_dir);
        }
    }

    match &*pool {
        crate::state::Database::Sqlite(p) => {
            if let Err(e) = crate::db::init_sqlite_db(p).await {
                return Err(e.to_string());
            }
        },
        #[cfg(feature = "postgres")]
        crate::state::Database::Postgres(p) => {
            if let Err(e) = crate::db::init_pg_db(p).await {
                return Err(e.to_string());
            }
        },
        #[cfg(not(feature = "postgres"))]
        _ => unreachable!(),
    }

    Ok(())
}

#[tauri::command]
pub async fn switch_database_pool(app: AppHandle, db_type: String, pg_url: Option<String>) -> Result<bool, String> {
    let mut settings = get_app_settings(app.clone())?;
    #[allow(unused_assignments)]
    let mut newly_initialized = false;
    
    if db_type == "postgres" && pg_url.is_some() {
        #[cfg(feature = "postgres")]
        {
            let url = pg_url.clone().unwrap();
            let new_pool = PgPoolOptions::new()
                .max_connections(5)
                .connect(&url)
                .await
                .map_err(|e| format!("Failed to connect to PostgreSQL: {}", e))?;
                
            newly_initialized = crate::db::init_pg_db(&new_pool).await.map_err(|e| format!("Failed to initialize PostgreSQL: {}", e))?;
            
            let db = app.state::<AppDb>();
            let mut state = db.0.lock().await;
            *state = crate::state::Database::Postgres(new_pool);
        }
        #[cfg(not(feature = "postgres"))]
        {
            return Err("PostgreSQL feature is not enabled".to_string());
        }
    } else {
        let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        let db_path = app_data_dir.join("shop.db");
        let db_url = format!("sqlite:{}?mode=rwc", db_path.to_string_lossy());
        
        let new_pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(&db_url)
            .await
            .map_err(|e| format!("Failed to connect to SQLite: {}", e))?;
            
        newly_initialized = crate::db::init_sqlite_db(&new_pool).await.map_err(|e| format!("Failed to initialize SQLite: {}", e))?;
        
        let db = app.state::<AppDb>();
        let mut state = db.0.lock().await;
        *state = crate::state::Database::Sqlite(new_pool);
    }
    
    settings.db_type = db_type;
    settings.pg_url = pg_url;
    update_app_settings(app, settings)?;
    
    Ok(newly_initialized)
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
    match &*pool_guard {
        crate::state::Database::Sqlite(pool) => pool.close().await,
        #[cfg(feature = "postgres")]
        crate::state::Database::Postgres(pool) => pool.close().await,
        #[cfg(not(feature = "postgres"))]
        _ => unreachable!(),
    }

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

    *pool_guard = crate::state::Database::Sqlite(new_pool);

    Ok(())
}

#[tauri::command]
pub async fn get_db_status(app: AppHandle) -> Result<DbStatus, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let tables: Vec<(String,)> = match &*pool {
        crate::state::Database::Sqlite(p) => {
            sqlx::query_as("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'")
                .fetch_all(p)
                .await
                .map_err(|e| e.to_string())?
        }
        #[cfg(feature = "postgres")]
        crate::state::Database::Postgres(p) => {
            sqlx::query_as("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
                .fetch_all(p)
                .await
                .map_err(|e| e.to_string())?
        },
        #[cfg(not(feature = "postgres"))]
        _ => unreachable!(),
    };

    let mut table_statuses = Vec::new();

    for (name,) in &tables {
        let query = format!("SELECT COUNT(*) FROM {}", name);
        let count: (i64,) = db_query_as_one!((i64,), &*pool, &query)
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
