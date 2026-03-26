use chrono::{DateTime, NaiveDate, NaiveDateTime};
use sea_orm::{ConnectionTrait, FromQueryResult, Statement};
use std::collections::HashSet;
use std::sync::Arc;

use tauri::AppHandle;
use uuid::Uuid;

use crate::db::{
    DEFAULT_ORDER_ID_PREFIX, ORDER_WITH_CUSTOMER_GROUP_BY, ORDER_WITH_CUSTOMER_SELECT,
};
use crate::error::AppResult;
use crate::models::{
    DashboardDetailRecord, DashboardStats, OrderDetail, OrderExportRow, OrderItem,
    OrderItemPayload, OrderWithCustomer, PaginatedOrders,
};
use crate::state::AppState;
use crate::sync::enqueue_sync;

const DEFAULT_ORDERS_PAGE_SIZE: i64 = 5;
const MIN_ORDERS_PAGE_SIZE: i64 = 5;
const MAX_ORDERS_PAGE_SIZE: i64 = 100;

fn normalize_order_status(status: Option<String>) -> AppResult<Option<String>> {
    let normalized = status
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty());

    match normalized.as_deref() {
        None => Ok(None),
        Some("pending" | "confirmed" | "shipping" | "completed" | "cancelled") => Ok(normalized),
        Some(_) => Err("Invalid order status".into()),
    }
}

fn normalize_order_status_filter(status: Option<String>) -> AppResult<Option<String>> {
    let normalized = status
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty());

    if matches!(normalized.as_deref(), None | Some("all")) {
        return Ok(None);
    }

    normalize_order_status(normalized)
}

fn parse_flexible_date(value: Option<&str>) -> Option<NaiveDate> {
    let raw = value?.trim();
    if raw.is_empty() {
        return None;
    }

    if let Ok(parsed) = DateTime::parse_from_rfc3339(raw) {
        return Some(parsed.date_naive());
    }

    const DATETIME_FORMATS: [&str; 12] = [
        "%Y-%m-%d %H:%M:%S%.f",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%dT%H:%M:%S%.f",
        "%Y-%m-%dT%H:%M",
        "%d/%m/%Y %H:%M:%S%.f",
        "%d/%m/%Y %H:%M",
        "%d-%m-%Y %H:%M:%S%.f",
        "%d-%m-%Y %H:%M",
        "%Y/%m/%d %H:%M:%S%.f",
        "%Y/%m/%d %H:%M",
        "%d.%m.%Y %H:%M:%S%.f",
        "%d.%m.%Y %H:%M",
    ];

    for fmt in DATETIME_FORMATS {
        if let Ok(parsed) = NaiveDateTime::parse_from_str(raw, fmt) {
            return Some(parsed.date());
        }
    }

    const DATE_FORMATS: [&str; 6] = [
        "%Y-%m-%d", "%Y/%m/%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y.%m.%d",
    ];

    for fmt in DATE_FORMATS {
        if let Ok(parsed) = NaiveDate::parse_from_str(raw, fmt) {
            return Some(parsed);
        }
    }

    None
}

fn normalized_dashboard_date_field(date_field: Option<String>) -> &'static str {
    match date_field.as_deref() {
        Some("created_at") => "created_at",
        _ => "order_date",
    }
}

fn resolve_dashboard_comparison_date(
    order: &OrderWithCustomer,
    date_field: &str,
    range_to: Option<NaiveDate>,
) -> Option<NaiveDate> {
    if date_field == "created_at" {
        return parse_flexible_date(order.created_at.as_deref());
    }

    let order_date = parse_flexible_date(order.order_date.as_deref());
    let created_at = parse_flexible_date(order.created_at.as_deref());

    match order_date {
        None => created_at,
        Some(parsed_order_date) => {
            if let Some(to) = range_to {
                if parsed_order_date > to {
                    return created_at;
                }
            }
            Some(parsed_order_date)
        }
    }
}

fn matches_dashboard_date_range(
    order: &OrderWithCustomer,
    date_field: &str,
    range_from: Option<NaiveDate>,
    range_to: Option<NaiveDate>,
) -> bool {
    if range_from.is_none() && range_to.is_none() {
        return true;
    }

    let Some(comparison_date) = resolve_dashboard_comparison_date(order, date_field, range_to)
    else {
        return false;
    };

    if let Some(from) = range_from {
        if comparison_date < from {
            return false;
        }
    }

    if let Some(to) = range_to {
        if comparison_date > to {
            return false;
        }
    }

    true
}

