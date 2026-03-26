use std::fs;
use std::path::PathBuf;
use std::sync::Arc;

use sea_orm::SqlxSqliteConnector;
use sea_orm::{ConnectionTrait, DatabaseBackend, FromQueryResult, Statement};
use sea_orm_migration::MigratorTrait;
use sqlx::sqlite::SqlitePoolOptions;
use tauri::{AppHandle, Manager};
use tracing::instrument;

use crate::error::{AppError, AppResult};
use crate::migration::Migrator;
use crate::models::{DbStatus, TableSequenceResetStatus, TableStatus};
use crate::state::AppState;

#[derive(Debug, FromQueryResult)]
struct TableRow {
    name: String,
}

#[derive(Debug, FromQueryResult)]
struct CountRow {
    cnt: i64,
}

#[derive(Debug, FromQueryResult)]
struct MaxIdRow {
    max_id: i64,
}

#[derive(Debug, FromQueryResult)]
struct SeqRow {
    seq_val: i64,
}

/// Resets core app data tables and re-initializes schema.
#[instrument(skip(state, app))]
pub async fn reset_app_data(state: Arc<AppState>, app: &AppHandle) -> AppResult<()> {
    let db = state.db.lock().await.clone();

    for table in [
        "shop_settings",
        "users",
        "orders",
        "order_items",
        "customers",
        "expenses",
        "seaql_migrations",
    ] {
        db.execute(Statement::from_string(
            DatabaseBackend::Sqlite,
            format!("DROP TABLE IF EXISTS {}", table),
        ))
        .await?;
    }

    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let logos_dir = app_data_dir.join("logos");
        if logos_dir.exists() {
            let _ = fs::remove_dir_all(&logos_dir);
        }
    }

    Migrator::up(&db, None)
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

/// Restores sqlite DB file, reconnects pool, and runs pending migrations.
#[instrument(skip(state, app))]
pub async fn restore_database(
    state: Arc<AppState>,
    app: &AppHandle,
    restore_path: String,
) -> AppResult<()> {
    let restore_source = PathBuf::from(&restore_path);
    if !restore_source.exists() {
        return Err(AppError::not_found("Restore file not found"));
    }

    let app_data_dir = app.path().app_data_dir()?;
    let db_path = app_data_dir.join("shop.db");

    // Hold both locks to atomically swap the connections.
    let mut db_guard = state.db.lock().await;
    let mut pool_guard = state.pool.lock().await;

    pool_guard.close().await;

    fs::copy(&restore_source, &db_path)
        .map_err(|e| AppError::internal(format!("Failed to restore database: {}", e)))?;

    let db_url = format!("sqlite:{}?mode=rwc", db_path.to_string_lossy());
    let new_pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await
        .map_err(|e| AppError::internal(format!("Failed to reconnect to database: {}", e)))?;

    let new_db = SqlxSqliteConnector::from_sqlx_sqlite_pool(new_pool.clone());
    Migrator::up(&new_db, None)
        .await
        .map_err(|e| AppError::internal(e.to_string()))?;

    *pool_guard = new_pool;
    *db_guard = new_db;
    Ok(())
}

/// Returns DB table row counts and DB file size.
#[instrument(skip(state, app))]
pub async fn get_db_status(state: Arc<AppState>, app: &AppHandle) -> AppResult<DbStatus> {
    let db = state.db.lock().await.clone();

    let tables = TableRow::find_by_statement(Statement::from_string(
        DatabaseBackend::Sqlite,
        "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    ))
    .all(&db)
    .await?;

    let mut table_statuses = Vec::new();
    for row in &tables {
        let count = CountRow::find_by_statement(Statement::from_string(
            DatabaseBackend::Sqlite,
            format!(
                "SELECT COUNT(*) as cnt FROM {}",
                quote_sqlite_identifier(&row.name)
            ),
        ))
        .one(&db)
        .await?
        .unwrap_or(CountRow { cnt: 0 })
        .cnt;

        table_statuses.push(TableStatus {
            name: row.name.clone(),
            row_count: count,
        });
    }

    let size_bytes = app
        .path()
        .app_data_dir()
        .ok()
        .and_then(|dir| fs::metadata(dir.join("shop.db")).ok())
        .map(|meta| meta.len());

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
    let table_name = table_name.trim().to_string();
    if table_name.is_empty() {
        return Err(AppError::invalid_input("Table name is required"));
    }

    let db = state.db.lock().await.clone();

    let exists = TableRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Sqlite,
        "SELECT name FROM sqlite_schema WHERE type='table' AND name = ? AND name NOT LIKE 'sqlite_%' LIMIT 1",
        [table_name.clone().into()],
    ))
    .one(&db)
    .await?;

    let table_name = exists
        .ok_or_else(|| AppError::not_found(format!("Table not found: {}", table_name)))?
        .name;

    let quoted_table = quote_sqlite_identifier(&table_name);

    let max_id_result = MaxIdRow::find_by_statement(Statement::from_string(
        DatabaseBackend::Sqlite,
        format!(
            "SELECT COALESCE(MAX(id), 0) as max_id FROM {}",
            quoted_table
        ),
    ))
    .one(&db)
    .await;

    let max_id = match max_id_result {
        Ok(Some(row)) => row.max_id,
        Ok(None) => 0,
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("no such column: id") {
                return Err(AppError::invalid_input(format!(
                    "Table '{}' does not have an 'id' column",
                    table_name
                )));
            }
            return Err(e.into());
        }
    };

    let update_result = db
        .execute(Statement::from_sql_and_values(
            DatabaseBackend::Sqlite,
            "UPDATE sqlite_sequence SET seq = ? WHERE name = ?",
            [max_id.into(), table_name.clone().into()],
        ))
        .await?;

    if update_result.rows_affected() == 0 {
        db.execute(Statement::from_sql_and_values(
            DatabaseBackend::Sqlite,
            "INSERT INTO sqlite_sequence(name, seq) VALUES(?, ?)",
            [table_name.clone().into(), max_id.into()],
        ))
        .await?;
    }

    let sequence_value = SeqRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Sqlite,
        "SELECT COALESCE(seq, 0) as seq_val FROM sqlite_sequence WHERE name = ? LIMIT 1",
        [table_name.clone().into()],
    ))
    .one(&db)
    .await?
    .map(|r| r.seq_val)
    .unwrap_or(0);

    Ok(TableSequenceResetStatus {
        table_name,
        max_id,
        sequence_value,
    })
}
