use std::fs;
use std::path::PathBuf;

use sqlx::{Pool, Sqlite};
use tauri::{AppHandle, Manager};

pub type AppResult<T> = Result<T, String>;

pub const DEFAULT_CUSTOMER_ID_PREFIX: &str = "SSC-";
pub const DEFAULT_ORDER_ID_PREFIX: &str = "SSO-";
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
