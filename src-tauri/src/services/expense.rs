use std::sync::Arc;

use sea_orm::{ActiveModelTrait, ConnectionTrait, DatabaseBackend, EntityTrait, FromQueryResult, Set, Statement};
use tauri::AppHandle;
use tracing::instrument;
use uuid::Uuid;

use crate::db::DEFAULT_EXPENSE_ID_PREFIX;
use crate::entities::expenses;
use crate::error::{AppError, AppResult};
use crate::models::{Expense, PaginatedExpenses};
use crate::state::AppState;
use crate::sync::enqueue_sync;

const DEFAULT_EXPENSES_PAGE_SIZE: i64 = 10;
const MIN_EXPENSES_PAGE_SIZE: i64 = 5;
const MAX_EXPENSES_PAGE_SIZE: i64 = 100;

#[derive(Debug, FromQueryResult)]
struct CountRow {
    cnt: i64,
}

#[derive(Debug, FromQueryResult)]
struct RowIdRow {
    rowid: i64,
}

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

    let db = state.db.lock().await.clone();
    let record_id = id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let sanitized_expense_id = sanitize_optional(expense_id);

    expenses::ActiveModel {
        id: Set(record_id.clone()),
        title: Set(trimmed_title),
        amount: Set(amount),
        category: Set(sanitize_optional(category)),
        expense_date: Set(sanitize_optional(expense_date)),
        payment_method: Set(sanitize_optional(payment_method)),
        notes: Set(sanitize_optional(notes)),
        synced: Set(Some(0)),
        ..Default::default()
    }
    .insert(&db)
    .await?;

    let rowid = RowIdRow::find_by_statement(Statement::from_string(
        DatabaseBackend::Sqlite,
        "SELECT last_insert_rowid() as rowid".to_string(),
    ))
    .one(&db)
    .await?
    .map(|r| r.rowid)
    .unwrap_or(0);

    let final_expense_id = sanitized_expense_id
        .unwrap_or_else(|| format!("{}{:05}", DEFAULT_EXPENSE_ID_PREFIX, rowid));
    db.execute(Statement::from_sql_and_values(
        DatabaseBackend::Sqlite,
        "UPDATE expenses SET expense_id = ? WHERE id = ?",
        [final_expense_id.into(), record_id.clone().into()],
    ))
    .await?;

    if let Ok(Some(record)) = expenses::Entity::find_by_id(record_id.clone())
        .into_model::<Expense>()
        .one(&db)
        .await
    {
        let pool = state.pool.lock().await;
        enqueue_sync(&pool, app, "expenses", "INSERT", &record_id, serde_json::json!(record))
            .await;
    }

    Ok(record_id)
}

/// Loads all expenses sorted by created_at descending.
#[instrument(skip(state))]
pub async fn get_expenses(state: Arc<AppState>) -> AppResult<Vec<Expense>> {
    let db = state.db.lock().await.clone();
    let expenses = expenses::Entity::find()
        .into_model::<Expense>()
        .all(&db)
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
    let db = state.db.lock().await.clone();

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

    let normalized_category = sanitize_optional(category_filter)
        .filter(|v| v.to_lowercase() != "all");
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
        "expense_id" => "expense_id",
        _ => "COALESCE(expense_date, created_at)",
    };
    let sort_dir = if sort_order.as_deref() == Some("asc") {
        "ASC"
    } else {
        "DESC"
    };

    // Build WHERE conditions and parameter list
    let mut conditions: Vec<String> = vec![];
    let mut params: Vec<sea_orm::Value> = vec![];

    if has_search {
        conditions.push(format!("COALESCE({}, '') LIKE ?", search_column));
        params.push(search_pattern.into());
    }
    if let Some(cat) = normalized_category.as_ref() {
        conditions.push("LOWER(COALESCE(category, '')) = LOWER(?)".to_string());
        params.push(cat.clone().into());
    }
    if let Some(df) = normalized_date_from.as_ref() {
        conditions.push("DATE(COALESCE(expense_date, created_at)) >= DATE(?)".to_string());
        params.push(df.clone().into());
    }
    if let Some(dt) = normalized_date_to.as_ref() {
        conditions.push("DATE(COALESCE(expense_date, created_at)) <= DATE(?)".to_string());
        params.push(dt.clone().into());
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    let count_sql = format!("SELECT COUNT(*) as cnt FROM expenses {}", where_clause);
    let total = CountRow::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Sqlite,
        &count_sql,
        params.clone(),
    ))
    .one(&db)
    .await?
    .unwrap_or(CountRow { cnt: 0 })
    .cnt;

    let data_sql = if no_limit {
        format!(
            "SELECT id, expense_id, title, amount, category, payment_method, notes, expense_date, \
             created_at, updated_at, deleted_at FROM expenses {} ORDER BY {} {}",
            where_clause, sort_column, sort_dir
        )
    } else {
        format!(
            "SELECT id, expense_id, title, amount, category, payment_method, notes, expense_date, \
             created_at, updated_at, deleted_at FROM expenses {} ORDER BY {} {} LIMIT ? OFFSET ?",
            where_clause, sort_column, sort_dir
        )
    };

    let query_params: Vec<sea_orm::Value> = if no_limit {
        params
    } else {
        let mut p = params;
        p.push(page_size.into());
        p.push(offset.into());
        p
    };

    let expenses = Expense::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Sqlite,
        &data_sql,
        query_params,
    ))
    .all(&db)
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
    let db = state.db.lock().await.clone();
    expenses::Entity::find_by_id(id)
        .into_model::<Expense>()
        .one(&db)
        .await?
        .ok_or_else(|| AppError::not_found("Expense not found"))
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

    let db = state.db.lock().await.clone();

    db.execute(Statement::from_sql_and_values(
        DatabaseBackend::Sqlite,
        "UPDATE expenses SET title = ?, amount = ?, category = ?, expense_date = ?, \
         payment_method = ?, notes = ?, updated_at = datetime('now') WHERE id = ?",
        [
            trimmed_title.into(),
            amount.into(),
            sanitize_optional(category).into(),
            sanitize_optional(expense_date).into(),
            sanitize_optional(payment_method).into(),
            sanitize_optional(notes).into(),
            id.clone().into(),
        ],
    ))
    .await?;

    if let Ok(Some(record)) = expenses::Entity::find_by_id(id.clone())
        .into_model::<Expense>()
        .one(&db)
        .await
    {
        let pool = state.pool.lock().await;
        enqueue_sync(&pool, app, "expenses", "UPDATE", &id, serde_json::json!(record)).await;
    }

    Ok(())
}

/// Soft-deletes expense row and enqueues sync payload.
#[instrument(skip(state, app))]
pub async fn delete_expense(state: Arc<AppState>, app: &AppHandle, id: String) -> AppResult<()> {
    let db = state.db.lock().await.clone();

    db.execute(Statement::from_sql_and_values(
        DatabaseBackend::Sqlite,
        "UPDATE expenses SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
        [id.clone().into()],
    ))
    .await?;

    if let Ok(Some(record)) = expenses::Entity::find_by_id(id.clone())
        .into_model::<Expense>()
        .one(&db)
        .await
    {
        let pool = state.pool.lock().await;
        enqueue_sync(&pool, app, "expenses", "DELETE", &id, serde_json::json!(record)).await;
    }

    Ok(())
}