fn calculate_dashboard_profit(order: &OrderWithCustomer) -> f64 {
    let total_price = order.total_price.unwrap_or(0.0);
    let service_fee = order.service_fee.unwrap_or(0.0);
    let service_fee_amount = if order.service_fee_type.as_deref() == Some("percent") {
        total_price * (service_fee / 100.0)
    } else {
        service_fee
    };

    let product_discount = order.product_discount.unwrap_or(0.0);
    let shipping_fee = if order.shipping_fee_by_shop.unwrap_or(0) != 0 {
        order.shipping_fee.unwrap_or(0.0)
    } else {
        0.0
    };
    let delivery_fee = if order.delivery_fee_by_shop.unwrap_or(0) != 0 {
        order.delivery_fee.unwrap_or(0.0)
    } else {
        0.0
    };
    let cargo_fee =
        if order.cargo_fee_by_shop.unwrap_or(0) != 0 && order.exclude_cargo_fee.unwrap_or(0) == 0 {
            order.cargo_fee.unwrap_or(0.0)
        } else {
            0.0
        };

    service_fee_amount + product_discount + shipping_fee + delivery_fee + cargo_fee
}

fn calculate_effective_cargo_fee(order: &OrderWithCustomer) -> f64 {
    if order.exclude_cargo_fee.unwrap_or(0) != 0 {
        return 0.0;
    }

    order.cargo_fee.unwrap_or(0.0)
}

