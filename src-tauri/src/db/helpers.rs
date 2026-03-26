use std::sync::Arc;

use sea_orm::{ConnectionTrait, DatabaseConnection, FromQueryResult, Statement};

use crate::error::{AppError, AppResult};
use crate::sync::SyncConfig;

#[derive(Debug, FromQueryResult)]
struct SyncConfigRow {
    id: i64,
    supabase_url: String,
    supabase_anon_key: String,
    supabase_service_key: String,
    sync_enabled: i64,
    sync_interval: i64,
}

/// Loads the active sync configuration from the local database.
pub async fn load_active_sync_config(db: &Arc<DatabaseConnection>) -> AppResult<SyncConfig> {
    let backend = db.as_ref().get_database_backend();
    let row = SyncConfigRow::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT id, supabase_url, supabase_anon_key, supabase_service_key, sync_enabled, COALESCE(sync_interval, 30) as sync_interval FROM sync_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1",
        [],
    ))
    .one(db.as_ref())
    .await?;

    let row = row.ok_or(AppError::SyncConfigNotFound)?;

    let sync_interval = i32::try_from(row.sync_interval)
        .map_err(|_| AppError::invalid_input("Sync interval in DB exceeds i32 range"))?;

    Ok(SyncConfig {
        id: Some(row.id),
        supabase_url: row.supabase_url,
        supabase_anon_key: row.supabase_anon_key,
        supabase_service_key: row.supabase_service_key,
        sync_enabled: row.sync_enabled == 1,
        sync_interval,
    })
}
