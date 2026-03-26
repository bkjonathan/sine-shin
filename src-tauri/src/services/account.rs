use std::sync::Arc;

use chrono::{Datelike, NaiveDate};
use sea_orm::{ConnectionTrait, FromQueryResult, Statement};
use tracing::instrument;

use crate::error::{AppError, AppResult};
use crate::models::AccountSummary;
use crate::state::AppState;

#[derive(Debug, FromQueryResult)]
struct IncomeRow {
    total_income: f64,
    total_orders: i64,
    total_service_fee: f64,
    total_product_discount: f64,
    total_cargo_fee: f64,
}

#[derive(Debug, FromQueryResult)]
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
    let db = state.db.lock().await.clone();
    let backend = db.get_database_backend();
    let date_range = normalize_date_range(date_from, date_to)?;
    let current_month = current_month_bounds()?;

    let mut orders_date_filter = String::new();
    let mut expenses_date_filter = String::new();
    if let Some((df, dt)) = date_range {
        orders_date_filter = format!(
            " AND COALESCE(o.order_date, DATE(o.created_at)) >= '{df}' \
              AND COALESCE(o.order_date, DATE(o.created_at)) <= '{dt}'",
        );
        expenses_date_filter = format!(
            " AND COALESCE(expense_date, DATE(created_at)) >= '{df}' \
              AND COALESCE(expense_date, DATE(created_at)) <= '{dt}'",
        );
    }

    let income_all_sql = format!(
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
            FROM order_items WHERE deleted_at IS NULL GROUP BY order_id
        ) agg ON agg.order_id = o.id
        WHERE o.deleted_at IS NULL{}
        "#,
        orders_date_filter
    );

    let income_all = IncomeRow::find_by_statement(Statement::from_string(backend, income_all_sql))
        .one(&db)
        .await?
        .unwrap_or(IncomeRow {
            total_income: 0.0,
            total_orders: 0,
            total_service_fee: 0.0,
            total_product_discount: 0.0,
            total_cargo_fee: 0.0,
        });

    let income_month = IncomeRow::find_by_statement(Statement::from_string(
        backend,
        format!(
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
            FROM order_items WHERE deleted_at IS NULL GROUP BY order_id
        ) agg ON agg.order_id = o.id
        WHERE o.deleted_at IS NULL
          AND COALESCE(o.order_date, DATE(o.created_at)) >= '{}'
          AND COALESCE(o.order_date, DATE(o.created_at)) <= '{}'
        "#,
            current_month.0, current_month.1
        ),
    ))
    .one(&db)
    .await?
    .unwrap_or(IncomeRow {
        total_income: 0.0,
        total_orders: 0,
        total_service_fee: 0.0,
        total_product_discount: 0.0,
        total_cargo_fee: 0.0,
    });

    let expense_all = ExpenseRow::find_by_statement(Statement::from_string(
        backend,
        format!(
            "SELECT CAST(COALESCE(SUM(amount), 0) AS REAL) as total_expenses, COUNT(*) as total_records \
             FROM expenses WHERE deleted_at IS NULL{}",
            expenses_date_filter
        ),
    ))
    .one(&db)
    .await?
    .unwrap_or(ExpenseRow {
        total_expenses: 0.0,
        total_records: 0,
    });

    let expense_month = ExpenseRow::find_by_statement(Statement::from_string(
        backend,
        format!(
            "SELECT CAST(COALESCE(SUM(amount), 0) AS REAL) as total_expenses, COUNT(*) as total_records \
         FROM expenses WHERE deleted_at IS NULL \
         AND COALESCE(expense_date, DATE(created_at)) >= '{}' \
         AND COALESCE(expense_date, DATE(created_at)) <= '{}'",
            current_month.0, current_month.1
        ),
    ))
    .one(&db)
    .await?
    .unwrap_or(ExpenseRow {
        total_expenses: 0.0,
        total_records: 0,
    });

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

fn current_month_bounds() -> AppResult<(String, String)> {
    let today = chrono::Utc::now().date_naive();
    let first_day = today
        .with_day(1)
        .ok_or_else(|| AppError::internal("Failed to compute current month start"))?;
    let next_month = if first_day.month() == 12 {
        NaiveDate::from_ymd_opt(first_day.year() + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(first_day.year(), first_day.month() + 1, 1)
    }
    .ok_or_else(|| AppError::internal("Failed to compute next month"))?;
    let last_day = next_month
        .pred_opt()
        .ok_or_else(|| AppError::internal("Failed to compute current month end"))?;

    Ok((
        first_day.format("%Y-%m-%d").to_string(),
        last_day.format("%Y-%m-%d").to_string(),
    ))
}
