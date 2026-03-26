use std::sync::Arc;

use sea_orm::{ConnectionTrait, FromQueryResult, Statement};
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
    let trimmed_title = title.trim().to_string();
    if trimmed_title.is_empty() {
        return Err(AppError::invalid_input("Expense title is required"));
    }
    if !amount.is_finite() || amount < 0.0 {
        return Err(AppError::invalid_input(
            "Expense amount must be a valid non-negative number",
        ));
    }

    let backend = state.db.as_ref().get_database_backend();
    let sanitized_category = sanitize_optional(category);
    let sanitized_expense_date = sanitize_optional(expense_date);
    let sanitized_payment_method = sanitize_optional(payment_method);
    let sanitized_notes = sanitize_optional(notes);
    let sanitized_expense_id = sanitize_optional(expense_id);

    let new_id = id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();

    state
        .db
        .execute(Statement::from_sql_and_values(
            backend,
            "INSERT INTO expenses (id, title, amount, category, expense_date, payment_method, notes, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            [
                new_id.clone().into(),
                trimmed_title.into(),
                amount.into(),
                sanitized_category.into(),
                sanitized_expense_date.into(),
                sanitized_payment_method.into(),
                sanitized_notes.into(),
                now.clone().into(),
            ],
        ))
        .await?;

    // Get count for sequence number
    #[derive(FromQueryResult)]
    struct CountRow {
        count: i64,
    }
    let count = CountRow::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT COUNT(*) as count FROM expenses",
        [],
    ))
    .one(state.db.as_ref())
    .await
    .ok()
    .flatten()
    .map(|r| r.count)
    .unwrap_or(1);

    let final_expense_id = sanitized_expense_id
        .unwrap_or_else(|| format!("{}{:05}", DEFAULT_EXPENSE_ID_PREFIX, count));

    let _ = state
        .db
        .execute(Statement::from_sql_and_values(
            backend,
            "UPDATE expenses SET expense_id = $1 WHERE id = $2",
            [final_expense_id.into(), new_id.clone().into()],
        ))
        .await;

    if let Ok(Some(record)) = Expense::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT id, expense_id, title, amount, category, payment_method, notes, expense_date, created_at, updated_at, deleted_at FROM expenses WHERE id = $1",
        [new_id.clone().into()],
    ))
    .one(state.db.as_ref())
    .await
    {
        enqueue_sync(
            state.db.as_ref(),
            app,
            "expenses",
            "INSERT",
            &new_id,
            serde_json::json!(record),
        )
        .await;
    }

    Ok(new_id)
}

/// Loads all expenses sorted by date and id.
#[instrument(skip(state))]
pub async fn get_expenses(state: Arc<AppState>) -> AppResult<Vec<Expense>> {
    let backend = state.db.as_ref().get_database_backend();
    let expenses = Expense::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT id, expense_id, title, amount, category, payment_method, notes, expense_date, created_at, updated_at, deleted_at FROM expenses ORDER BY created_at DESC, id DESC",
        [],
    ))
    .all(state.db.as_ref())
    .await?;

    Ok(expenses)
}

