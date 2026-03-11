use std::sync::Arc;

use chrono::NaiveDate;
use tracing::instrument;

use crate::error::{AppError, AppResult};
use crate::models::AccountSummary;
use crate::state::AppState;

#[derive(Debug, serde::Deserialize, sqlx::FromRow)]
struct IncomeRow {
    total_income: f64,
    total_orders: i64,
    total_service_fee: f64,
    total_product_discount: f64,
    total_cargo_fee: f64,
}

#[derive(Debug, serde::Deserialize, sqlx::FromRow)]
struct ExpenseRow {
    total_expenses: f64,
    total_records: i64,
}

/// Computes account summary with optional inclusive date range filters.
#[instrument(skip(state))]
pub async fn get_account_summary(
    state: Arc<AppState>,
    date_from: Option<String>,
    date_to: Option<String>,
) -> AppResult<AccountSummary> {
    let pool = state.db.lock().await;
    let date_range = normalize_date_range(date_from, date_to)?;

    let mut orders_date_filter = String::new();
    let mut expenses_date_filter = String::new();
    if let Some((df, dt)) = date_range {
        orders_date_filter = format!(
            " AND date(COALESCE(o.order_date, o.created_at)) >= '{df}' AND date(COALESCE(o.order_date, o.created_at)) <= '{dt}'",
        );
        expenses_date_filter = format!(
            " AND date(COALESCE(expense_date, created_at)) >= '{df}' AND date(COALESCE(expense_date, created_at)) <= '{dt}'",
        );
    }

    let income_all_query = format!(
        r#"
        SELECT
            COALESCE(SUM(
                CASE
                    WHEN o.service_fee_type = 'percent'
                    THEN (COALESCE(agg.total_price, 0) * COALESCE(o.service_fee, 0) / 100.0)
                    ELSE COALESCE(o.service_fee, 0)
                END
                + COALESCE(o.product_discount, 0)
                + CASE WHEN o.exclude_cargo_fee != 1 THEN COALESCE(o.cargo_fee, 0) ELSE 0 END
            ), 0) as total_income,
            COUNT(DISTINCT o.id) as total_orders,
            COALESCE(SUM(
                CASE
                    WHEN o.service_fee_type = 'percent'
                    THEN (COALESCE(agg.total_price, 0) * COALESCE(o.service_fee, 0) / 100.0)
                    ELSE COALESCE(o.service_fee, 0)
                END
            ), 0) as total_service_fee,
            COALESCE(SUM(o.product_discount), 0) as total_product_discount,
            COALESCE(SUM(CASE WHEN o.exclude_cargo_fee != 1 THEN COALESCE(o.cargo_fee, 0) ELSE 0 END), 0) as total_cargo_fee
        FROM orders o
        LEFT JOIN (
            SELECT order_id, COALESCE(SUM(price * product_qty), 0) as total_price
            FROM order_items
            WHERE deleted_at IS NULL
            GROUP BY order_id
        ) agg ON agg.order_id = o.id
        WHERE o.deleted_at IS NULL{}
        "#,
        orders_date_filter
    );

    let income_all: IncomeRow = sqlx::query_as(&income_all_query).fetch_one(&*pool).await?;

    let income_month: IncomeRow = sqlx::query_as(
        r#"
        SELECT
            COALESCE(SUM(
                CASE
                    WHEN o.service_fee_type = 'percent'
                    THEN (COALESCE(agg.total_price, 0) * COALESCE(o.service_fee, 0) / 100.0)
                    ELSE COALESCE(o.service_fee, 0)
                END
                + COALESCE(o.product_discount, 0)
                + CASE WHEN o.exclude_cargo_fee != 1 THEN COALESCE(o.cargo_fee, 0) ELSE 0 END
            ), 0) as total_income,
            COUNT(DISTINCT o.id) as total_orders,
            COALESCE(SUM(
                CASE
                    WHEN o.service_fee_type = 'percent'
                    THEN (COALESCE(agg.total_price, 0) * COALESCE(o.service_fee, 0) / 100.0)
                    ELSE COALESCE(o.service_fee, 0)
                END
            ), 0) as total_service_fee,
            COALESCE(SUM(o.product_discount), 0) as total_product_discount,
            COALESCE(SUM(CASE WHEN o.exclude_cargo_fee != 1 THEN COALESCE(o.cargo_fee, 0) ELSE 0 END), 0) as total_cargo_fee
        FROM orders o
        LEFT JOIN (
            SELECT order_id, COALESCE(SUM(price * product_qty), 0) as total_price
            FROM order_items
            WHERE deleted_at IS NULL
            GROUP BY order_id
        ) agg ON agg.order_id = o.id
        WHERE o.deleted_at IS NULL
          AND strftime('%Y-%m', COALESCE(o.order_date, o.created_at)) = strftime('%Y-%m', 'now')
        "#,
    )
    .fetch_one(&*pool)
    .await?;

    let expense_all_query = format!(
        r#"
        SELECT
            COALESCE(SUM(amount), 0) as total_expenses,
            COUNT(*) as total_records
        FROM expenses
        WHERE deleted_at IS NULL{}
        "#,
        expenses_date_filter
    );

    let expense_all: ExpenseRow = sqlx::query_as(&expense_all_query).fetch_one(&*pool).await?;

    let expense_month: ExpenseRow = sqlx::query_as(
        r#"
        SELECT
            COALESCE(SUM(amount), 0) as total_expenses,
            COUNT(*) as total_records
        FROM expenses
        WHERE deleted_at IS NULL
          AND strftime('%Y-%m', COALESCE(expense_date, created_at)) = strftime('%Y-%m', 'now')
        "#,
    )
    .fetch_one(&*pool)
    .await?;

    Ok(AccountSummary {
        total_income: income_all.total_income,
        total_expenses: expense_all.total_expenses,
        net_balance: income_all.total_income - expense_all.total_expenses,
        total_orders: income_all.total_orders,
        total_expense_records: expense_all.total_records,
        this_month_income: income_month.total_income,
        this_month_expenses: expense_month.total_expenses,
        total_service_fee: income_all.total_service_fee,
        total_product_discount: income_all.total_product_discount,
        total_cargo_fee: income_all.total_cargo_fee,
    })
}

fn normalize_date_range(
    date_from: Option<String>,
    date_to: Option<String>,
) -> AppResult<Option<(String, String)>> {
    match (date_from, date_to) {
        (Some(df), Some(dt)) => {
            let from = parse_ymd(df.trim())?;
            let to = parse_ymd(dt.trim())?;
            Ok(Some((from, to)))
        }
        (None, None) => Ok(None),
        _ => Err(AppError::invalid_input(
            "Both date_from and date_to must be provided together",
        )),
    }
}

fn parse_ymd(value: &str) -> AppResult<String> {
    let parsed = NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| AppError::invalid_input("Date must be in YYYY-MM-DD format"))?;
    Ok(parsed.format("%Y-%m-%d").to_string())
}
