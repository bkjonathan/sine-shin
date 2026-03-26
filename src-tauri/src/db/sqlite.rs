use std::path::{Path, PathBuf};

use sea_orm::{DatabaseConnection, SqlxSqliteConnector};
use sea_orm_migration::MigratorTrait;
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::{Pool, Sqlite};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::migration::Migrator;

pub fn sqlite_database_path(app: &AppHandle) -> AppResult<PathBuf> {
    let app_data_dir = app.path().app_data_dir()?;
    Ok(app_data_dir.join("shop.db"))
}

pub fn sqlite_database_url(db_path: &Path) -> String {
    format!("sqlite:{}?mode=rwc", db_path.to_string_lossy())
}

pub async fn connect_sqlite_database(
    app: &AppHandle,
) -> AppResult<(DatabaseConnection, Pool<Sqlite>)> {
    let db_path = sqlite_database_path(app)?;
    let db_url = sqlite_database_url(&db_path);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await
        .map_err(|e| AppError::internal(format!("Failed to create SQLite pool: {e}")))?;

    let db = SqlxSqliteConnector::from_sqlx_sqlite_pool(pool.clone());

    Migrator::up(&db, None)
        .await
        .map_err(|e| AppError::internal(format!("Failed to run SQLite migrations: {e}")))?;

    Ok((db, pool))
}
