use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

pub mod helpers;

pub const DEFAULT_CUSTOMER_ID_PREFIX: &str = "SSC-";
pub const DEFAULT_ORDER_ID_PREFIX: &str = "SSO-";
pub const DEFAULT_EXPENSE_ID_PREFIX: &str = "EXP-";

// The complex ORDER_WITH_CUSTOMER_SELECT stays as a constant for raw queries
pub const ORDER_WITH_CUSTOMER_SELECT: &str = r#"
    SELECT
        o.*,
        c.name as customer_name,
        CAST(COALESCE(SUM(oi.price * oi.product_qty), 0) AS REAL) as total_price,
        CAST(COALESCE(SUM(oi.product_qty), 0) AS INTEGER) as total_qty,
        CAST(COALESCE(SUM(oi.product_weight), 0) AS REAL) as total_weight,
        (SELECT product_url FROM order_items WHERE order_id = o.id AND deleted_at IS NULL LIMIT 1) as first_product_url
    FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.id
    LEFT JOIN order_items oi ON o.id = oi.order_id AND oi.deleted_at IS NULL
"#;
pub const ORDER_WITH_CUSTOMER_GROUP_BY: &str = " GROUP BY o.id ";

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
