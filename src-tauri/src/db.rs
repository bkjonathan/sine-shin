use std::fs;
use std::path::{Path, PathBuf};

use chrono::{DateTime, NaiveDate, NaiveDateTime, Utc};
use sea_orm::prelude::{Date, DateTimeUtc};
use sea_orm::{
    ConnectionTrait, Database, DatabaseBackend, DatabaseConnection, SqlxSqliteConnector,
    Statement, Value,
};
use sea_orm_migration::MigratorTrait;
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::{Pool, Sqlite};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::migration::Migrator;
use crate::services::settings::DatabaseKind;

pub mod helpers {
    // Intentionally empty - sync config loading is handled via
    // the sync_config entity in services that need it.
}

pub const DEFAULT_CUSTOMER_ID_PREFIX: &str = "SSC-";
pub const DEFAULT_ORDER_ID_PREFIX: &str = "SSO-";
pub const DEFAULT_EXPENSE_ID_PREFIX: &str = "EXP-";
pub const SQLITE_ONLY_FEATURE_MESSAGE: &str =
    "This feature is only available while SQLite is the active database.";

/// The SELECT clause used for orders joined with customer name and item aggregates.
pub const ORDER_WITH_CUSTOMER_SELECT: &str = r#"
    SELECT
        o.*,
        c.name as customer_name,
        CAST(COALESCE(SUM(oi.price * oi.product_qty), 0) AS DOUBLE PRECISION) as total_price,
        CAST(COALESCE(SUM(oi.product_qty), 0) AS BIGINT) as total_qty,
        CAST(COALESCE(SUM(oi.product_weight), 0) AS DOUBLE PRECISION) as total_weight,
        (SELECT product_url FROM order_items WHERE order_id = o.id AND deleted_at IS NULL LIMIT 1) as first_product_url
    FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.id
    LEFT JOIN order_items oi ON o.id = oi.order_id AND oi.deleted_at IS NULL
"#;

pub const ORDER_WITH_CUSTOMER_GROUP_BY: &str = " GROUP BY o.id, c.name ";

pub fn sql_statement_with_values<I>(
    backend: DatabaseBackend,
    sql: &str,
    values: I,
) -> Statement
where
    I: IntoIterator<Item = Value>,
{
    if backend == DatabaseBackend::Postgres {
        let mut normalized = String::with_capacity(sql.len() + 16);
        let mut index = 1;
        for ch in sql.chars() {
            if ch == '?' {
                normalized.push('$');
                normalized.push_str(&index.to_string());
                index += 1;
            } else {
                normalized.push(ch);
            }
        }
        Statement::from_sql_and_values(backend, &normalized, values)
    } else {
        Statement::from_sql_and_values(backend, sql, values)
    }
}

pub fn current_timestamp_utc() -> DateTimeUtc {
    Utc::now()
}

pub fn parse_optional_date(value: Option<String>) -> AppResult<Option<Date>> {
    let Some(raw) = value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    else {
        return Ok(None);
    };

    if let Ok(parsed) = NaiveDate::parse_from_str(&raw, "%Y-%m-%d") {
        return Ok(Some(parsed));
    }

    if let Ok(parsed) = DateTime::parse_from_rfc3339(&raw) {
        return Ok(Some(parsed.date_naive()));
    }

    const DATETIME_FORMATS: [&str; 12] = [
        "%Y-%m-%d %H:%M:%S%.f",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%dT%H:%M:%S%.f",
        "%Y-%m-%dT%H:%M",
        "%d/%m/%Y %H:%M:%S%.f",
        "%d/%m/%Y %H:%M",
        "%d-%m-%Y %H:%M:%S%.f",
        "%d-%m-%Y %H:%M",
        "%Y/%m/%d %H:%M:%S%.f",
        "%Y/%m/%d %H:%M",
        "%d.%m.%Y %H:%M:%S%.f",
        "%d.%m.%Y %H:%M",
    ];

    for format in DATETIME_FORMATS {
        if let Ok(parsed) = NaiveDateTime::parse_from_str(&raw, format) {
            return Ok(Some(parsed.date()));
        }
    }

    const DATE_FORMATS: [&str; 5] = ["%Y/%m/%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y.%m.%d"];

    for format in DATE_FORMATS {
        if let Ok(parsed) = NaiveDate::parse_from_str(&raw, format) {
            return Ok(Some(parsed));
        }
    }

    Err(AppError::invalid_input(format!(
        "Invalid date value: {raw}"
    )))
}

