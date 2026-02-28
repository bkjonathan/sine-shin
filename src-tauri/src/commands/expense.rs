use sqlx::{QueryBuilder, Sqlite};
use tauri::{AppHandle, Manager};

use crate::db::DEFAULT_EXPENSE_ID_PREFIX;
use crate::models::{Expense, PaginatedExpenses};
use crate::state::AppDb;
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

    let inserted_id = if let Some(provided_id) = id {
        sqlx::query(
            "INSERT INTO expenses (id, title, amount, category, expense_date, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(provided_id)
        .bind(trimmed_title)
        .bind(amount)
        .bind(sanitized_category.clone())
        .bind(sanitized_expense_date.clone())
        .bind(sanitized_payment_method.clone())
        .bind(sanitized_notes.clone())
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .last_insert_rowid()
    } else {
        sqlx::query(
            "INSERT INTO expenses (title, amount, category, expense_date, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(trimmed_title)
        .bind(amount)
        .bind(sanitized_category)
        .bind(sanitized_expense_date)
        .bind(sanitized_payment_method)
        .bind(sanitized_notes)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .last_insert_rowid()
    };

    let final_expense_id = sanitized_expense_id
        .unwrap_or_else(|| format!("{}{:05}", DEFAULT_EXPENSE_ID_PREFIX, inserted_id));

    sqlx::query("UPDATE expenses SET expense_id = ? WHERE id = ?")
        .bind(final_expense_id)
        .bind(inserted_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    // Enqueue sync
    if let Ok(record) = sqlx::query_as::<_, Expense>("SELECT * FROM expenses WHERE id = ?")
        .bind(inserted_id)
        .fetch_one(&*pool)
        .await
    {
        enqueue_sync(&pool, &app, "expenses", "INSERT", inserted_id, serde_json::json!(record)).await;
    }

    Ok(inserted_id)
}

#[tauri::command]
pub async fn get_expenses(app: AppHandle) -> Result<Vec<Expense>, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let expenses =
        sqlx::query_as::<_, Expense>("SELECT * FROM expenses ORDER BY created_at DESC, id DESC")
            .fetch_all(&*pool)
            .await
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

    let apply_filters = |query: &mut QueryBuilder<Sqlite>| {
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
            query.push("DATE(COALESCE(expense_date, created_at)) >= DATE(");
            query.push_bind(date_from_value.clone());
            query.push(")");
            has_condition = true;
        }

        if let Some(date_to_value) = normalized_date_to.as_ref() {
            if has_condition {
                query.push(" AND ");
            }
            query.push("DATE(COALESCE(expense_date, created_at)) <= DATE(");
            query.push_bind(date_to_value.clone());
            query.push(")");
        }
    };

    let mut count_query = QueryBuilder::<Sqlite>::new("SELECT COUNT(*) FROM expenses");
    if has_search || has_category_filter || has_date_from || has_date_to {
        count_query.push(" WHERE ");
        apply_filters(&mut count_query);
    }

    let total: i64 = count_query
        .build_query_scalar()
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut data_query = QueryBuilder::<Sqlite>::new("SELECT * FROM expenses");
    if has_search || has_category_filter || has_date_from || has_date_to {
        data_query.push(" WHERE ");
        apply_filters(&mut data_query);
    }

    data_query.push(" ORDER BY ");
    data_query.push(sort_column);
    data_query.push(" ");
    data_query.push(sort_direction);
    data_query.push(", id ");
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
        .await
        .map_err(|e| e.to_string())?;

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

    let expense = sqlx::query_as::<_, Expense>("SELECT * FROM expenses WHERE id = ?")
        .bind(id)
        .fetch_optional(&*pool)
        .await
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

    sqlx::query(
        "UPDATE expenses SET title = ?, amount = ?, category = ?, expense_date = ?, payment_method = ?, notes = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(trimmed_title)
    .bind(amount)
    .bind(sanitize_optional(category))
    .bind(sanitize_optional(expense_date))
    .bind(sanitize_optional(payment_method))
    .bind(sanitize_optional(notes))
    .bind(id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // Enqueue sync
    if let Ok(record) = sqlx::query_as::<_, Expense>("SELECT * FROM expenses WHERE id = ?")
        .bind(id)
        .fetch_one(&*pool)
        .await
    {
        enqueue_sync(&pool, &app, "expenses", "UPDATE", id, serde_json::json!(record)).await;
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_expense(app: AppHandle, id: i64) -> Result<(), String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    // Soft delete
    sqlx::query("UPDATE expenses SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    // Enqueue sync
    if let Ok(record) = sqlx::query_as::<_, Expense>("SELECT * FROM expenses WHERE id = ?")
        .bind(id)
        .fetch_one(&*pool)
        .await
    {
        enqueue_sync(&pool, &app, "expenses", "DELETE", id, serde_json::json!(record)).await;
    }

    Ok(())
}
