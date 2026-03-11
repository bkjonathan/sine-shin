use chrono::{DateTime, NaiveDate, NaiveDateTime};
use sqlx::{QueryBuilder, Sqlite};
use std::collections::HashSet;
use std::sync::Arc;

use tauri::AppHandle;

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
    let shipping_fee = if order.shipping_fee_by_shop.unwrap_or(false) {
        order.shipping_fee.unwrap_or(0.0)
    } else {
        0.0
    };
    let delivery_fee = if order.delivery_fee_by_shop.unwrap_or(false) {
        order.delivery_fee.unwrap_or(0.0)
    } else {
        0.0
    };
    let cargo_fee =
        if order.cargo_fee_by_shop.unwrap_or(false) && !order.exclude_cargo_fee.unwrap_or(false) {
            order.cargo_fee.unwrap_or(0.0)
        } else {
            0.0
        };

    service_fee_amount + product_discount + shipping_fee + delivery_fee + cargo_fee
}

fn calculate_effective_cargo_fee(order: &OrderWithCustomer) -> f64 {
    if order.exclude_cargo_fee.unwrap_or(false) {
        return 0.0;
    }

    order.cargo_fee.unwrap_or(0.0)
}

pub async fn create_order(
    state: Arc<AppState>,
    app: &AppHandle,
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
) -> AppResult<i64> {
    let pool = state.db.lock().await;
    let normalized_status =
        normalize_order_status(status)?.unwrap_or_else(|| "pending".to_string());

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let inserted_id = if let Some(provided_id) = id {
        sqlx::query(
            "INSERT INTO orders (id, customer_id, status, order_from, exchange_rate, shipping_fee, delivery_fee, cargo_fee, order_date, arrived_date, shipment_date, user_withdraw_date, service_fee, product_discount, service_fee_type, shipping_fee_paid, delivery_fee_paid, cargo_fee_paid, service_fee_paid, shipping_fee_by_shop, delivery_fee_by_shop, cargo_fee_by_shop, exclude_cargo_fee) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(provided_id)
        .bind(customer_id)
        .bind(normalized_status.clone())
        .bind(order_from.clone())
        .bind(exchange_rate)
        .bind(shipping_fee)
        .bind(delivery_fee)
        .bind(cargo_fee)
        .bind(order_date.clone())
        .bind(arrived_date.clone())
        .bind(shipment_date.clone())
        .bind(user_withdraw_date.clone())
        .bind(service_fee)
        .bind(product_discount)
        .bind(service_fee_type.clone())
        .bind(shipping_fee_paid.unwrap_or(false))
        .bind(delivery_fee_paid.unwrap_or(false))
        .bind(cargo_fee_paid.unwrap_or(false))
        .bind(service_fee_paid.unwrap_or(false))
        .bind(shipping_fee_by_shop.unwrap_or(false))
        .bind(delivery_fee_by_shop.unwrap_or(false))
        .bind(cargo_fee_by_shop.unwrap_or(false))
        .bind(exclude_cargo_fee.unwrap_or(false))
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .last_insert_rowid()
    } else {
        sqlx::query(
            "INSERT INTO orders (customer_id, status, order_from, exchange_rate, shipping_fee, delivery_fee, cargo_fee, order_date, arrived_date, shipment_date, user_withdraw_date, service_fee, product_discount, service_fee_type, shipping_fee_paid, delivery_fee_paid, cargo_fee_paid, service_fee_paid, shipping_fee_by_shop, delivery_fee_by_shop, cargo_fee_by_shop, exclude_cargo_fee) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(customer_id)
        .bind(normalized_status)
        .bind(order_from)
        .bind(exchange_rate)
        .bind(shipping_fee)
        .bind(delivery_fee)
        .bind(cargo_fee)
        .bind(order_date)
        .bind(arrived_date)
        .bind(shipment_date)
        .bind(user_withdraw_date)
        .bind(service_fee)
        .bind(product_discount)
        .bind(service_fee_type)
        .bind(shipping_fee_paid.unwrap_or(false))
        .bind(delivery_fee_paid.unwrap_or(false))
        .bind(cargo_fee_paid.unwrap_or(false))
        .bind(service_fee_paid.unwrap_or(false))
        .bind(shipping_fee_by_shop.unwrap_or(false))
        .bind(delivery_fee_by_shop.unwrap_or(false))
        .bind(cargo_fee_by_shop.unwrap_or(false))
        .bind(exclude_cargo_fee.unwrap_or(false))
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .last_insert_rowid()
    };

    for item in items {
        sqlx::query("INSERT INTO order_items (order_id, product_url, product_qty, price, product_weight) VALUES (?, ?, ?, ?, ?)")
            .bind(inserted_id)
            .bind(item.product_url)
            .bind(item.product_qty)
            .bind(item.price)
            .bind(item.product_weight)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }

    if let Some(oid) = order_id {
        let _ = sqlx::query("UPDATE orders SET order_id = ? WHERE id = ?")
            .bind(oid)
            .bind(inserted_id)
            .execute(&mut *tx)
            .await;
    } else {
        let prefix: Option<String> = sqlx::query_scalar(
            "SELECT order_id_prefix FROM shop_settings ORDER BY id DESC LIMIT 1",
        )
        .fetch_optional(&mut *tx)
        .await
        .unwrap_or(Some(DEFAULT_ORDER_ID_PREFIX.to_string()));

        let prefix_str = prefix
            .filter(|p| !p.is_empty())
            .unwrap_or_else(|| DEFAULT_ORDER_ID_PREFIX.to_string());
        let new_order_id = format!("{}{:05}", prefix_str, inserted_id);

        let _ = sqlx::query("UPDATE orders SET order_id = ? WHERE id = ?")
            .bind(new_order_id)
            .bind(inserted_id)
            .execute(&mut *tx)
            .await;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    // Enqueue sync for order
    if let Ok(order) =
        sqlx::query_as::<_, crate::models::Order>("SELECT * FROM orders WHERE id = ?")
            .bind(inserted_id)
            .fetch_one(&*pool)
            .await
    {
        enqueue_sync(
            &pool,
            &app,
            "orders",
            "INSERT",
            inserted_id,
            serde_json::json!(order),
        )
        .await;
    }
    // Enqueue sync for order items
    if let Ok(items_db) = sqlx::query_as::<_, OrderItem>(
        "SELECT * FROM order_items WHERE order_id = ? AND deleted_at IS NULL",
    )
    .bind(inserted_id)
    .fetch_all(&*pool)
    .await
    {
        for item in items_db {
            enqueue_sync(
                &pool,
                &app,
                "order_items",
                "INSERT",
                item.id,
                serde_json::json!(item),
            )
            .await;
        }
    }

    Ok(inserted_id)
}

pub async fn get_orders(state: Arc<AppState>) -> AppResult<Vec<OrderWithCustomer>> {
    let pool = state.db.lock().await;

    let query = format!(
        "{} {} ORDER BY o.created_at DESC",
        ORDER_WITH_CUSTOMER_SELECT, ORDER_WITH_CUSTOMER_GROUP_BY
    );
    let orders = sqlx::query_as::<_, OrderWithCustomer>(&query)
        .fetch_all(&*pool)
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
    let pool = state.db.lock().await;

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
        "order_id" => "o.id", // Sort by internal ID usually correlates with order_id but is better for sorting (numbers vs strings if order_id has prefix) - actually order_id column might be string, but let's stick to o.id for 'created' order or o.order_id if the user explicitly wants that string sort. Let's use o.id for "Order ID" as it's cleaner for "newest/oldest", or o.order_id if they want string sort. Given the implementation plan said "Order ID", let's use o.id as proxy for creation order/ID order. Actually let's check what I did for Customer.
        // For customer I used customer_id.
        // Let's use o.id for reliable sorting
        "created_at" => "o.created_at",
        "date" => "o.order_date",
        _ => "o.id",
    };

    let sort_direction = match sort_order.as_deref().unwrap_or("desc") {
        "asc" => "ASC",
        "desc" => "DESC",
        _ => "DESC",
    };

    let order_clause = format!("ORDER BY {} {}", sort_column, sort_direction);

    let mut count_query = QueryBuilder::<Sqlite>::new(
        "SELECT COUNT(*) FROM orders o LEFT JOIN customers c ON o.customer_id = c.id",
    );

    if has_search || has_status_filter {
        count_query.push(" WHERE ");

        if has_search {
            count_query.push(format!("COALESCE({}, '') LIKE ", search_column));
            count_query.push_bind(&search_pattern);
        }

        if let Some(status) = normalized_status_filter.as_deref() {
            if has_search {
                count_query.push(" AND ");
            }
            count_query.push("o.status = ");
            count_query.push_bind(status);
        }
    }

    let total: i64 = count_query
        .build_query_scalar()
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut data_query = QueryBuilder::<Sqlite>::new(ORDER_WITH_CUSTOMER_SELECT);

    if has_search || has_status_filter {
        data_query.push(" WHERE ");

        if has_search {
            data_query.push(format!("COALESCE({}, '') LIKE ", search_column));
            data_query.push_bind(&search_pattern);
        }

        if let Some(status) = normalized_status_filter.as_deref() {
            if has_search {
                data_query.push(" AND ");
            }
            data_query.push("o.status = ");
            data_query.push_bind(status);
        }
    }

    data_query.push(" ");
    data_query.push(ORDER_WITH_CUSTOMER_GROUP_BY);
    data_query.push(" ");
    data_query.push(order_clause);

    if !no_limit {
        data_query.push(" LIMIT ");
        data_query.push_bind(page_size);
        data_query.push(" OFFSET ");
        data_query.push_bind(offset);
    }

    let orders = data_query
        .build_query_as::<OrderWithCustomer>()
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
    customer_id: i64,
) -> AppResult<Vec<OrderWithCustomer>> {
    let pool = state.db.lock().await;

    let query = format!(
        "{} WHERE o.customer_id = ? {} ORDER BY o.created_at DESC",
        ORDER_WITH_CUSTOMER_SELECT, ORDER_WITH_CUSTOMER_GROUP_BY
    );
    let orders = sqlx::query_as::<_, OrderWithCustomer>(&query)
        .bind(customer_id)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(orders)
}

pub async fn get_order(state: Arc<AppState>, id: i64) -> AppResult<OrderDetail> {
    let pool = state.db.lock().await;

    let query = format!(
        "{} WHERE o.id = ? {}",
        ORDER_WITH_CUSTOMER_SELECT, ORDER_WITH_CUSTOMER_GROUP_BY
    );
    let order = sqlx::query_as::<_, OrderWithCustomer>(&query)
        .bind(id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Order not found".to_string())?;

    let items = sqlx::query_as::<_, OrderItem>(
        "SELECT * FROM order_items WHERE order_id = ? AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(OrderDetail { order, items })
}

pub async fn update_order(
    state: Arc<AppState>,
    app: &AppHandle,
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
) -> AppResult<()> {
    let pool = state.db.lock().await;
    let normalized_status =
        normalize_order_status(status)?.unwrap_or_else(|| "pending".to_string());

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let old_items = sqlx::query_as::<_, OrderItem>(
        "SELECT * FROM order_items WHERE order_id = ? AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "UPDATE orders SET customer_id = ?, status = ?, order_from = ?, exchange_rate = ?, shipping_fee = ?, delivery_fee = ?, cargo_fee = ?, order_date = ?, arrived_date = ?, shipment_date = ?, user_withdraw_date = ?, service_fee = ?, product_discount = ?, service_fee_type = ?, shipping_fee_paid = ?, delivery_fee_paid = ?, cargo_fee_paid = ?, service_fee_paid = ?, shipping_fee_by_shop = ?, delivery_fee_by_shop = ?, cargo_fee_by_shop = ?, exclude_cargo_fee = ? WHERE id = ?",
    )
    .bind(customer_id)
    .bind(normalized_status)
    .bind(order_from)
    .bind(exchange_rate)
    .bind(shipping_fee)
    .bind(delivery_fee)
    .bind(cargo_fee)
    .bind(order_date)
    .bind(arrived_date)
    .bind(shipment_date)
    .bind(user_withdraw_date)
    .bind(service_fee)
    .bind(product_discount)
    .bind(service_fee_type)
    .bind(shipping_fee_paid.unwrap_or(false))
    .bind(delivery_fee_paid.unwrap_or(false))
    .bind(cargo_fee_paid.unwrap_or(false))
    .bind(service_fee_paid.unwrap_or(false))
    .bind(shipping_fee_by_shop.unwrap_or(false))
    .bind(delivery_fee_by_shop.unwrap_or(false))
    .bind(cargo_fee_by_shop.unwrap_or(false))
    .bind(exclude_cargo_fee.unwrap_or(false))
    .bind(id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "UPDATE order_items SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE order_id = ? AND deleted_at IS NULL",
    )
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    for item in items {
        sqlx::query("INSERT INTO order_items (order_id, product_url, product_qty, price, product_weight) VALUES (?, ?, ?, ?, ?)")
            .bind(id)
            .bind(item.product_url)
            .bind(item.product_qty)
            .bind(item.price)
            .bind(item.product_weight)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    // Enqueue sync for order
    if let Ok(order) =
        sqlx::query_as::<_, crate::models::Order>("SELECT * FROM orders WHERE id = ?")
            .bind(id)
            .fetch_one(&*pool)
            .await
    {
        enqueue_sync(
            &pool,
            &app,
            "orders",
            "UPDATE",
            id,
            serde_json::json!(order),
        )
        .await;
    }

    // Enqueue sync for old items (DELETE)
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    for mut old_item in old_items {
        old_item.deleted_at = Some(now.clone());
        old_item.updated_at = Some(now.clone());
        enqueue_sync(
            &pool,
            &app,
            "order_items",
            "DELETE",
            old_item.id,
            serde_json::json!(old_item),
        )
        .await;
    }

    // Enqueue sync for order items
    if let Ok(items_db) = sqlx::query_as::<_, OrderItem>(
        "SELECT * FROM order_items WHERE order_id = ? AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_all(&*pool)
    .await
    {
        for item in items_db {
            enqueue_sync(
                &pool,
                &app,
                "order_items",
                "INSERT",
                item.id,
                serde_json::json!(item),
            )
            .await;
        }
    }

    Ok(())
}

pub async fn delete_order(state: Arc<AppState>, app: &AppHandle, id: i64) -> AppResult<()> {
    let pool = state.db.lock().await;

    // Soft delete
    sqlx::query(
        "UPDATE orders SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
    )
    .bind(id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // Also soft delete order items
    sqlx::query("UPDATE order_items SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE order_id = ?")
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    // Enqueue sync
    if let Ok(order) =
        sqlx::query_as::<_, crate::models::Order>("SELECT * FROM orders WHERE id = ?")
            .bind(id)
            .fetch_one(&*pool)
            .await
    {
        enqueue_sync(
            &pool,
            &app,
            "orders",
            "DELETE",
            id,
            serde_json::json!(order),
        )
        .await;
    }
    if let Ok(items_db) =
        sqlx::query_as::<_, OrderItem>("SELECT * FROM order_items WHERE order_id = ?")
            .bind(id)
            .fetch_all(&*pool)
            .await
    {
        for item in items_db {
            enqueue_sync(
                &pool,
                &app,
                "order_items",
                "DELETE",
                item.id,
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
    let pool = state.db.lock().await;

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
    let orders = sqlx::query_as::<_, OrderWithCustomer>(&query)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut total_revenue = 0.0;
    let mut total_profit = 0.0;
    let mut total_cargo_fee = 0.0;
    let mut paid_cargo_fee = 0.0;
    let mut unpaid_cargo_fee = 0.0;
    let mut total_orders = 0_i64;
    let mut unique_customers = HashSet::<i64>::new();
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
        if let Some(customer_id) = order.customer_id {
            unique_customers.insert(customer_id);
        }

        let revenue = order.total_price.unwrap_or(0.0);
        let profit = calculate_dashboard_profit(&order);
        let cargo_fee = calculate_effective_cargo_fee(&order);

        total_revenue += revenue;
        total_profit += profit;
        total_cargo_fee += cargo_fee;

        if cargo_fee > 0.0 {
            if order.cargo_fee_paid.unwrap_or(false) {
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
    let pool = state.db.lock().await;

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
    let orders = sqlx::query_as::<_, OrderWithCustomer>(&query)
        .fetch_all(&*pool)
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
                if order.cargo_fee_paid.unwrap_or(false) {
                    effective_cargo_fee
                } else {
                    0.0
                }
            }
            "unpaid_cargo" => {
                if order.cargo_fee_paid.unwrap_or(false) {
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
    let pool = state.db.lock().await;

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

    let rows = sqlx::query_as::<_, OrderExportRow>(query)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows)
}
