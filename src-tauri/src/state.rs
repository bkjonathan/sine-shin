use std::sync::Arc;

use sqlx::{PgPool, SqlitePool};
use tokio::sync::Mutex;

#[derive(Clone)]
pub enum Database {
    Sqlite(SqlitePool),
    Postgres(PgPool),
}

// Shared database pool state
pub struct AppDb(pub Arc<Mutex<Database>>);
