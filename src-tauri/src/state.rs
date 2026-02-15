use std::sync::Arc;

use sqlx::{Pool, Sqlite};
use tokio::sync::Mutex;

// Shared database pool state
pub struct AppDb(pub Arc<Mutex<Pool<Sqlite>>>);
