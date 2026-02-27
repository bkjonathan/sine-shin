use tauri::{AppHandle, Manager};

use crate::db::DEFAULT_EXPENSE_ID_PREFIX;
use crate::models::{Expense, PaginatedExpenses};
use crate::state::AppDb;
use crate::{db_query, db_query_as, db_query_as_one, db_query_as_optional};
use crate::sync::enqueue_sync;

const DEFAULT_EXPENSES_PAGE_SIZE: i64 = 10;
const MIN_EXPENSES_PAGE_SIZE: i64 = 5;
const MAX_EXPENSES_PAGE_SIZE: i64 = 100;

fn sanitize_optional(value: Option<String>) -> Option<String> {
    value
        .map(|raw| raw.trim().to_string())
        .filter(|trimmed| !trimmed.is_empty())
}

#[tauri::command]
pub async fn create_expense(
    app: AppHandle,
    title: String,
    amount: f64,
    category: Option<String>,
    expense_date: Option<String>,
    payment_method: Option<String>,
    notes: Option<String>,
    id: Option<i64>,
    expense_id: Option<String>,
) -> Result<i64, String> {
    let trimmed_title = title.trim();
    if trimmed_title.is_empty() {
        return Err("Expense title is required".to_string());
    }
    if !amount.is_finite() || amount < 0.0 {
        return Err("Expense amount must be a valid non-negative number".to_string());
    }

    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let sanitized_category = sanitize_optional(category);
    let sanitized_expense_date = sanitize_optional(expense_date);
    let sanitized_payment_method = sanitize_optional(payment_method);
    let sanitized_notes = sanitize_optional(notes);
    let sanitized_expense_id = sanitize_optional(expense_id);

    let inserted_id = match &*pool {
        crate::state::Database::Sqlite(p) => {
            if let Some(provided_id) = id {
                sqlx::query("INSERT INTO expenses (id, title, amount, category, expense_date, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?, ?)")
                .bind(provided_id).bind(&trimmed_title).bind(amount).bind(&sanitized_category).bind(&sanitized_expense_date).bind(&sanitized_payment_method).bind(&sanitized_notes)
                .execute(p).await.map_err(|e| e.to_string())?.last_insert_rowid()
            } else {
                sqlx::query("INSERT INTO expenses (title, amount, category, expense_date, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?)")
                .bind(&trimmed_title).bind(amount).bind(&sanitized_category).bind(&sanitized_expense_date).bind(&sanitized_payment_method).bind(&sanitized_notes)
                .execute(p).await.map_err(|e| e.to_string())?.last_insert_rowid()
            }
        },
        #[cfg(feature = "postgres")]
        crate::state::Database::Postgres(p) => {
            let q1 = crate::db_macros::adapt_query_for_pg("INSERT INTO expenses (id, title, amount, category, expense_date, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id");
            let q2 = crate::db_macros::adapt_query_for_pg("INSERT INTO expenses (title, amount, category, expense_date, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?) RETURNING id");
            if let Some(provided_id) = id {
                sqlx::query_scalar(&q1)
                .bind(provided_id).bind(&trimmed_title).bind(amount).bind(&sanitized_category).bind(&sanitized_expense_date).bind(&sanitized_payment_method).bind(&sanitized_notes)
                .fetch_one(p).await.map_err(|e| e.to_string())?
            } else {
                sqlx::query_scalar(&q2)
                .bind(&trimmed_title).bind(amount).bind(&sanitized_category).bind(&sanitized_expense_date).bind(&sanitized_payment_method).bind(&sanitized_notes)
                .fetch_one(p).await.map_err(|e| e.to_string())?
            }
        },
        #[cfg(not(feature = "postgres"))]
        _ => unreachable!(),
    };

    let final_expense_id = sanitized_expense_id
        .unwrap_or_else(|| format!("{}{:05}", DEFAULT_EXPENSE_ID_PREFIX, inserted_id));

    db_query!(&*pool, "UPDATE expenses SET expense_id = ? WHERE id = ?", final_expense_id, inserted_id)
        .map_err(|e| e.to_string())?;

    // Enqueue sync
    if let Ok(record) = db_query_as_one!(Expense, &*pool, "SELECT * FROM expenses WHERE id = ?", inserted_id)
    {
        enqueue_sync(&pool, "expenses", "INSERT", inserted_id, serde_json::json!(record)).await;
    }

    Ok(inserted_id)
}

#[tauri::command]
pub async fn get_expenses(app: AppHandle) -> Result<Vec<Expense>, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let expenses =
        db_query_as!(Expense, &*pool, "SELECT * FROM expenses ORDER BY created_at DESC, id DESC")
            .map_err(|e| e.to_string())?;

    Ok(expenses)
}