pub async fn create_order(
    state: Arc<AppState>,
    app: &AppHandle,
    customer_id: String,
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
    id: Option<String>,
    order_id: Option<String>,
    shipping_fee_paid: Option<bool>,
    delivery_fee_paid: Option<bool>,
    cargo_fee_paid: Option<bool>,
    service_fee_paid: Option<bool>,
    shipping_fee_by_shop: Option<bool>,
    delivery_fee_by_shop: Option<bool>,
    cargo_fee_by_shop: Option<bool>,
    exclude_cargo_fee: Option<bool>,
) -> AppResult<String> {
    let backend = state.db.as_ref().get_database_backend();
    let normalized_status =
        normalize_order_status(status)?.unwrap_or_else(|| "pending".to_string());

    let new_id = id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();

    state
        .db
        .execute(Statement::from_sql_and_values(
            backend,
            "INSERT INTO orders (id, customer_id, status, order_from, exchange_rate, shipping_fee, delivery_fee, cargo_fee, order_date, arrived_date, shipment_date, user_withdraw_date, service_fee, product_discount, service_fee_type, shipping_fee_paid, delivery_fee_paid, cargo_fee_paid, service_fee_paid, shipping_fee_by_shop, delivery_fee_by_shop, cargo_fee_by_shop, exclude_cargo_fee, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)",
            [
                new_id.clone().into(),
                customer_id.into(),
                normalized_status.into(),
                order_from.into(),
                exchange_rate.into(),
                shipping_fee.into(),
                delivery_fee.into(),
                cargo_fee.into(),
                order_date.into(),
                arrived_date.into(),
                shipment_date.into(),
                user_withdraw_date.into(),
                service_fee.into(),
                product_discount.into(),
                service_fee_type.into(),
                (shipping_fee_paid.unwrap_or(false) as i32).into(),
                (delivery_fee_paid.unwrap_or(false) as i32).into(),
                (cargo_fee_paid.unwrap_or(false) as i32).into(),
                (service_fee_paid.unwrap_or(false) as i32).into(),
                (shipping_fee_by_shop.unwrap_or(false) as i32).into(),
                (delivery_fee_by_shop.unwrap_or(false) as i32).into(),
                (cargo_fee_by_shop.unwrap_or(false) as i32).into(),
                (exclude_cargo_fee.unwrap_or(false) as i32).into(),
                now.into(),
            ],
        ))
        .await?;

    for item in &items {
        let item_id = Uuid::new_v4().to_string();
        let item_now = chrono::Utc::now().to_rfc3339();
        state
            .db
            .execute(Statement::from_sql_and_values(
                backend,
                "INSERT INTO order_items (id, order_id, product_url, product_qty, price, product_weight, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
                [
                    item_id.into(),
                    new_id.clone().into(),
                    item.product_url.clone().into(),
                    item.product_qty.into(),
                    item.price.into(),
                    item.product_weight.into(),
                    item_now.into(),
                ],
            ))
            .await
            .map_err(|e| e.to_string())?;
    }

    if let Some(oid) = order_id {
        let _ = state
            .db
            .execute(Statement::from_sql_and_values(
                backend,
                "UPDATE orders SET order_id = $1 WHERE id = $2",
                [oid.into(), new_id.clone().into()],
            ))
            .await;
    } else {
        #[derive(FromQueryResult)]
        struct PrefixRow {
            order_id_prefix: Option<String>,
        }
        let prefix = PrefixRow::find_by_statement(Statement::from_sql_and_values(
            backend,
            "SELECT order_id_prefix FROM shop_settings ORDER BY id DESC LIMIT 1",
            [],
        ))
        .one(state.db.as_ref())
        .await
        .unwrap_or(None)
        .and_then(|r| r.order_id_prefix)
        .filter(|p| !p.is_empty())
        .unwrap_or_else(|| DEFAULT_ORDER_ID_PREFIX.to_string());

        // Use count for sequence
        #[derive(FromQueryResult)]
        struct CountRow {
            count: i64,
        }
        let count = CountRow::find_by_statement(Statement::from_sql_and_values(
            backend,
            "SELECT COUNT(*) as count FROM orders",
            [],
        ))
        .one(state.db.as_ref())
        .await
        .ok()
        .flatten()
        .map(|r| r.count)
        .unwrap_or(1);

        let new_order_id = format!("{}{:05}", prefix, count);
        let _ = state
            .db
            .execute(Statement::from_sql_and_values(
                backend,
                "UPDATE orders SET order_id = $1 WHERE id = $2",
                [new_order_id.into(), new_id.clone().into()],
            ))
            .await;
    }

    // Enqueue sync for order
    if let Ok(Some(order)) = crate::models::Order::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT id, order_id, customer_id, status, order_from, exchange_rate, shipping_fee, delivery_fee, cargo_fee, order_date, arrived_date, shipment_date, user_withdraw_date, created_at, service_fee, product_discount, service_fee_type, shipping_fee_paid, delivery_fee_paid, cargo_fee_paid, service_fee_paid, shipping_fee_by_shop, delivery_fee_by_shop, cargo_fee_by_shop, exclude_cargo_fee, updated_at, deleted_at FROM orders WHERE id = $1",
        [new_id.clone().into()],
    ))
    .one(state.db.as_ref())
    .await
    {
        enqueue_sync(
            state.db.as_ref(),
            &app,
            "orders",
            "INSERT",
            &new_id,
            serde_json::json!(order),
        )
        .await;
    }

    // Enqueue sync for order items
    if let Ok(items_db) = OrderItem::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT id, order_id, product_url, product_qty, price, product_weight, created_at, updated_at, deleted_at FROM order_items WHERE order_id = $1 AND deleted_at IS NULL",
        [new_id.clone().into()],
    ))
    .all(state.db.as_ref())
    .await
    {
        for item in items_db {
            let item_id = item.id.clone();
            enqueue_sync(
                state.db.as_ref(),
                &app,
                "order_items",
                "INSERT",
                &item_id,
                serde_json::json!(item),
            )
            .await;
        }
    }

    Ok(new_id)
}

pub async fn get_orders(state: Arc<AppState>) -> AppResult<Vec<OrderWithCustomer>> {
    let backend = state.db.as_ref().get_database_backend();

    let query = format!(
        "{} {} ORDER BY o.created_at DESC",
        ORDER_WITH_CUSTOMER_SELECT, ORDER_WITH_CUSTOMER_GROUP_BY
    );
    let orders = OrderWithCustomer::find_by_statement(Statement::from_string(backend, query))
        .all(state.db.as_ref())
        .await
        .map_err(|e| e.to_string())?;

    Ok(orders)
}

