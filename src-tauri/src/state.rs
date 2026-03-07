use std::sync::Arc;

use reqwest::Client;
use sqlx::{Pool, Sqlite};
use tokio::sync::Mutex;

use crate::sync::client::SupabaseClient;

// Shared database pool state
pub struct AppDb(pub Arc<Mutex<Pool<Sqlite>>>);

// Shared app state for refactored command/service modules.
pub struct AppState {
    pub db: Arc<Mutex<Pool<Sqlite>>>,
    pub supabase_client: SupabaseClient,
}

impl AppState {
    /// Builds shared app state from the existing DB pool and a shared HTTP client.
    pub fn new(db: Arc<Mutex<Pool<Sqlite>>>, http_client: Client) -> Self {
        Self {
            db,
            supabase_client: SupabaseClient::new(http_client),
        }
    }
}
