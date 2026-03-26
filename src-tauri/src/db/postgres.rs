use sea_orm::{ConnectionTrait, Database, DatabaseConnection};

use crate::error::{AppError, AppResult};

pub async fn connect_postgresql_database(url: &str) -> AppResult<DatabaseConnection> {
    let db = Database::connect(url.trim())
        .await
        .map_err(|e| AppError::internal(format!("Failed to connect to PostgreSQL: {e}")))?;

    db.execute_unprepared(include_str!("../../migrations/full_schema_postgres.sql"))
        .await
        .map_err(|e| AppError::internal(format!("Failed to initialize PostgreSQL schema: {e}")))?;

    db.execute_unprepared(include_str!(
        "../../migrations/postgres_string_timestamp_compat.sql"
    ))
    .await
    .map_err(|e| {
        AppError::internal(format!(
            "Failed to normalize PostgreSQL timestamp columns: {e}"
        ))
    })?;

    Ok(db)
}
