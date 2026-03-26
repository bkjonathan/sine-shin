use std::sync::Arc;

use reqwest::Client;
use sea_orm::DatabaseConnection;

use crate::sync::client::SupabaseClient;

// Shared app state for command/service modules.
pub struct AppState {
    pub db: Arc<DatabaseConnection>,
    pub supabase_client: SupabaseClient,
}

impl AppState {
    /// Builds shared app state from the DB connection and a shared HTTP client.
    pub fn new(db: Arc<DatabaseConnection>, http_client: Client) -> Self {
        Self {
            db,
            supabase_client: SupabaseClient::new(http_client),
        }
    }
}
