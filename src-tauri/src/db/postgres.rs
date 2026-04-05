use std::time::Duration;

use sea_orm::{
    ConnectionTrait, ConnectOptions, Database, DatabaseBackend, DatabaseConnection, Statement,
};

use crate::error::{AppError, AppResult};

/// Versioned PostgreSQL migrations applied in ascending order.
/// Each entry is (version_name, sql). Applied exactly once and tracked in `_pg_migrations`.
const PG_MIGRATIONS: &[(&str, &str)] = &[
    (
        "v1_initial_schema",
        include_str!("../../migrations/full_schema_postgres.sql"),
    ),
    (
        "v1_timestamp_compat",
        include_str!("../../migrations/postgres_string_timestamp_compat.sql"),
    ),
];

/// Creates the migration tracking table if it doesn't exist yet.
async fn ensure_migrations_table(db: &DatabaseConnection) -> AppResult<()> {
    db.execute_unprepared(
        "CREATE TABLE IF NOT EXISTS _pg_migrations (
            version TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .await
    .map_err(|e| AppError::internal(format!("Failed to create _pg_migrations table: {e}")))?;
    Ok(())
}

/// Runs any migrations that have not yet been applied.
/// Already-applied migrations are skipped; new ones are executed and recorded.
async fn run_pending_migrations(db: &DatabaseConnection) -> AppResult<()> {
    ensure_migrations_table(db).await?;

    for (version, sql) in PG_MIGRATIONS {
        let already_applied = db
            .query_one(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                "SELECT 1 FROM _pg_migrations WHERE version = $1 LIMIT 1",
                [(*version).into()],
            ))
            .await
            .map_err(|e| {
                AppError::internal(format!("Failed to check migration '{version}': {e}"))
            })?
            .is_some();

        if !already_applied {
            db.execute_unprepared(sql).await.map_err(|e| {
                AppError::internal(format!("Failed to apply migration '{version}': {e}"))
            })?;

            db.execute(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                "INSERT INTO _pg_migrations (version) VALUES ($1)",
                [(*version).into()],
            ))
            .await
            .map_err(|e| {
                AppError::internal(format!("Failed to record migration '{version}': {e}"))
            })?;
        }
    }

    Ok(())
}

/// Connects to a PostgreSQL database and ensures all pending schema migrations are applied.
/// Migrations are tracked in `_pg_migrations` and run at most once each.
///
/// Pool is sized for a desktop app with multiple concurrent tabs:
/// - 2–8 connections (scales with concurrency, releases idle ones)
/// - 30 s acquire timeout: a blocked query waits rather than failing immediately
/// - 10 min idle timeout / 30 min max lifetime: prevents stale connections
pub async fn connect_postgresql_database(url: &str) -> AppResult<DatabaseConnection> {
    let mut opts = ConnectOptions::new(url.trim().to_string());
    opts.min_connections(2)
        .max_connections(8)
        // How long to wait for a free slot in the pool before giving up.
        // Prevents "pool timed out" errors when several tabs query at once.
        .acquire_timeout(Duration::from_secs(30))
        // Drop idle connections after 10 minutes to avoid hitting server limits.
        .idle_timeout(Duration::from_secs(600))
        // Recycle connections after 30 minutes to prevent stale-state issues.
        .max_lifetime(Duration::from_secs(1800))
        // Initial connection attempt timeout.
        .connect_timeout(Duration::from_secs(10))
        .sqlx_logging(false);

    let db = Database::connect(opts)
        .await
        .map_err(|e| AppError::internal(format!("Failed to connect to PostgreSQL: {e}")))?;

    run_pending_migrations(&db).await?;

    Ok(db)
}
