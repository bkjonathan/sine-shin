use std::sync::Arc;

use reqwest::Client;
use sea_orm::DatabaseConnection;
use sqlx::{Pool, Sqlite};
use tokio::sync::Mutex;

use crate::services::settings::DatabaseKind;
use crate::sync::client::SupabaseClient;

/// Thin wrapper kept so the sync module can access the raw sqlx pool via
/// `app.state::<AppDb>()` without needing to be rewritten.
///
/// `AppDb.0` and `AppState.sqlite_pool` point to the **same** mutex,
/// so swapping the pool in either location is immediately visible to both.
pub struct AppDb(pub Arc<Mutex<Option<Pool<Sqlite>>>>);

/// Shared app state used by all business-service commands.
///
/// `db` is a SeaORM `DatabaseConnection` (wraps the same sqlx pool via
/// `SqlxSqliteConnector`).  It is wrapped in a `Mutex` only so that
/// `restore_database` can atomically swap it after replacing the file.
///
/// Callers should clone the connection immediately after locking to avoid
/// holding the lock while queries execute:
///
/// ```rust
/// let db = state.db.lock().await.clone();
/// // lock released; concurrent queries run freely
/// ```
pub struct AppState {
    pub db: Mutex<DatabaseConnection>,
    /// Raw sqlx pool shared with `AppDb` for the sync module.
    pub sqlite_pool: Arc<Mutex<Option<Pool<Sqlite>>>>,
    pub database_kind: Mutex<DatabaseKind>,
    pub supabase_client: SupabaseClient,
}

impl AppState {
    pub fn new(
        db: DatabaseConnection,
        sqlite_pool: Arc<Mutex<Option<Pool<Sqlite>>>>,
        database_kind: DatabaseKind,
        http_client: Client,
    ) -> Self {
        Self {
            db: Mutex::new(db),
            sqlite_pool,
            database_kind: Mutex::new(database_kind),
            supabase_client: SupabaseClient::new(http_client),
        }
    }
}