pub async fn get_orders_paginated(
    state: Arc<AppState>,
    page: Option<i64>,
    page_size: Option<i64>,
    search_key: Option<String>,
    search_term: Option<String>,
    status_filter: Option<String>,
    sort_by: Option<String>,
    sort_order: Option<String>,
) -> AppResult<PaginatedOrders> {
    let backend = state.db.as_ref().get_database_backend();

    let requested_page_size = page_size.unwrap_or(DEFAULT_ORDERS_PAGE_SIZE);
    let no_limit = requested_page_size <= 0;
    let page_size = if no_limit {
        DEFAULT_ORDERS_PAGE_SIZE
    } else {
        requested_page_size.clamp(MIN_ORDERS_PAGE_SIZE, MAX_ORDERS_PAGE_SIZE)
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
    let normalized_status_filter = normalize_order_status_filter(status_filter)?;
    let has_status_filter = normalized_status_filter.is_some();
    let search_column = match search_key.as_deref().unwrap_or("customerName") {
        "customerName" => "c.name",
        "orderId" => "o.order_id",
        "customerId" => "c.customer_id",
        "customerPhone" => "c.phone",
        _ => return Err("Invalid search key".into()),
    };

    let sort_column = match sort_by.as_deref().unwrap_or("order_id") {
        "customer_name" => "c.name",
        "order_id" => "o.id",
        "created_at" => "o.created_at",
        "date" => "o.order_date",
        _ => "o.id",
    };

    let sort_direction = match sort_order.as_deref().unwrap_or("desc") {
        "asc" => "ASC",
        "desc" => "DESC",
        _ => "DESC",
    };

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

    if let Some(status) = normalized_status_filter.as_ref() {
        conditions.push(format!("o.status = ${}", param_idx));
        params.push(status.clone().into());
        param_idx += 1;
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    let count_sql = format!(
        "SELECT COUNT(*) as count FROM orders o LEFT JOIN customers c ON o.customer_id = c.id {}",
        where_clause
    );

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
    .await
    .map_err(|e| e.to_string())?
    .map(|r| r.count)
    .unwrap_or(0);

    let data_sql = if no_limit {
        format!(
            "{} {} {} ORDER BY {} {}",
            ORDER_WITH_CUSTOMER_SELECT,
            where_clause,
            ORDER_WITH_CUSTOMER_GROUP_BY,
            sort_column,
            sort_direction
        )
    } else {
        let limit_idx = param_idx;
        let offset_idx = param_idx + 1;
        format!(
            "{} {} {} ORDER BY {} {} LIMIT ${} OFFSET ${}",
            ORDER_WITH_CUSTOMER_SELECT,
            where_clause,
            ORDER_WITH_CUSTOMER_GROUP_BY,
            sort_column,
            sort_direction,
            limit_idx,
            offset_idx
        )
    };

    let orders = if no_limit {
        OrderWithCustomer::find_by_statement(Statement::from_sql_and_values(
            backend,
            &data_sql,
            params,
        ))
        .all(state.db.as_ref())
        .await
        .map_err(|e| e.to_string())?
    } else {
        let mut data_params = params;
        data_params.push(page_size.into());
        data_params.push(offset.into());
        OrderWithCustomer::find_by_statement(Statement::from_sql_and_values(
            backend,
            &data_sql,
            data_params,
        ))
        .all(state.db.as_ref())
        .await
        .map_err(|e| e.to_string())?
    };

    let response_page_size = if no_limit { total.max(0) } else { page_size };
    let total_pages = if total == 0 {
        0
    } else if no_limit {
        1
    } else {
        (total + page_size - 1) / page_size
    };

    Ok(PaginatedOrders {
        orders,
        total,
        page,
        page_size: response_page_size,
        total_pages,
    })
}

pub async fn get_customer_orders(
    state: Arc<AppState>,
    customer_id: String,
) -> AppResult<Vec<OrderWithCustomer>> {
    let backend = state.db.as_ref().get_database_backend();

    let query = format!(
        "{} WHERE o.customer_id = $1 {} ORDER BY o.created_at DESC",
        ORDER_WITH_CUSTOMER_SELECT, ORDER_WITH_CUSTOMER_GROUP_BY
    );
    let orders = OrderWithCustomer::find_by_statement(Statement::from_sql_and_values(
        backend,
        &query,
        [customer_id.into()],
    ))
    .all(state.db.as_ref())
    .await
    .map_err(|e| e.to_string())?;

    Ok(orders)
}

pub async fn get_order(state: Arc<AppState>, id: String) -> AppResult<OrderDetail> {
    let backend = state.db.as_ref().get_database_backend();

    let query = format!(
        "{} WHERE o.id = $1 {}",
        ORDER_WITH_CUSTOMER_SELECT, ORDER_WITH_CUSTOMER_GROUP_BY
    );
    let order = OrderWithCustomer::find_by_statement(Statement::from_sql_and_values(
        backend,
        &query,
        [id.clone().into()],
    ))
    .one(state.db.as_ref())
    .await
    .map_err(|e| e.to_string())?
    .ok_or("Order not found".to_string())?;

    let items = OrderItem::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT id, order_id, product_url, product_qty, price, product_weight, created_at, updated_at, deleted_at FROM order_items WHERE order_id = $1 AND deleted_at IS NULL",
        [id.into()],
    ))
    .all(state.db.as_ref())
    .await
    .map_err(|e| e.to_string())?;

    Ok(OrderDetail { order, items })
}

