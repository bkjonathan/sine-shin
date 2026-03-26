use std::fs;
use std::path::PathBuf;
use std::sync::Arc;

use sea_orm::{ConnectionTrait, Database, DatabaseBackend, FromQueryResult, Statement};
use tauri::{AppHandle, Manager};
use tracing::instrument;

use crate::error::{AppError, AppResult};
use crate::models::{DbStatus, TableSequenceResetStatus, TableStatus};
use crate::state::AppState;

/// Resets core app data tables and re-initializes schema via migrations.
#[instrument(skip(state, app))]
pub async fn reset_app_data(state: Arc<AppState>, app: &AppHandle) -> AppResult<()> {
    use sea_orm_migration::MigratorTrait;
    use crate::migrator::Migrator;

    // Drop core tables
    let backend = state.db.as_ref().get_database_backend();
    for table in &[
        "shop_settings",
        "users",
        "orders",
        "order_items",
        "customers",
        "expenses",
        "seaql_migrations",
    ] {
        let _ = state
            .db
            .execute(Statement::from_string(
                backend,
                format!("DROP TABLE IF EXISTS {}", table),
            ))
            .await;
    }

    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let logos_dir = app_data_dir.join("logos");
        if logos_dir.exists() {
            let _ = fs::remove_dir_all(&logos_dir);
        }
    }

    Migrator::up(state.db.as_ref(), None)
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

/// Restores sqlite DB file. Note: with SeaORM DatabaseConnection we cannot swap it at runtime.
/// We copy the file and return success; the user must restart the app for changes to take effect.
#[instrument(skip(_state, app))]
pub async fn restore_database(
    _state: Arc<AppState>,
    app: &AppHandle,
    restore_path: String,
) -> AppResult<()> {
    let app_data_dir = app.path().app_data_dir()?;
    let db_path = app_data_dir.join("shop.db");

    let restore_source = PathBuf::from(&restore_path);
    if !restore_source.exists() {
        return Err(AppError::not_found("Restore file not found"));
    }

    fs::copy(&restore_source, &db_path)
        .map_err(|e| AppError::internal(format!("Failed to restore database: {}", e)))?;

    Ok(())
}

/// Returns DB table row counts and DB file size.
#[instrument(skip(state, app))]
pub async fn get_db_status(state: Arc<AppState>, app: &AppHandle) -> AppResult<DbStatus> {
    let backend = state.db.as_ref().get_database_backend();

    #[derive(FromQueryResult)]
    struct TableRow {
        name: String,
    }

    let tables = if backend == DatabaseBackend::Sqlite {
        TableRow::find_by_statement(Statement::from_string(
            backend,
            "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'".to_string(),
        ))
        .all(state.db.as_ref())
        .await?
    } else {
        TableRow::find_by_statement(Statement::from_string(
            backend,
            "SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'public'".to_string(),
        ))
        .all(state.db.as_ref())
        .await?
    };

    #[derive(FromQueryResult)]
    struct CountRow {
        count: i64,
    }

    let mut table_statuses = Vec::new();
    for table_row in &tables {
        let name = &table_row.name;
        let count = CountRow::find_by_statement(Statement::from_string(
            backend,
            format!("SELECT COUNT(*) as count FROM \"{}\"", name),
        ))
        .one(state.db.as_ref())
        .await
        .ok()
        .flatten()
        .map(|r| r.count)
        .unwrap_or(0);

        table_statuses.push(TableStatus {
            name: name.clone(),
            row_count: count,
        });
    }

    let size_bytes = if backend == DatabaseBackend::Sqlite {
        if let Ok(app_data_dir) = app.path().app_data_dir() {
            let db_path = app_data_dir.join("shop.db");
            fs::metadata(db_path).ok().map(|m| m.len())
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
    let table_name = table_name.trim().to_string();
    if table_name.is_empty() {
        return Err(AppError::invalid_input("Table name is required"));
    }

    let backend = state.db.as_ref().get_database_backend();

    if backend != DatabaseBackend::Sqlite {
        return Err(AppError::invalid_input(
            "reset_table_sequence is only supported for SQLite databases",
        ));
    }

    #[derive(FromQueryResult)]
    struct TableExistsRow {
        name: String,
    }

    let table_exists = TableExistsRow::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT name FROM sqlite_schema WHERE type='table' AND name = $1 AND name NOT LIKE 'sqlite_%' LIMIT 1",
        [table_name.clone().into()],
    ))
    .one(state.db.as_ref())
    .await?;

    let table_name = table_exists
        .ok_or_else(|| AppError::not_found(format!("Table not found: {}", table_name)))?
        .name;

    let quoted_table = quote_sqlite_identifier(&table_name);

    #[derive(FromQueryResult)]
    struct MaxIdRow {
        max_id: i64,
    }

    let max_id = MaxIdRow::find_by_statement(Statement::from_string(
        backend,
        format!("SELECT COALESCE(MAX(id), 0) as max_id FROM {}", quoted_table),
    ))
    .one(state.db.as_ref())
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
    })?
    .map(|r| r.max_id)
    .unwrap_or(0);

    let update_result = state
        .db
        .execute(Statement::from_sql_and_values(
            backend,
            "UPDATE sqlite_sequence SET seq = $1 WHERE name = $2",
            [max_id.into(), table_name.clone().into()],
        ))
        .await?;

    if update_result.rows_affected() == 0 {
        state
            .db
            .execute(Statement::from_sql_and_values(
                backend,
                "INSERT INTO sqlite_sequence(name, seq) VALUES($1, $2)",
                [table_name.clone().into(), max_id.into()],
            ))
            .await?;
    }

    #[derive(FromQueryResult)]
    struct SeqRow {
        seq: i64,
    }

    let sequence_value = SeqRow::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT COALESCE(seq, 0) as seq FROM sqlite_sequence WHERE name = $1 LIMIT 1",
        [table_name.clone().into()],
    ))
    .one(state.db.as_ref())
    .await?
    .map(|r| r.seq)
    .unwrap_or(0);

    Ok(TableSequenceResetStatus {
        table_name,
        max_id,
        sequence_value,
    })
}