#[tauri::command]
pub async fn get_expenses_paginated(
    app: AppHandle,
    page: Option<i64>,
    page_size: Option<i64>,
    search_key: Option<String>,
    search_term: Option<String>,
    category_filter: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
    sort_by: Option<String>,
    sort_order: Option<String>,
) -> Result<PaginatedExpenses, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

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
        _ => return Err("Invalid search key".to_string()),
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

    macro_rules! apply_filters {
        ($query:expr) => {
            let mut has_condition = false;
            if has_search {
                $query.push("COALESCE(");
                $query.push(search_column);
                $query.push(", '') LIKE ");
                $query.push_bind(search_pattern.clone());
                has_condition = true;
            }
            if let Some(category_value) = normalized_category_filter.as_ref() {
                if has_condition { $query.push(" AND "); }
                $query.push("LOWER(COALESCE(category, '')) = LOWER(");
                $query.push_bind(category_value.clone());
                $query.push(")");
                has_condition = true;
            }
            if let Some(date_from_value) = normalized_date_from.as_ref() {
                if has_condition { $query.push(" AND "); }
                $query.push("DATE(COALESCE(expense_date, created_at)) >= DATE(");
                $query.push_bind(date_from_value.clone());
                $query.push(")");
                has_condition = true;
            }
            if let Some(date_to_value) = normalized_date_to.as_ref() {
                if has_condition { $query.push(" AND "); }
                $query.push("DATE(COALESCE(expense_date, created_at)) <= DATE(");
                $query.push_bind(date_to_value.clone());
                $query.push(")");
            }
        };
    }

    let (total, expenses) = match &*pool {
        crate::state::Database::Sqlite(p) => {
            let mut count_query = sqlx::QueryBuilder::<sqlx::Sqlite>::new("SELECT COUNT(*) FROM expenses");
            if has_search || has_category_filter || has_date_from || has_date_to {
                count_query.push(" WHERE "); apply_filters!(&mut count_query);
            }
            let total: i64 = count_query.build_query_scalar().fetch_one(p).await.map_err(|e| e.to_string())?;

            let mut data_query = sqlx::QueryBuilder::<sqlx::Sqlite>::new("SELECT * FROM expenses");
            if has_search || has_category_filter || has_date_from || has_date_to {
                data_query.push(" WHERE "); apply_filters!(&mut data_query);
            }
            data_query.push(" ORDER BY "); data_query.push(sort_column); data_query.push(" "); data_query.push(sort_direction);
            data_query.push(", id "); data_query.push(sort_direction);
            if !no_limit {
                data_query.push(" LIMIT "); data_query.push_bind(page_size);
                data_query.push(" OFFSET "); data_query.push_bind(offset);
            }
            let expenses = data_query.build_query_as::<Expense>().fetch_all(p).await.map_err(|e| e.to_string())?;
            (total, expenses)
        },
        #[cfg(feature = "postgres")]
        crate::state::Database::Postgres(p) => {
            let mut count_query = sqlx::QueryBuilder::<sqlx::Postgres>::new("SELECT COUNT(*) FROM expenses");
            if has_search || has_category_filter || has_date_from || has_date_to {
                count_query.push(" WHERE "); apply_filters!(&mut count_query);
            }
            let total: i64 = count_query.build_query_scalar().fetch_one(p).await.map_err(|e| e.to_string())?;

            let mut data_query = sqlx::QueryBuilder::<sqlx::Postgres>::new("SELECT * FROM expenses");
            if has_search || has_category_filter || has_date_from || has_date_to {
                data_query.push(" WHERE "); apply_filters!(&mut data_query);
            }
            data_query.push(" ORDER BY "); data_query.push(sort_column); data_query.push(" "); data_query.push(sort_direction);
            data_query.push(", id "); data_query.push(sort_direction);
            if !no_limit {
                data_query.push(" LIMIT "); data_query.push_bind(page_size);
                data_query.push(" OFFSET "); data_query.push_bind(offset);
            }
            let expenses = data_query.build_query_as::<Expense>().fetch_all(p).await.map_err(|e| e.to_string())?;
            (total, expenses)
        },
        #[cfg(not(feature = "postgres"))]
        _ => unreachable!(),
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

#[tauri::command]
pub async fn get_expense(app: AppHandle, id: i64) -> Result<Expense, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let expense = db_query_as_optional!(Expense, &*pool, "SELECT * FROM expenses WHERE id = ?", id)
        .map_err(|e| e.to_string())?
        .ok_or("Expense not found".to_string())?;

    Ok(expense)
}

#[tauri::command]
pub async fn update_expense(
    app: AppHandle,
    id: i64,
    title: String,
    amount: f64,
    category: Option<String>,
    expense_date: Option<String>,
    payment_method: Option<String>,
    notes: Option<String>,
) -> Result<(), String> {
    let trimmed_title = title.trim();
    if trimmed_title.is_empty() {
        return Err("Expense title is required".to_string());
    }
    if !amount.is_finite() || amount < 0.0 {
        return Err("Expense amount must be a valid non-negative number".to_string());
    }

    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    db_query!(
        &*pool,
        "UPDATE expenses SET title = ?, amount = ?, category = ?, expense_date = ?, payment_method = ?, notes = ?, updated_at = datetime('now') WHERE id = ?",
        trimmed_title,
        amount,
        sanitize_optional(category),
        sanitize_optional(expense_date),
        sanitize_optional(payment_method),
        sanitize_optional(notes),
        id
    )
    .map_err(|e| e.to_string())?;

    // Enqueue sync
    if let Ok(record) = db_query_as_one!(Expense, &*pool, "SELECT * FROM expenses WHERE id = ?", id)
    {
        enqueue_sync(&pool, "expenses", "UPDATE", id, serde_json::json!(record)).await;
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_expense(app: AppHandle, id: i64) -> Result<(), String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    // Soft delete
    db_query!(&*pool, "UPDATE expenses SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", id)
        .map_err(|e| e.to_string())?;

    // Enqueue sync
    if let Ok(record) = db_query_as_one!(Expense, &*pool, "SELECT * FROM expenses WHERE id = ?", id)
    {
        enqueue_sync(&pool, "expenses", "DELETE", id, serde_json::json!(record)).await;
    }

    Ok(())
}