pub async fn update_order(
    state: Arc<AppState>,
    app: &AppHandle,
    id: String,
    customer_id: String,
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
) -> AppResult<()> {
    let backend = state.db.as_ref().get_database_backend();
    let normalized_status =
        normalize_order_status(status)?.unwrap_or_else(|| "pending".to_string());
    let now = chrono::Utc::now().to_rfc3339();

    // Get old items for sync
    let old_items = OrderItem::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT id, order_id, product_url, product_qty, price, product_weight, created_at, updated_at, deleted_at FROM order_items WHERE order_id = $1 AND deleted_at IS NULL",
        [id.clone().into()],
    ))
    .all(state.db.as_ref())
    .await
    .map_err(|e| e.to_string())?;

    state
        .db
        .execute(Statement::from_sql_and_values(
            backend,
            "UPDATE orders SET customer_id = $1, status = $2, order_from = $3, exchange_rate = $4, shipping_fee = $5, delivery_fee = $6, cargo_fee = $7, order_date = $8, arrived_date = $9, shipment_date = $10, user_withdraw_date = $11, service_fee = $12, product_discount = $13, service_fee_type = $14, shipping_fee_paid = $15, delivery_fee_paid = $16, cargo_fee_paid = $17, service_fee_paid = $18, shipping_fee_by_shop = $19, delivery_fee_by_shop = $20, cargo_fee_by_shop = $21, exclude_cargo_fee = $22, updated_at = $23 WHERE id = $24",
            [
                customer_id.into(),
                normalized_status.into(),
                order_from.into(),
                exchange_rate.into(),
                shipping_fee.into(),
                delivery_fee.into(),
                cargo_fee.into(),
                order_date.into(),
                arrived_date.into(),
                shipment_date.into(),
                user_withdraw_date.into(),
                service_fee.into(),
                product_discount.into(),
                service_fee_type.into(),
                (shipping_fee_paid.unwrap_or(false) as i32).into(),
                (delivery_fee_paid.unwrap_or(false) as i32).into(),
                (cargo_fee_paid.unwrap_or(false) as i32).into(),
                (service_fee_paid.unwrap_or(false) as i32).into(),
                (shipping_fee_by_shop.unwrap_or(false) as i32).into(),
                (delivery_fee_by_shop.unwrap_or(false) as i32).into(),
                (cargo_fee_by_shop.unwrap_or(false) as i32).into(),
                (exclude_cargo_fee.unwrap_or(false) as i32).into(),
                now.clone().into(),
                id.clone().into(),
            ],
        ))
        .await
        .map_err(|e| e.to_string())?;

    // Soft-delete old items
    state
        .db
        .execute(Statement::from_sql_and_values(
            backend,
            "UPDATE order_items SET deleted_at = $1, updated_at = $2 WHERE order_id = $3 AND deleted_at IS NULL",
            [now.clone().into(), now.clone().into(), id.clone().into()],
        ))
        .await
        .map_err(|e| e.to_string())?;

    for item in &items {
        let item_id = Uuid::new_v4().to_string();
        let item_now = chrono::Utc::now().to_rfc3339();
        state
            .db
            .execute(Statement::from_sql_and_values(
                backend,
                "INSERT INTO order_items (id, order_id, product_url, product_qty, price, product_weight, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
                [
                    item_id.into(),
                    id.clone().into(),
                    item.product_url.clone().into(),
                    item.product_qty.into(),
                    item.price.into(),
                    item.product_weight.into(),
                    item_now.into(),
                ],
            ))
            .await
            .map_err(|e| e.to_string())?;
    }

    // Enqueue sync for order
    if let Ok(Some(order)) = crate::models::Order::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT id, order_id, customer_id, status, order_from, exchange_rate, shipping_fee, delivery_fee, cargo_fee, order_date, arrived_date, shipment_date, user_withdraw_date, created_at, service_fee, product_discount, service_fee_type, shipping_fee_paid, delivery_fee_paid, cargo_fee_paid, service_fee_paid, shipping_fee_by_shop, delivery_fee_by_shop, cargo_fee_by_shop, exclude_cargo_fee, updated_at, deleted_at FROM orders WHERE id = $1",
        [id.clone().into()],
    ))
    .one(state.db.as_ref())
    .await
    {
        enqueue_sync(
            state.db.as_ref(),
            &app,
            "orders",
            "UPDATE",
            &id,
            serde_json::json!(order),
        )
        .await;
    }

    // Enqueue sync for old items (DELETE)
    for mut old_item in old_items {
        old_item.deleted_at = Some(now.clone());
        old_item.updated_at = Some(now.clone());
        let item_id = old_item.id.clone();
        enqueue_sync(
            state.db.as_ref(),
            &app,
            "order_items",
            "DELETE",
            &item_id,
            serde_json::json!(old_item),
        )
        .await;
    }

    // Enqueue sync for new items
    if let Ok(items_db) = OrderItem::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT id, order_id, product_url, product_qty, price, product_weight, created_at, updated_at, deleted_at FROM order_items WHERE order_id = $1 AND deleted_at IS NULL",
        [id.clone().into()],
    ))
    .all(state.db.as_ref())
    .await
    {
        for item in items_db {
            let item_id = item.id.clone();
            enqueue_sync(
                state.db.as_ref(),
                &app,
                "order_items",
                "INSERT",
                &item_id,
                serde_json::json!(item),
            )
            .await;
        }
    }

    Ok(())
}

