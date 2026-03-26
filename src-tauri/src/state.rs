use std::sync::Arc;

use reqwest::Client;
use sqlx::AnyPool;
use tokio::sync::Mutex;

use crate::db::SqlDialect;
use crate::sync::client::SupabaseClient;

// Shared database pool state
pub struct AppDb(pub Arc<Mutex<AnyPool>>);

// Shared app state for refactored command/service modules.
pub struct AppState {
    pub db: Arc<Mutex<AnyPool>>,
    pub db_type: String,
    pub supabase_client: SupabaseClient,
}

impl AppState {
    /// Builds shared app state from the existing DB pool and a shared HTTP client.
    pub fn new(db: Arc<Mutex<AnyPool>>, db_type: String, http_client: Client) -> Self {
        Self {
            db,
            db_type,
            supabase_client: SupabaseClient::new(http_client),
        }
    }

    /// Returns the SQL dialect for the active database backend.
    pub fn dialect(&self) -> SqlDialect {
        SqlDialect::from_db_type(&self.db_type)
    }
}
