use std::sync::Arc;

use sqlx::{Any, QueryBuilder};
use tauri::AppHandle;
use tracing::instrument;
use uuid::Uuid;

use crate::db::DEFAULT_EXPENSE_ID_PREFIX;
use crate::error::{AppError, AppResult};
use crate::models::{Expense, PaginatedExpenses};
use crate::state::AppState;
use crate::sync::enqueue_sync;

const DEFAULT_EXPENSES_PAGE_SIZE: i64 = 10;
const MIN_EXPENSES_PAGE_SIZE: i64 = 5;
const MAX_EXPENSES_PAGE_SIZE: i64 = 100;

fn sanitize_optional(value: Option<String>) -> Option<String> {
    value
        .map(|raw| raw.trim().to_string())
        .filter(|trimmed| !trimmed.is_empty())
}

/// Creates an expense and enqueues sync payload.
#[instrument(skip(state, app))]
#[allow(clippy::too_many_arguments)]
pub async fn create_expense(
    state: Arc<AppState>,
    app: &AppHandle,
    title: String,
    amount: f64,
    category: Option<String>,
    expense_date: Option<String>,
    payment_method: Option<String>,
    notes: Option<String>,
    id: Option<String>,
    expense_id: Option<String>,
) -> AppResult<String> {
    let trimmed_title = title.trim();
    if trimmed_title.is_empty() {
        return Err(AppError::invalid_input("Expense title is required"));
    }
    if !amount.is_finite() || amount < 0.0 {
        return Err(AppError::invalid_input(
            "Expense amount must be a valid non-negative number",
        ));
    }

    let pool = state.db.lock().await;
    let d = state.dialect();
    let record_id = id.unwrap_or_else(|| Uuid::new_v4().to_string());

    let sanitized_category = sanitize_optional(category);
    let sanitized_expense_date = sanitize_optional(expense_date);
    let sanitized_payment_method = sanitize_optional(payment_method);
    let sanitized_notes = sanitize_optional(notes);
    let sanitized_expense_id = sanitize_optional(expense_id);

    let insert_sql = format!(
        "INSERT INTO expenses (id, title, amount, category, expense_date, payment_method, notes) \
         VALUES ({}, {}, {}, {}, {}, {}, {})",
        d.p(1), d.p(2), d.p(3), d.p(4), d.p(5), d.p(6), d.p(7)
    );

    let rowid = d.query(&insert_sql)
        .bind(&record_id)
        .bind(trimmed_title)
        .bind(amount)
        .bind(sanitized_category)
        .bind(sanitized_expense_date)
        .bind(sanitized_payment_method)
        .bind(sanitized_notes)
        .execute(&*pool)
        .await?
        .last_insert_id();

    let seq_num: i64 = if d.is_postgres() {
        d.query_scalar("SELECT COUNT(*) FROM expenses")
            .fetch_one(&*pool)
            .await
            .unwrap_or(1)
    } else {
        rowid.unwrap_or(0) as i64
    };

    let final_expense_id = sanitized_expense_id
        .unwrap_or_else(|| format!("{}{:05}", DEFAULT_EXPENSE_ID_PREFIX, seq_num));

    let update_id_sql = format!(
        "UPDATE expenses SET expense_id = {} WHERE id = {}",
        d.p(1), d.p(2)
    );
    d.query(&update_id_sql)
        .bind(final_expense_id)
        .bind(&record_id)
        .execute(&*pool)
        .await?;

    let select_sql = format!("SELECT * FROM expenses WHERE id = {}", d.p(1));
    if let Ok(record) = d.query_as::<Expense>(&select_sql)
        .bind(&record_id)
        .fetch_one(&*pool)
        .await
    {
        enqueue_sync(
            &pool,
            app,
            "expenses",
            "INSERT",
            &record_id,
            serde_json::json!(record),
        )
        .await;
    }

    Ok(record_id)
}

/// Loads all expenses sorted by date and created_at.
#[instrument(skip(state))]
pub async fn get_expenses(state: Arc<AppState>) -> AppResult<Vec<Expense>> {
    let pool = state.db.lock().await;
    let d = state.dialect();

    let expenses = d.query_as::<Expense>("SELECT * FROM expenses ORDER BY created_at DESC")
        .fetch_all(&*pool)
        .await?;

    Ok(expenses)
}