pub fn parse_optional_datetime(value: Option<String>) -> AppResult<Option<DateTimeUtc>> {
    let Some(raw) = value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    else {
        return Ok(None);
    };

    if let Ok(parsed) = DateTime::parse_from_rfc3339(&raw) {
        return Ok(Some(parsed.with_timezone(&Utc)));
    }

    const DATETIME_FORMATS: [&str; 12] = [
        "%Y-%m-%d %H:%M:%S%.f",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%dT%H:%M:%S%.f",
        "%Y-%m-%dT%H:%M",
        "%d/%m/%Y %H:%M:%S%.f",
        "%d/%m/%Y %H:%M",
        "%d-%m-%Y %H:%M:%S%.f",
        "%d-%m-%Y %H:%M",
        "%Y/%m/%d %H:%M:%S%.f",
        "%Y/%m/%d %H:%M",
        "%d.%m.%Y %H:%M:%S%.f",
        "%d.%m.%Y %H:%M",
    ];

    for format in DATETIME_FORMATS {
        if let Ok(parsed) = NaiveDateTime::parse_from_str(&raw, format) {
            return Ok(Some(parsed.and_utc()));
        }
    }

    if let Ok(parsed) = NaiveDate::parse_from_str(&raw, "%Y-%m-%d") {
        if let Some(datetime) = parsed.and_hms_opt(0, 0, 0) {
            return Ok(Some(datetime.and_utc()));
        }
    }

    const DATE_FORMATS: [&str; 5] = ["%Y/%m/%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y.%m.%d"];

    for format in DATE_FORMATS {
        if let Ok(parsed) = NaiveDate::parse_from_str(&raw, format) {
            if let Some(datetime) = parsed.and_hms_opt(0, 0, 0) {
                return Ok(Some(datetime.and_utc()));
            }
        }
    }

    Err(AppError::invalid_input(format!(
        "Invalid timestamp value: {raw}"
    )))
}

pub fn sqlite_database_path(app: &AppHandle) -> AppResult<PathBuf> {
    let app_data_dir = app.path().app_data_dir()?;
    Ok(app_data_dir.join("shop.db"))
}

pub fn sqlite_database_url(db_path: &Path) -> String {
    format!("sqlite:{}?mode=rwc", db_path.to_string_lossy())
}

pub async fn connect_sqlite_database(
    app: &AppHandle,
) -> AppResult<(DatabaseConnection, Pool<Sqlite>)> {
    let db_path = sqlite_database_path(app)?;
    let db_url = sqlite_database_url(&db_path);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await
        .map_err(|e| AppError::internal(format!("Failed to create SQLite pool: {e}")))?;

    let db = SqlxSqliteConnector::from_sqlx_sqlite_pool(pool.clone());

    Migrator::up(&db, None)
        .await
        .map_err(|e| AppError::internal(format!("Failed to run SQLite migrations: {e}")))?;

    Ok((db, pool))
}

pub async fn connect_postgresql_database(url: &str) -> AppResult<DatabaseConnection> {
    let db = Database::connect(url.trim())
        .await
        .map_err(|e| AppError::internal(format!("Failed to connect to PostgreSQL: {e}")))?;

    db.execute_unprepared(include_str!("../migrations/full_schema_postgres.sql"))
        .await
        .map_err(|e| AppError::internal(format!("Failed to initialize PostgreSQL schema: {e}")))?;
    db.execute_unprepared(include_str!(
        "../migrations/postgres_string_timestamp_compat.sql"
    ))
    .await
    .map_err(|e| {
        AppError::internal(format!(
            "Failed to normalize PostgreSQL timestamp columns: {e}"
        ))
    })?;

    Ok(db)
}

pub async fn connect_database(
    app: &AppHandle,
    database_kind: DatabaseKind,
    postgresql_url: Option<&str>,
) -> AppResult<(DatabaseConnection, Option<Pool<Sqlite>>)> {
    match database_kind {
        DatabaseKind::Sqlite => {
            let (db, pool) = connect_sqlite_database(app).await?;
            Ok((db, Some(pool)))
        }
        DatabaseKind::Postgresql => {
            let url = postgresql_url
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| AppError::invalid_input("PostgreSQL URL is required."))?;
            let db = connect_postgresql_database(url).await?;
            Ok((db, None))
        }
    }
}

pub fn copy_logo_to_app_data(app: &AppHandle, logo_file_path: &str) -> AppResult<Option<String>> {
    if logo_file_path.is_empty() {
        return Ok(None);
    }

    let app_data_dir = app.path().app_data_dir()?;
    let logos_dir = app_data_dir.join("logos");
    fs::create_dir_all(&logos_dir)?;

    let source = PathBuf::from(logo_file_path);
    if !source.exists() {
        return Err(AppError::not_found(format!(
            "Logo file not found: {}",
            logo_file_path
        )));
    }

    let file_name = source
        .file_name()
        .ok_or_else(|| AppError::internal("Invalid file name"))?
        .to_string_lossy()
        .to_string();

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| AppError::internal(e.to_string()))?
        .as_millis();
    let dest_name = format!("{}_{}", timestamp, file_name);
    let dest = logos_dir.join(dest_name);

    fs::copy(&source, &dest)?;
    Ok(Some(dest.to_string_lossy().to_string()))
}
