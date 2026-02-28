use tauri::{AppHandle, Manager};

use crate::models::AccountSummary;
use crate::state::AppDb;

#[derive(Debug, serde::Deserialize, sqlx::FromRow)]
struct IncomeRow {
    total_income: f64,
    total_orders: i64,
}

#[derive(Debug, serde::Deserialize, sqlx::FromRow)]
struct ExpenseRow {
    total_expenses: f64,
    total_records: i64,
}

#[tauri::command]
pub async fn get_account_summary(
    app: AppHandle,
    date_from: Option<String>,
    date_to: Option<String>,
) -> Result<AccountSummary, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let has_range = date_from.is_some() && date_to.is_some();
    let df = date_from.unwrap_or_default();
    let dt = date_to.unwrap_or_default();

    let mut orders_date_filter = String::new();
    let mut expenses_date_filter = String::new();

    if has_range {
        orders_date_filter = format!(
            " AND date(COALESCE(o.order_date, o.created_at)) >= '{}' AND date(COALESCE(o.order_date, o.created_at)) <= '{}'",
            df, dt
        );
        expenses_date_filter = format!(
            " AND date(COALESCE(expense_date, created_at)) >= '{}' AND date(COALESCE(expense_date, created_at)) <= '{}'",
            df, dt
        );
    }

    // Total income from orders: service fee amount + product discount
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
            ), 0) as total_income,
            COUNT(DISTINCT o.id) as total_orders
        FROM orders o
        LEFT JOIN (
            SELECT order_id, COALESCE(SUM(price * product_qty), 0) as total_price
            FROM order_items
            GROUP BY order_id
        ) agg ON agg.order_id = o.id
        WHERE o.deleted_at IS NULL{}
        "#,
        orders_date_filter
    );

    let income_all: IncomeRow = sqlx::query_as(&income_all_query)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    // This month income
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
            ), 0) as total_income,
            COUNT(DISTINCT o.id) as total_orders
        FROM orders o
        LEFT JOIN (
            SELECT order_id, COALESCE(SUM(price * product_qty), 0) as total_price
            FROM order_items
            GROUP BY order_id
        ) agg ON agg.order_id = o.id
        WHERE o.deleted_at IS NULL
          AND strftime('%Y-%m', COALESCE(o.order_date, o.created_at)) = strftime('%Y-%m', 'now')
        "#,
    )
    .fetch_one(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // Total expenses
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

    let expense_all: ExpenseRow = sqlx::query_as(&expense_all_query)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    // This month expenses
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
    .await
    .map_err(|e| e.to_string())?;

    Ok(AccountSummary {
        total_income: income_all.total_income,
        total_expenses: expense_all.total_expenses,
        net_balance: income_all.total_income - expense_all.total_expenses,
        total_orders: income_all.total_orders,
        total_expense_records: expense_all.total_records,
        this_month_income: income_month.total_income,
        this_month_expenses: expense_month.total_expenses,
    })
}