/// Loads paginated expense list with filters.
/// Uses QueryBuilder<Any> which handles placeholder translation automatically.
#[instrument(skip(state))]
#[allow(clippy::too_many_arguments)]
pub async fn get_expenses_paginated(
    state: Arc<AppState>,
    page: Option<i64>,
    page_size: Option<i64>,
    search_key: Option<String>,
    search_term: Option<String>,
    category_filter: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
    sort_by: Option<String>,
    sort_order: Option<String>,
) -> AppResult<PaginatedExpenses> {
    let pool = state.db.lock().await;

    let requested_page_size = page_size.unwrap_or(DEFAULT_EXPENSES_PAGE_SIZE);
    let no_limit = requested_page_size <= 0;
    let page_size = if no_limit {
        DEFAULT_EXPENSES_PAGE_SIZE
    } else {
        requested_page_size.clamp(MIN_EXPENSES_PAGE_SIZE, MAX_EXPENSES_PAGE_SIZE)
    };
    let page = if no_limit {
        1
    } else {
        page.unwrap_or(1).max(1)
    };
    let offset = if no_limit { 0 } else { (page - 1) * page_size };

    let raw_search = search_term.unwrap_or_default().trim().to_string();
    let has_search = !raw_search.is_empty();
    let search_pattern = format!("%{}%", raw_search);

    let normalized_category_filter =
        sanitize_optional(category_filter).filter(|value| value.to_lowercase() != "all");
    let normalized_date_from = sanitize_optional(date_from);
    let normalized_date_to = sanitize_optional(date_to);

    let has_category_filter = normalized_category_filter.is_some();
    let has_date_from = normalized_date_from.is_some();
    let has_date_to = normalized_date_to.is_some();

    let search_column = match search_key.as_deref().unwrap_or("title") {
        "title" => "title",
        "expenseId" => "expense_id",
        "category" => "category",
        "paymentMethod" => "payment_method",
        _ => return Err(AppError::invalid_input("Invalid search key")),
    };

    let sort_column = match sort_by.as_deref().unwrap_or("expense_date") {
        "title" => "title",
        "amount" => "amount",
        "expense_date" => "COALESCE(expense_date, created_at)",
        "created_at" => "created_at",
        "expense_id" => "expense_id",
        _ => "COALESCE(expense_date, created_at)",
    };

    let sort_direction = match sort_order.as_deref().unwrap_or("desc") {
        "asc" => "ASC",
        "desc" => "DESC",
        _ => "DESC",
    };

    // QueryBuilder<Any> handles ?/$N placeholder translation automatically via push_bind
    let apply_filters = |query: &mut QueryBuilder<Any>| {
        let mut has_condition = false;

        if has_search {
            query.push("COALESCE(");
            query.push(search_column);
            query.push(", '') LIKE ");
            query.push_bind(search_pattern.clone());
            has_condition = true;
        }

        if let Some(category_value) = normalized_category_filter.as_ref() {
            if has_condition {
                query.push(" AND ");
            }
            query.push("LOWER(COALESCE(category, '')) = LOWER(");
            query.push_bind(category_value.clone());
            query.push(")");
            has_condition = true;
        }

        if let Some(date_from_value) = normalized_date_from.as_ref() {
            if has_condition {
                query.push(" AND ");
            }
            query.push("SUBSTR(COALESCE(expense_date, created_at, ''), 1, 10) >= SUBSTR(");
            query.push_bind(date_from_value.clone());
            query.push(", 1, 10)");
            has_condition = true;
        }

        if let Some(date_to_value) = normalized_date_to.as_ref() {
            if has_condition {
                query.push(" AND ");
            }
            query.push("SUBSTR(COALESCE(expense_date, created_at, ''), 1, 10) <= SUBSTR(");
            query.push_bind(date_to_value.clone());
            query.push(", 1, 10)");
        }
    };

    let mut count_query = QueryBuilder::<Any>::new("SELECT COUNT(*) FROM expenses");
    if has_search || has_category_filter || has_date_from || has_date_to {
        count_query.push(" WHERE ");
        apply_filters(&mut count_query);
    }

    let total: i64 = count_query.build_query_scalar().fetch_one(&*pool).await?;

    let mut data_query = QueryBuilder::<Any>::new("SELECT * FROM expenses");
    if has_search || has_category_filter || has_date_from || has_date_to {
        data_query.push(" WHERE ");
        apply_filters(&mut data_query);
    }

    data_query.push(" ORDER BY ");
    data_query.push(sort_column);
    data_query.push(" ");
    data_query.push(sort_direction);

    if !no_limit {
        data_query.push(" LIMIT ");
        data_query.push_bind(page_size);
        data_query.push(" OFFSET ");
        data_query.push_bind(offset);
    }

    let expenses = data_query
        .build_query_as::<Expense>()
        .fetch_all(&*pool)
        .await?;

    let response_page_size = if no_limit { total.max(0) } else { page_size };
    let total_pages = if total == 0 {
        0
    } else if no_limit {
        1
    } else {
        (total + page_size - 1) / page_size
    };

    Ok(PaginatedExpenses {
        expenses,
        total,
        page,
        page_size: response_page_size,
        total_pages,
    })
}

