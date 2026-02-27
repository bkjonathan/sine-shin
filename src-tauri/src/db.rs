use std::fs;
use std::path::PathBuf;

use sqlx::{Pool, Sqlite};
use tauri::{AppHandle, Manager};

pub type AppResult<T> = Result<T, String>;

pub const DEFAULT_CUSTOMER_ID_PREFIX: &str = "SSC-";
pub const DEFAULT_ORDER_ID_PREFIX: &str = "SSO-";
pub const DEFAULT_EXPENSE_ID_PREFIX: &str = "EXP-";
pub const ORDER_WITH_CUSTOMER_SELECT: &str = r#"
    SELECT
        o.*,
        c.name as customer_name,
        COALESCE(SUM(oi.price * oi.product_qty), 0) as total_price,
        COALESCE(SUM(oi.product_qty), 0) as total_qty,
        COALESCE(SUM(oi.product_weight), 0) as total_weight,
        (SELECT product_url FROM order_items WHERE order_id = o.id LIMIT 1) as first_product_url
    FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.id
    LEFT JOIN order_items oi ON o.id = oi.order_id
"#;
pub const ORDER_WITH_CUSTOMER_GROUP_BY: &str = " GROUP BY o.id ";

pub async fn init_db(pool: &Pool<Sqlite>) -> Result<(), Box<dyn std::error::Error>> {
    const INIT_SQL: &str = include_str!("../migrations/001_init.sql");

    for statement in INIT_SQL.split(';') {
        if !statement.trim().is_empty() {
            sqlx::query(statement).execute(pool).await?;
        }
    }

    let status_column_exists: Option<i64> = sqlx::query_scalar(
        "SELECT 1 FROM pragma_table_info('orders') WHERE name = 'status' LIMIT 1",
    )
    .fetch_optional(pool)
    .await?;

    if status_column_exists.is_none() {
        sqlx::query("ALTER TABLE orders ADD COLUMN status TEXT DEFAULT 'pending'")
            .execute(pool)
            .await?;
    }

    sqlx::query("UPDATE orders SET status = 'pending' WHERE status IS NULL OR TRIM(status) = ''")
        .execute(pool)
        .await?;

    let product_discount_column_exists: Option<i64> = sqlx::query_scalar(
        "SELECT 1 FROM pragma_table_info('orders') WHERE name = 'product_discount' LIMIT 1",
    )
    .fetch_optional(pool)
    .await?;

    if product_discount_column_exists.is_none() {
        sqlx::query("ALTER TABLE orders ADD COLUMN product_discount REAL DEFAULT 0")
            .execute(pool)
            .await?;
    }

    sqlx::query("UPDATE orders SET product_discount = 0 WHERE product_discount IS NULL")
        .execute(pool)
        .await?;

    // Add fee_paid tracking columns
    let fee_paid_columns = [
        "shipping_fee_paid",
        "delivery_fee_paid",
        "cargo_fee_paid",
        "service_fee_paid",
        "shipping_fee_by_shop",
        "delivery_fee_by_shop",
        "cargo_fee_by_shop",
        "exclude_cargo_fee",
    ];

    for col in fee_paid_columns {
        let exists: Option<i64> = sqlx::query_scalar(&format!(
            "SELECT 1 FROM pragma_table_info('orders') WHERE name = '{}' LIMIT 1",
            col
        ))
        .fetch_optional(pool)
        .await?;

        if exists.is_none() {
            sqlx::query(&format!(
                "ALTER TABLE orders ADD COLUMN {} INTEGER DEFAULT 0",
                col
            ))
            .execute(pool)
            .await?;
        }
    }

    sqlx::query("UPDATE orders SET shipping_fee_paid = 0 WHERE shipping_fee_paid IS NULL")
        .execute(pool)
        .await?;
    sqlx::query("UPDATE orders SET delivery_fee_paid = 0 WHERE delivery_fee_paid IS NULL")
        .execute(pool)
        .await?;
    sqlx::query("UPDATE orders SET cargo_fee_paid = 0 WHERE cargo_fee_paid IS NULL")
        .execute(pool)
        .await?;
    sqlx::query("UPDATE orders SET service_fee_paid = 0 WHERE service_fee_paid IS NULL")
        .execute(pool)
        .await?;
    sqlx::query("UPDATE orders SET shipping_fee_by_shop = 0 WHERE shipping_fee_by_shop IS NULL")
        .execute(pool)
        .await?;
    sqlx::query("UPDATE orders SET delivery_fee_by_shop = 0 WHERE delivery_fee_by_shop IS NULL")
        .execute(pool)
        .await?;
    sqlx::query("UPDATE orders SET cargo_fee_by_shop = 0 WHERE cargo_fee_by_shop IS NULL")
        .execute(pool)
        .await?;
    sqlx::query("UPDATE orders SET exclude_cargo_fee = 0 WHERE exclude_cargo_fee IS NULL")
        .execute(pool)
        .await?;

    // ── Sync tables ──────────────────────────────────────────────────
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS sync_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            supabase_url TEXT NOT NULL,
            supabase_anon_key TEXT NOT NULL,
            supabase_service_key TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            sync_enabled INTEGER DEFAULT 1,
            sync_interval INTEGER DEFAULT 30,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )"
    ).execute(pool).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS sync_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_name TEXT NOT NULL,
            operation TEXT NOT NULL CHECK(operation IN ('INSERT','UPDATE','DELETE')),
            record_id INTEGER NOT NULL,
            payload TEXT NOT NULL,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending','syncing','synced','failed')),
            retry_count INTEGER DEFAULT 0,
            error_message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            synced_at DATETIME
        )"
    ).execute(pool).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS sync_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            finished_at DATETIME,
            total_queued INTEGER DEFAULT 0,
            total_synced INTEGER DEFAULT 0,
            total_failed INTEGER DEFAULT 0,
            status TEXT DEFAULT 'running' CHECK(status IN ('running','completed','failed'))
        )"
    ).execute(pool).await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status)")
        .execute(pool).await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_sync_queue_table ON sync_queue(table_name)")
        .execute(pool).await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_sync_queue_created ON sync_queue(created_at)")
        .execute(pool).await?;

    // ── Add updated_at, deleted_at, synced columns to existing tables ──
    // NOTE: SQLite does not allow non-constant defaults (like CURRENT_TIMESTAMP)
    // in ALTER TABLE ADD COLUMN, so we add columns without defaults and backfill.
    let alter_columns: Vec<(&str, &str, &str)> = vec![
        ("customers", "updated_at", "DATETIME"),
        ("customers", "deleted_at", "DATETIME"),
        ("customers", "synced", "INTEGER DEFAULT 0"),
        ("orders", "updated_at", "DATETIME"),
        ("orders", "deleted_at", "DATETIME"),
        ("orders", "synced", "INTEGER DEFAULT 0"),
        ("order_items", "updated_at", "DATETIME"),
        ("order_items", "deleted_at", "DATETIME"),
        ("order_items", "synced", "INTEGER DEFAULT 0"),
        ("expenses", "updated_at", "DATETIME"),
        ("expenses", "deleted_at", "DATETIME"),
        ("expenses", "synced", "INTEGER DEFAULT 0"),
        ("shop_settings", "updated_at", "DATETIME"),
        ("shop_settings", "synced", "INTEGER DEFAULT 0"),
        ("users", "master_password_hash", "TEXT"),
        ("sync_config", "sync_interval", "INTEGER DEFAULT 30"),
    ];

    for (table, col, col_type) in alter_columns {
        let exists: Option<i64> = sqlx::query_scalar(&format!(
            "SELECT 1 FROM pragma_table_info('{}') WHERE name = '{}' LIMIT 1",
            table, col
        ))
        .fetch_optional(pool)
        .await?;

        if exists.is_none() {
            sqlx::query(&format!(
                "ALTER TABLE {} ADD COLUMN {} {}",
                table, col, col_type
            ))
            .execute(pool)
            .await?;
        }
    }

    // Backfill updated_at for existing rows where it's NULL
    for table in &["customers", "orders", "order_items", "expenses", "shop_settings"] {
        sqlx::query(&format!(
            "UPDATE {} SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL",
            table
        ))
        .execute(pool)
        .await?;
    }

    Ok(())
}

pub fn copy_logo_to_app_data(app: &AppHandle, logo_file_path: &str) -> AppResult<Option<String>> {
    if logo_file_path.is_empty() {
        return Ok(None);
    }

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let logos_dir = app_data_dir.join("logos");
    fs::create_dir_all(&logos_dir).map_err(|e| format!("Failed to create logos dir: {}", e))?;

    let source = PathBuf::from(logo_file_path);
    if !source.exists() {
        return Err(format!("Logo file not found: {}", logo_file_path));
    }

    let file_name = source
        .file_name()
        .ok_or("Invalid file name")?
        .to_string_lossy()
        .to_string();

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let dest_name = format!("{}_{}", timestamp, file_name);
    let dest = logos_dir.join(dest_name);

    fs::copy(&source, &dest).map_err(|e| format!("Failed to copy logo: {}", e))?;
    Ok(Some(dest.to_string_lossy().to_string()))
}
