use std::sync::Arc;

use sqlx::AnyPool;
use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};
use crate::sync::SyncConfig;

#[derive(Debug, sqlx::FromRow)]
struct SyncConfigRow {
    id: i64,
    supabase_url: String,
    supabase_anon_key: String,
    supabase_service_key: String,
    sync_enabled: i64,
    sync_interval: i64,
}

/// Loads the active sync configuration from the local database.
pub async fn load_active_sync_config(db: &Arc<Mutex<AnyPool>>) -> AppResult<SyncConfig> {
    let pool = db.lock().await;

    let row = sqlx::query_as::<_, SyncConfigRow>(
        "SELECT id, supabase_url, supabase_anon_key, supabase_service_key, sync_enabled, COALESCE(sync_interval, 30) as sync_interval FROM sync_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1",
    )
    .fetch_optional(&*pool)
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
