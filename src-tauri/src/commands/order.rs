use std::sync::Arc;

use tauri::{AppHandle, State};
use tracing::instrument;

use crate::error::AppError;
use crate::models::{
    DashboardDetailRecord, DashboardStats, OrderDetail, OrderExportRow, OrderItemPayload,
    OrderWithCustomer, PaginatedOrders,
};
use crate::services::order;
use crate::state::AppState;

/// Creates an order and its order items.
#[tauri::command]
#[instrument(skip(state, app, items))]
#[allow(clippy::too_many_arguments)]
pub async fn create_order(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    customer_id: i64,
    status: Option<String>,
    order_from: Option<String>,
    exchange_rate: Option<f64>,
    shipping_fee: Option<f64>,
    delivery_fee: Option<f64>,
    cargo_fee: Option<f64>,
    order_date: Option<String>,
    arrived_date: Option<String>,
    shipment_date: Option<String>,
    user_withdraw_date: Option<String>,
    service_fee: Option<f64>,
    product_discount: Option<f64>,
    service_fee_type: Option<String>,
    items: Vec<OrderItemPayload>,
    id: Option<i64>,
    order_id: Option<String>,
    shipping_fee_paid: Option<bool>,
    delivery_fee_paid: Option<bool>,
    cargo_fee_paid: Option<bool>,
    service_fee_paid: Option<bool>,
    shipping_fee_by_shop: Option<bool>,
    delivery_fee_by_shop: Option<bool>,
    cargo_fee_by_shop: Option<bool>,
    exclude_cargo_fee: Option<bool>,
) -> Result<i64, AppError> {
    order::create_order(
        state.inner().clone(),
        &app,
        customer_id,
        status,
        order_from,
        exchange_rate,
        shipping_fee,
        delivery_fee,
        cargo_fee,
        order_date,
        arrived_date,
        shipment_date,
        user_withdraw_date,
        service_fee,
        product_discount,
        service_fee_type,
        items,
        id,
        order_id,
        shipping_fee_paid,
        delivery_fee_paid,
        cargo_fee_paid,
        service_fee_paid,
        shipping_fee_by_shop,
        delivery_fee_by_shop,
        cargo_fee_by_shop,
        exclude_cargo_fee,
    )
    .await
}

/// Loads all orders.
#[tauri::command]
#[instrument(skip(state))]
pub async fn get_orders(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<OrderWithCustomer>, AppError> {
    order::get_orders(state.inner().clone()).await
}

/// Loads paginated orders with filters.
#[tauri::command]
#[instrument(skip(state))]
pub async fn get_orders_paginated(
    state: State<'_, Arc<AppState>>,
    page: Option<i64>,
    page_size: Option<i64>,
    search_key: Option<String>,
    search_term: Option<String>,
    status_filter: Option<String>,
    sort_by: Option<String>,
    sort_order: Option<String>,
) -> Result<PaginatedOrders, AppError> {
    order::get_orders_paginated(
        state.inner().clone(),
        page,
        page_size,
        search_key,
        search_term,
        status_filter,
        sort_by,
        sort_order,
    )
    .await
}

/// Loads all orders for a specific customer.
#[tauri::command]
#[instrument(skip(state))]
pub async fn get_customer_orders(
    state: State<'_, Arc<AppState>>,
    customer_id: i64,
) -> Result<Vec<OrderWithCustomer>, AppError> {
    order::get_customer_orders(state.inner().clone(), customer_id).await
}

/// Loads one order with its items.
#[tauri::command]
#[instrument(skip(state))]
pub async fn get_order(state: State<'_, Arc<AppState>>, id: i64) -> Result<OrderDetail, AppError> {
    order::get_order(state.inner().clone(), id).await
}

/// Updates an order and replaces its order items.
#[tauri::command]
#[instrument(skip(state, app, items))]
#[allow(clippy::too_many_arguments)]
pub async fn update_order(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    id: i64,
    customer_id: i64,
    status: Option<String>,
    order_from: Option<String>,
    exchange_rate: Option<f64>,
    shipping_fee: Option<f64>,
    delivery_fee: Option<f64>,
    cargo_fee: Option<f64>,
    order_date: Option<String>,
    arrived_date: Option<String>,
    shipment_date: Option<String>,
    user_withdraw_date: Option<String>,
    service_fee: Option<f64>,
    product_discount: Option<f64>,
    service_fee_type: Option<String>,
    items: Vec<OrderItemPayload>,
    shipping_fee_paid: Option<bool>,
    delivery_fee_paid: Option<bool>,
    cargo_fee_paid: Option<bool>,
    service_fee_paid: Option<bool>,
    shipping_fee_by_shop: Option<bool>,
    delivery_fee_by_shop: Option<bool>,
    cargo_fee_by_shop: Option<bool>,
    exclude_cargo_fee: Option<bool>,
) -> Result<(), AppError> {
    order::update_order(
        state.inner().clone(),
        &app,
        id,
        customer_id,
        status,
        order_from,
        exchange_rate,
        shipping_fee,
        delivery_fee,
        cargo_fee,
        order_date,
        arrived_date,
        shipment_date,
        user_withdraw_date,
        service_fee,
        product_discount,
        service_fee_type,
        items,
        shipping_fee_paid,
        delivery_fee_paid,
        cargo_fee_paid,
        service_fee_paid,
        shipping_fee_by_shop,
        delivery_fee_by_shop,
        cargo_fee_by_shop,
        exclude_cargo_fee,
    )
    .await
}

/// Soft-deletes an order and its items.
#[tauri::command]
#[instrument(skip(state, app))]
pub async fn delete_order(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> Result<(), AppError> {
    order::delete_order(state.inner().clone(), &app, id).await
}

/// Computes dashboard summary metrics for the selected filters.
#[tauri::command]
#[instrument(skip(state))]
pub async fn get_dashboard_stats(
    state: State<'_, Arc<AppState>>,
    date_from: Option<String>,
    date_to: Option<String>,
    date_field: Option<String>,
    status: Option<String>,
) -> Result<DashboardStats, AppError> {
    order::get_dashboard_stats(
        state.inner().clone(),
        date_from,
        date_to,
        date_field,
        status,
    )
    .await
}

/// Returns detailed dashboard records for the selected metric.
#[tauri::command]
#[instrument(skip(state))]
pub async fn get_dashboard_detail_records(
    state: State<'_, Arc<AppState>>,
    record_type: String,
    date_from: Option<String>,
    date_to: Option<String>,
    date_field: Option<String>,
    status: Option<String>,
) -> Result<Vec<DashboardDetailRecord>, AppError> {
    order::get_dashboard_detail_records(
        state.inner().clone(),
        record_type,
        date_from,
        date_to,
        date_field,
        status,
    )
    .await
}

/// Returns flattened order rows for export.
#[tauri::command]
#[instrument(skip(state))]
pub async fn get_orders_for_export(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<OrderExportRow>, AppError> {
    order::get_orders_for_export(state.inner().clone()).await
}