/// Loads one expense by id.
#[instrument(skip(state))]
pub async fn get_expense(state: Arc<AppState>, id: String) -> AppResult<Expense> {
    let pool = state.db.lock().await;
    let d = state.dialect();
    let sql = format!("SELECT * FROM expenses WHERE id = {}", d.p(1));
    let expense = d.query_as::<Expense>(&sql)
        .bind(&id)
        .fetch_optional(&*pool)
        .await?
        .ok_or_else(|| AppError::not_found("Expense not found"))?;

    Ok(expense)
}

/// Updates expense row and enqueues sync payload.
#[instrument(skip(state, app))]
#[allow(clippy::too_many_arguments)]
pub async fn update_expense(
    state: Arc<AppState>,
    app: &AppHandle,
    id: String,
    title: String,
    amount: f64,
    category: Option<String>,
    expense_date: Option<String>,
    payment_method: Option<String>,
    notes: Option<String>,
) -> AppResult<()> {
    let trimmed_title = title.trim();
    if trimmed_title.is_empty() {
        return Err(AppError::invalid_input("Expense title is required"));
    }
    if !amount.is_finite() || amount < 0.0 {
        return Err(AppError::invalid_input(
            "Expense amount must be a valid non-negative number",
        ));
    }

    let pool = state.db.lock().await;
    let d = state.dialect();

    let update_sql = format!(
        "UPDATE expenses SET \
         title = {}, amount = {}, category = {}, expense_date = {}, \
         payment_method = {}, notes = {}, updated_at = {} \
         WHERE id = {}",
        d.p(1), d.p(2), d.p(3), d.p(4), d.p(5), d.p(6), d.now(), d.p(7)
    );

    d.query(&update_sql)
        .bind(trimmed_title)
        .bind(amount)
        .bind(sanitize_optional(category))
        .bind(sanitize_optional(expense_date))
        .bind(sanitize_optional(payment_method))
        .bind(sanitize_optional(notes))
        .bind(&id)
        .execute(&*pool)
        .await?;

    let select_sql = format!("SELECT * FROM expenses WHERE id = {}", d.p(1));
    if let Ok(record) = d.query_as::<Expense>(&select_sql)
        .bind(&id)
        .fetch_one(&*pool)
        .await
    {
        enqueue_sync(
            &pool,
            app,
            "expenses",
            "UPDATE",
            &id,
            serde_json::json!(record),
        )
        .await;
    }

    Ok(())
}

/// Soft-deletes expense row and enqueues sync payload.
#[instrument(skip(state, app))]
pub async fn delete_expense(state: Arc<AppState>, app: &AppHandle, id: String) -> AppResult<()> {
    let pool = state.db.lock().await;
    let d = state.dialect();

    let delete_sql = format!(
        "UPDATE expenses SET deleted_at = {now}, updated_at = {now} WHERE id = {p1}",
        now = d.now(),
        p1 = d.p(1)
    );
    d.query(&delete_sql)
        .bind(&id)
        .execute(&*pool)
        .await?;

    let select_sql = format!("SELECT * FROM expenses WHERE id = {}", d.p(1));
    if let Ok(record) = d.query_as::<Expense>(&select_sql)
        .bind(&id)
        .fetch_one(&*pool)
        .await
    {
        enqueue_sync(
            &pool,
            app,
            "expenses",
            "DELETE",
            &id,
            serde_json::json!(record),
        )
        .await;
    }

    Ok(())
}