pub async fn delete_order(state: Arc<AppState>, app: &AppHandle, id: String) -> AppResult<()> {
    let backend = state.db.as_ref().get_database_backend();
    let now = chrono::Utc::now().to_rfc3339();

    // Soft delete order
    state
        .db
        .execute(Statement::from_sql_and_values(
            backend,
            "UPDATE orders SET deleted_at = $1, updated_at = $2 WHERE id = $3",
            [now.clone().into(), now.clone().into(), id.clone().into()],
        ))
        .await
        .map_err(|e| e.to_string())?;

    // Soft delete order items
    state
        .db
        .execute(Statement::from_sql_and_values(
            backend,
            "UPDATE order_items SET deleted_at = $1, updated_at = $2 WHERE order_id = $3",
            [now.clone().into(), now.into(), id.clone().into()],
        ))
        .await
        .map_err(|e| e.to_string())?;

    // Enqueue sync
    if let Ok(Some(order)) = crate::models::Order::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT id, order_id, customer_id, status, order_from, exchange_rate, shipping_fee, delivery_fee, cargo_fee, order_date, arrived_date, shipment_date, user_withdraw_date, created_at, service_fee, product_discount, service_fee_type, shipping_fee_paid, delivery_fee_paid, cargo_fee_paid, service_fee_paid, shipping_fee_by_shop, delivery_fee_by_shop, cargo_fee_by_shop, exclude_cargo_fee, updated_at, deleted_at FROM orders WHERE id = $1",
        [id.clone().into()],
    ))
    .one(state.db.as_ref())
    .await
    {
        enqueue_sync(
            state.db.as_ref(),
            &app,
            "orders",
            "DELETE",
            &id,
            serde_json::json!(order),
        )
        .await;
    }

    if let Ok(items_db) = OrderItem::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT id, order_id, product_url, product_qty, price, product_weight, created_at, updated_at, deleted_at FROM order_items WHERE order_id = $1",
        [id.clone().into()],
    ))
    .all(state.db.as_ref())
    .await
    {
        for item in items_db {
            let item_id = item.id.clone();
            enqueue_sync(
                state.db.as_ref(),
                &app,
                "order_items",
                "DELETE",
                &item_id,
                serde_json::json!(item),
            )
            .await;
        }
    }

    Ok(())
}

