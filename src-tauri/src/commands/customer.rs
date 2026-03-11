use std::sync::Arc;

use tauri::{AppHandle, State};
use tracing::instrument;

use crate::error::AppError;
use crate::models::{Customer, PaginatedCustomers};
use crate::services::customer;
use crate::state::AppState;

/// Creates a customer record.
#[tauri::command]
#[instrument(skip(state, app))]
#[allow(clippy::too_many_arguments)]
pub async fn create_customer(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    uuid: Option<String>,
    name: String,
    phone: Option<String>,
    address: Option<String>,
    city: Option<String>,
    social_media_url: Option<String>,
    platform: Option<String>,
    id: Option<i64>,
    customer_id: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
    deleted_at: Option<String>,
) -> Result<i64, AppError> {
    customer::create_customer(
        state.inner().clone(),
        &app,
        uuid,
        name,
        phone,
        address,
        city,
        social_media_url,
        platform,
        id,
        customer_id,
        created_at,
        updated_at,
        deleted_at,
    )
    .await
}

/// Loads all customers.
#[tauri::command]
#[instrument(skip(state))]
pub async fn get_customers(state: State<'_, Arc<AppState>>) -> Result<Vec<Customer>, AppError> {
    customer::get_customers(state.inner().clone()).await
}

/// Loads customers with pagination and filtering.
#[tauri::command]
#[instrument(skip(state))]
pub async fn get_customers_paginated(
    state: State<'_, Arc<AppState>>,
    page: Option<i64>,
    page_size: Option<i64>,
    search_key: Option<String>,
    search_term: Option<String>,
    sort_by: Option<String>,
    sort_order: Option<String>,
) -> Result<PaginatedCustomers, AppError> {
    customer::get_customers_paginated(
        state.inner().clone(),
        page,
        page_size,
        search_key,
        search_term,
        sort_by,
        sort_order,
    )
    .await
}

/// Loads a customer by id.
#[tauri::command]
#[instrument(skip(state))]
pub async fn get_customer(state: State<'_, Arc<AppState>>, id: i64) -> Result<Customer, AppError> {
    customer::get_customer(state.inner().clone(), id).await
}

/// Updates a customer record by id.
#[tauri::command]
#[instrument(skip(state, app))]
#[allow(clippy::too_many_arguments)]
pub async fn update_customer(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    id: i64,
    uuid: Option<String>,
    customer_id: Option<String>,
    name: String,
    phone: Option<String>,
    address: Option<String>,
    city: Option<String>,
    social_media_url: Option<String>,
    platform: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
    deleted_at: Option<String>,
) -> Result<(), AppError> {
    customer::update_customer(
        state.inner().clone(),
        &app,
        id,
        uuid,
        customer_id,
        name,
        phone,
        address,
        city,
        social_media_url,
        platform,
        created_at,
        updated_at,
        deleted_at,
    )
    .await
}

/// Soft-deletes a customer by id.
#[tauri::command]
#[instrument(skip(state, app))]
pub async fn delete_customer(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> Result<(), AppError> {
    customer::delete_customer(state.inner().clone(), &app, id).await
}