/// Loads paginated expense list with filters.
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
    let backend = state.db.as_ref().get_database_backend();

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
        "expense_id" => "id",
        _ => "COALESCE(expense_date, created_at)",
    };

    let sort_direction = match sort_order.as_deref().unwrap_or("desc") {
        "asc" => "ASC",
        "desc" => "DESC",
        _ => "DESC",
    };

    // Build WHERE conditions
    let mut conditions = Vec::new();
    let mut params: Vec<sea_orm::Value> = Vec::new();
    let mut param_idx = 1usize;

    if has_search {
        conditions.push(format!(
            "COALESCE({}, '') LIKE ${}",
            search_column, param_idx
        ));
        params.push(search_pattern.into());
        param_idx += 1;
    }

    if let Some(cat) = normalized_category_filter.as_ref() {
        conditions.push(format!(
            "LOWER(COALESCE(category, '')) = LOWER(${})",
            param_idx
        ));
        params.push(cat.clone().into());
        param_idx += 1;
    }

    if let Some(df) = normalized_date_from.as_ref() {
        conditions.push(format!(
            "DATE(COALESCE(expense_date, created_at)) >= DATE(${})",
            param_idx
        ));
        params.push(df.clone().into());
        param_idx += 1;
    }

    if let Some(dt) = normalized_date_to.as_ref() {
        conditions.push(format!(
            "DATE(COALESCE(expense_date, created_at)) <= DATE(${})",
            param_idx
        ));
        params.push(dt.clone().into());
        param_idx += 1;
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    let count_sql = format!("SELECT COUNT(*) as count FROM expenses {}", where_clause);

    #[derive(FromQueryResult)]
    struct CountRow {
        count: i64,
    }

    let total = CountRow::find_by_statement(Statement::from_sql_and_values(
        backend,
        &count_sql,
        params.clone(),
    ))
    .one(state.db.as_ref())
    .await?
    .map(|r| r.count)
    .unwrap_or(0);

    let data_sql = if no_limit {
        format!(
            "SELECT id, expense_id, title, amount, category, payment_method, notes, expense_date, created_at, updated_at, deleted_at FROM expenses {} ORDER BY {} {}, id {}",
            where_clause, sort_column, sort_direction, sort_direction
        )
    } else {
        let limit_idx = param_idx;
        let offset_idx = param_idx + 1;
        format!(
            "SELECT id, expense_id, title, amount, category, payment_method, notes, expense_date, created_at, updated_at, deleted_at FROM expenses {} ORDER BY {} {}, id {} LIMIT ${} OFFSET ${}",
            where_clause, sort_column, sort_direction, sort_direction, limit_idx, offset_idx
        )
    };

    let expenses = if no_limit {
        Expense::find_by_statement(Statement::from_sql_and_values(
            backend,
            &data_sql,
            params,
        ))
        .all(state.db.as_ref())
        .await?
    } else {
        let mut data_params = params;
        data_params.push(page_size.into());
        data_params.push(offset.into());
        Expense::find_by_statement(Statement::from_sql_and_values(
            backend,
            &data_sql,
            data_params,
        ))
        .all(state.db.as_ref())
        .await?
    };

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
    let backend = state.db.as_ref().get_database_backend();
    let expense = Expense::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT id, expense_id, title, amount, category, payment_method, notes, expense_date, created_at, updated_at, deleted_at FROM expenses WHERE id = $1",
        [id.into()],
    ))
    .one(state.db.as_ref())
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
    let trimmed_title = title.trim().to_string();
    if trimmed_title.is_empty() {
        return Err(AppError::invalid_input("Expense title is required"));
    }
    if !amount.is_finite() || amount < 0.0 {
        return Err(AppError::invalid_input(
            "Expense amount must be a valid non-negative number",
        ));
    }

    let backend = state.db.as_ref().get_database_backend();
    let now = chrono::Utc::now().to_rfc3339();

    state
        .db
        .execute(Statement::from_sql_and_values(
            backend,
            "UPDATE expenses SET title = $1, amount = $2, category = $3, expense_date = $4, payment_method = $5, notes = $6, updated_at = $7 WHERE id = $8",
            [
                trimmed_title.into(),
                amount.into(),
                sanitize_optional(category).into(),
                sanitize_optional(expense_date).into(),
                sanitize_optional(payment_method).into(),
                sanitize_optional(notes).into(),
                now.into(),
                id.clone().into(),
            ],
        ))
        .await?;

    if let Ok(Some(record)) = Expense::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT id, expense_id, title, amount, category, payment_method, notes, expense_date, created_at, updated_at, deleted_at FROM expenses WHERE id = $1",
        [id.clone().into()],
    ))
    .one(state.db.as_ref())
    .await
    {
        enqueue_sync(
            state.db.as_ref(),
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
pub async fn delete_expense(
    state: Arc<AppState>,
    app: &AppHandle,
    id: String,
) -> AppResult<()> {
    let backend = state.db.as_ref().get_database_backend();
    let now = chrono::Utc::now().to_rfc3339();

    state
        .db
        .execute(Statement::from_sql_and_values(
            backend,
            "UPDATE expenses SET deleted_at = $1, updated_at = $2 WHERE id = $3",
            [now.clone().into(), now.into(), id.clone().into()],
        ))
        .await?;

    if let Ok(Some(record)) = Expense::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT id, expense_id, title, amount, category, payment_method, notes, expense_date, created_at, updated_at, deleted_at FROM expenses WHERE id = $1",
        [id.clone().into()],
    ))
    .one(state.db.as_ref())
    .await
    {
        enqueue_sync(
            state.db.as_ref(),
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