pub async fn get_dashboard_stats(
    state: Arc<AppState>,
    date_from: Option<String>,
    date_to: Option<String>,
    date_field: Option<String>,
    status: Option<String>,
) -> AppResult<DashboardStats> {
    let backend = state.db.as_ref().get_database_backend();

    let selected_date_field = normalized_dashboard_date_field(date_field);
    let df = date_from.unwrap_or_default().trim().to_string();
    let dt = date_to.unwrap_or_default().trim().to_string();
    let has_range = !df.is_empty() && !dt.is_empty();
    let range_from = if has_range {
        parse_flexible_date(Some(&df)).ok_or_else(|| "Invalid date_from".to_string())?
    } else {
        NaiveDate::from_ymd_opt(1970, 1, 1).ok_or_else(|| "Invalid range start".to_string())?
    };
    let range_to = if has_range {
        parse_flexible_date(Some(&dt)).ok_or_else(|| "Invalid date_to".to_string())?
    } else {
        NaiveDate::from_ymd_opt(2999, 12, 31).ok_or_else(|| "Invalid range end".to_string())?
    };
    let range_from_opt = if has_range { Some(range_from) } else { None };
    let range_to_opt = if has_range { Some(range_to) } else { None };
    let normalized_status = normalize_order_status_filter(status)?;
    let query = format!(
        "{} WHERE o.deleted_at IS NULL {} ORDER BY o.created_at DESC, o.id DESC",
        ORDER_WITH_CUSTOMER_SELECT, ORDER_WITH_CUSTOMER_GROUP_BY
    );
    let orders = OrderWithCustomer::find_by_statement(Statement::from_string(backend, query))
        .all(state.db.as_ref())
        .await
        .map_err(|e| e.to_string())?;

    let mut total_revenue = 0.0;
    let mut total_profit = 0.0;
    let mut total_cargo_fee = 0.0;
    let mut paid_cargo_fee = 0.0;
    let mut unpaid_cargo_fee = 0.0;
    let mut total_orders = 0_i64;
    let mut unique_customers = HashSet::<String>::new();
    let mut recent_orders = Vec::<OrderWithCustomer>::new();

    for order in orders {
        if let Some(expected_status) = normalized_status.as_deref() {
            let status_value = order.status.as_deref().unwrap_or("").trim().to_lowercase();
            if status_value != expected_status {
                continue;
            }
        }

        if !matches_dashboard_date_range(&order, selected_date_field, range_from_opt, range_to_opt)
        {
            continue;
        }

        total_orders += 1;
        if let Some(cid) = order.customer_id.clone() {
            unique_customers.insert(cid);
        }

        let revenue = order.total_price.unwrap_or(0.0);
        let profit = calculate_dashboard_profit(&order);
        let cargo_fee = calculate_effective_cargo_fee(&order);

        total_revenue += revenue;
        total_profit += profit;
        total_cargo_fee += cargo_fee;

        if cargo_fee > 0.0 {
            if order.cargo_fee_paid.unwrap_or(0) != 0 {
                paid_cargo_fee += cargo_fee;
            } else {
                unpaid_cargo_fee += cargo_fee;
            }
        }

        if recent_orders.len() < 5 {
            recent_orders.push(order);
        }
    }

    Ok(DashboardStats {
        total_revenue,
        total_profit,
        total_cargo_fee,
        paid_cargo_fee,
        unpaid_cargo_fee,
        total_orders,
        total_customers: unique_customers.len() as i64,
        recent_orders,
    })
}

