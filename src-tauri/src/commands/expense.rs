use std::sync::Arc;

use tauri::{AppHandle, State};
use tracing::instrument;

use crate::error::AppError;
use crate::models::{Expense, PaginatedExpenses};
use crate::services::expense;
use crate::state::AppState;

/// Creates an expense record.
#[tauri::command]
#[instrument(skip(state, app))]
#[allow(clippy::too_many_arguments)]
pub async fn create_expense(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    title: String,
    amount: f64,
    category: Option<String>,
    expense_date: Option<String>,
    payment_method: Option<String>,
    notes: Option<String>,
    id: Option<i64>,
    expense_id: Option<String>,
) -> Result<i64, AppError> {
    expense::create_expense(
        state.inner().clone(),
        &app,
        title,
        amount,
        category,
        expense_date,
        payment_method,
        notes,
        id,
        expense_id,
    )
    .await
}

/// Loads all expenses.
#[tauri::command]
#[instrument(skip(state))]
pub async fn get_expenses(state: State<'_, Arc<AppState>>) -> Result<Vec<Expense>, AppError> {
    expense::get_expenses(state.inner().clone()).await
}

/// Loads expenses with pagination and filters.
#[tauri::command]
#[instrument(skip(state))]
#[allow(clippy::too_many_arguments)]
pub async fn get_expenses_paginated(
    state: State<'_, Arc<AppState>>,
    page: Option<i64>,
    page_size: Option<i64>,
    search_key: Option<String>,
    search_term: Option<String>,
    category_filter: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
    sort_by: Option<String>,
    sort_order: Option<String>,
) -> Result<PaginatedExpenses, AppError> {
    expense::get_expenses_paginated(
        state.inner().clone(),
        page,
        page_size,
        search_key,
        search_term,
        category_filter,
        date_from,
        date_to,
        sort_by,
        sort_order,
    )
    .await
}

/// Loads one expense by id.
#[tauri::command]
#[instrument(skip(state))]
pub async fn get_expense(state: State<'_, Arc<AppState>>, id: i64) -> Result<Expense, AppError> {
    expense::get_expense(state.inner().clone(), id).await
}

/// Updates expense by id.
#[tauri::command]
#[instrument(skip(state, app))]
#[allow(clippy::too_many_arguments)]
pub async fn update_expense(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    id: i64,
    title: String,
    amount: f64,
    category: Option<String>,
    expense_date: Option<String>,
    payment_method: Option<String>,
    notes: Option<String>,
) -> Result<(), AppError> {
    expense::update_expense(
        state.inner().clone(),
        &app,
        id,
        title,
        amount,
        category,
        expense_date,
        payment_method,
        notes,
    )
    .await
}

/// Soft-deletes expense by id.
#[tauri::command]
#[instrument(skip(state, app))]
pub async fn delete_expense(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> Result<(), AppError> {
    expense::delete_expense(state.inner().clone(), &app, id).await
}