pub async fn get_dashboard_detail_records(
    state: Arc<AppState>,
    record_type: String,
    date_from: Option<String>,
    date_to: Option<String>,
    date_field: Option<String>,
    status: Option<String>,
) -> AppResult<Vec<DashboardDetailRecord>> {
    let backend = state.db.as_ref().get_database_backend();

    let selected_date_field = normalized_dashboard_date_field(date_field);
    let df = date_from.unwrap_or_default().trim().to_string();
    let dt = date_to.unwrap_or_default().trim().to_string();
    let has_range = !df.is_empty() && !dt.is_empty();
    let range_from = if has_range {
        parse_flexible_date(Some(&df)).ok_or_else(|| "Invalid date_from".to_string())?
    } else {
        NaiveDate::from_ymd_opt(1970, 1, 1).ok_or_else(|| "Invalid range start".to_string())?
    };
    let range_to = if has_range {
        parse_flexible_date(Some(&dt)).ok_or_else(|| "Invalid date_to".to_string())?
    } else {
        NaiveDate::from_ymd_opt(2999, 12, 31).ok_or_else(|| "Invalid range end".to_string())?
    };
    let range_from_opt = if has_range { Some(range_from) } else { None };
    let range_to_opt = if has_range { Some(range_to) } else { None };
    let normalized_status = normalize_order_status_filter(status)?;

    if !matches!(
        record_type.as_str(),
        "profit" | "cargo" | "paid_cargo" | "unpaid_cargo"
    ) {
        return Err(
            "Invalid record_type. Must be 'profit', 'cargo', 'paid_cargo', or 'unpaid_cargo'."
                .into(),
        );
    }

    let query = format!(
        "{} WHERE o.deleted_at IS NULL {} ORDER BY o.created_at DESC, o.id DESC",
        ORDER_WITH_CUSTOMER_SELECT, ORDER_WITH_CUSTOMER_GROUP_BY
    );
    let orders = OrderWithCustomer::find_by_statement(Statement::from_string(backend, query))
        .all(state.db.as_ref())
        .await
        .map_err(|e| e.to_string())?;

    let mut records = Vec::<DashboardDetailRecord>::new();

    for order in orders {
        if let Some(expected_status) = normalized_status.as_deref() {
            let status_value = order.status.as_deref().unwrap_or("").trim().to_lowercase();
            if status_value != expected_status {
                continue;
            }
        }

        if !matches_dashboard_date_range(&order, selected_date_field, range_from_opt, range_to_opt)
        {
            continue;
        }

        let effective_cargo_fee = calculate_effective_cargo_fee(&order);
        let amount = match record_type.as_str() {
            "profit" => calculate_dashboard_profit(&order),
            "cargo" => effective_cargo_fee,
            "paid_cargo" => {
                if order.cargo_fee_paid.unwrap_or(0) != 0 {
                    effective_cargo_fee
                } else {
                    0.0
                }
            }
            "unpaid_cargo" => {
                if order.cargo_fee_paid.unwrap_or(0) != 0 {
                    0.0
                } else {
                    effective_cargo_fee
                }
            }
            _ => 0.0,
        };

        if amount <= 0.0 {
            continue;
        }

        let display_date = if selected_date_field == "created_at" {
            order.created_at.clone()
        } else {
            order.order_date.clone().or(order.created_at.clone())
        };

        records.push(DashboardDetailRecord {
            order_id: order.order_id.clone(),
            customer_name: order.customer_name.clone(),
            amount,
            order_date: display_date,
        });
    }

    Ok(records)
}

pub async fn get_orders_for_export(state: Arc<AppState>) -> AppResult<Vec<OrderExportRow>> {
    let backend = state.db.as_ref().get_database_backend();

    let query = r#"
        SELECT
            o.order_id,
            c.name as customer_name,
            c.phone as customer_phone,
            o.status,
            o.order_from,
            o.order_date,
            o.arrived_date,
            o.shipment_date,
            o.service_fee,
            o.product_discount,
            o.service_fee_type,
            o.exchange_rate,
            o.shipping_fee,
            o.delivery_fee,
            o.cargo_fee,
            o.shipping_fee_by_shop,
            o.delivery_fee_by_shop,
            o.cargo_fee_by_shop,
            oi.product_url,
            oi.product_qty,
            oi.price as product_price,
            oi.product_weight,
            o.created_at
        FROM orders o
        LEFT JOIN customers c ON o.customer_id = c.id
        LEFT JOIN order_items oi ON o.id = oi.order_id AND oi.deleted_at IS NULL
        ORDER BY o.id ASC
    "#;

    let rows = OrderExportRow::find_by_statement(Statement::from_string(
        backend,
        query.to_string(),
    ))
    .all(state.db.as_ref())
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows)
}
