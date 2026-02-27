use tauri::{AppHandle, Manager};

use crate::db::{
    DEFAULT_ORDER_ID_PREFIX, ORDER_WITH_CUSTOMER_GROUP_BY, ORDER_WITH_CUSTOMER_SELECT,
};
use crate::models::{
    DashboardStats, OrderDetail, OrderExportRow, OrderItem, OrderItemPayload, OrderWithCustomer,
    PaginatedOrders,
};
use crate::state::AppDb;
use crate::{db_query, db_query_as_one, db_query_as, db_query_as_optional, db_query_scalar};
use crate::sync::enqueue_sync;

const DEFAULT_ORDERS_PAGE_SIZE: i64 = 5;
const MIN_ORDERS_PAGE_SIZE: i64 = 5;
const MAX_ORDERS_PAGE_SIZE: i64 = 100;

fn normalize_order_status(status: Option<String>) -> Result<Option<String>, String> {
    let normalized = status
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty());

    match normalized.as_deref() {
        None => Ok(None),
        Some("pending" | "confirmed" | "shipping" | "completed" | "cancelled") => Ok(normalized),
        Some(_) => Err("Invalid order status".to_string()),
    }
}

fn normalize_order_status_filter(status: Option<String>) -> Result<Option<String>, String> {
    let normalized = status
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty());

    if matches!(normalized.as_deref(), None | Some("all")) {
        return Ok(None);
    }

    normalize_order_status(normalized)
}

#[tauri::command]
pub async fn create_order(
    app: AppHandle,
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
) -> Result<i64, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;
    let normalized_status =
        normalize_order_status(status)?.unwrap_or_else(|| "pending".to_string());

    let inserted_id = match &*pool {
        crate::state::Database::Sqlite(p) => {
            let mut tx = p.begin().await.map_err(|e| e.to_string())?;

            let id_val = if let Some(provided_id) = id {
                sqlx::query("INSERT INTO orders (id, customer_id, status, order_from, exchange_rate, shipping_fee, delivery_fee, cargo_fee, order_date, arrived_date, shipment_date, user_withdraw_date, service_fee, product_discount, service_fee_type, shipping_fee_paid, delivery_fee_paid, cargo_fee_paid, service_fee_paid, shipping_fee_by_shop, delivery_fee_by_shop, cargo_fee_by_shop, exclude_cargo_fee) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                .bind(provided_id).bind(customer_id).bind(&normalized_status).bind(&order_from).bind(exchange_rate).bind(shipping_fee).bind(delivery_fee).bind(cargo_fee).bind(&order_date).bind(&arrived_date).bind(&shipment_date).bind(&user_withdraw_date).bind(service_fee).bind(product_discount).bind(&service_fee_type).bind(shipping_fee_paid.unwrap_or(false)).bind(delivery_fee_paid.unwrap_or(false)).bind(cargo_fee_paid.unwrap_or(false)).bind(service_fee_paid.unwrap_or(false)).bind(shipping_fee_by_shop.unwrap_or(false)).bind(delivery_fee_by_shop.unwrap_or(false)).bind(cargo_fee_by_shop.unwrap_or(false)).bind(exclude_cargo_fee.unwrap_or(false))
                .execute(&mut *tx).await.map_err(|e| e.to_string())?.last_insert_rowid()
            } else {
                sqlx::query("INSERT INTO orders (customer_id, status, order_from, exchange_rate, shipping_fee, delivery_fee, cargo_fee, order_date, arrived_date, shipment_date, user_withdraw_date, service_fee, product_discount, service_fee_type, shipping_fee_paid, delivery_fee_paid, cargo_fee_paid, service_fee_paid, shipping_fee_by_shop, delivery_fee_by_shop, cargo_fee_by_shop, exclude_cargo_fee) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                .bind(customer_id).bind(&normalized_status).bind(&order_from).bind(exchange_rate).bind(shipping_fee).bind(delivery_fee).bind(cargo_fee).bind(&order_date).bind(&arrived_date).bind(&shipment_date).bind(&user_withdraw_date).bind(service_fee).bind(product_discount).bind(&service_fee_type).bind(shipping_fee_paid.unwrap_or(false)).bind(delivery_fee_paid.unwrap_or(false)).bind(cargo_fee_paid.unwrap_or(false)).bind(service_fee_paid.unwrap_or(false)).bind(shipping_fee_by_shop.unwrap_or(false)).bind(delivery_fee_by_shop.unwrap_or(false)).bind(cargo_fee_by_shop.unwrap_or(false)).bind(exclude_cargo_fee.unwrap_or(false))
                .execute(&mut *tx).await.map_err(|e| e.to_string())?.last_insert_rowid()
            };

            for item in &items {
                sqlx::query("INSERT INTO order_items (order_id, product_url, product_qty, price, product_weight) VALUES (?, ?, ?, ?, ?)")
                .bind(id_val).bind(&item.product_url).bind(item.product_qty).bind(item.price).bind(item.product_weight)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;
            }

            if let Some(ref oid) = order_id {
                sqlx::query("UPDATE orders SET order_id = ? WHERE id = ?").bind(oid).bind(id_val).execute(&mut *tx).await.map_err(|e| e.to_string())?;
            } else {
                let prefix: Option<String> = sqlx::query_scalar("SELECT order_id_prefix FROM shop_settings ORDER BY id DESC LIMIT 1").fetch_optional(&mut *tx).await.unwrap_or(Some(DEFAULT_ORDER_ID_PREFIX.to_string()));
                let prefix_str = prefix.filter(|p| !p.is_empty()).unwrap_or_else(|| DEFAULT_ORDER_ID_PREFIX.to_string());
                let new_order_id = format!("{}{:05}", prefix_str, id_val);
                sqlx::query("UPDATE orders SET order_id = ? WHERE id = ?").bind(new_order_id).bind(id_val).execute(&mut *tx).await.map_err(|e| e.to_string())?;
            }

            tx.commit().await.map_err(|e| e.to_string())?;
            id_val
        },
        #[cfg(feature = "postgres")]
        crate::state::Database::Postgres(p) => {
            let mut tx = p.begin().await.map_err(|e| e.to_string())?;

            let q1 = crate::db_macros::adapt_query_for_pg("INSERT INTO orders (id, customer_id, status, order_from, exchange_rate, shipping_fee, delivery_fee, cargo_fee, order_date, arrived_date, shipment_date, user_withdraw_date, service_fee, product_discount, service_fee_type, shipping_fee_paid, delivery_fee_paid, cargo_fee_paid, service_fee_paid, shipping_fee_by_shop, delivery_fee_by_shop, cargo_fee_by_shop, exclude_cargo_fee) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id");
            let q2 = crate::db_macros::adapt_query_for_pg("INSERT INTO orders (customer_id, status, order_from, exchange_rate, shipping_fee, delivery_fee, cargo_fee, order_date, arrived_date, shipment_date, user_withdraw_date, service_fee, product_discount, service_fee_type, shipping_fee_paid, delivery_fee_paid, cargo_fee_paid, service_fee_paid, shipping_fee_by_shop, delivery_fee_by_shop, cargo_fee_by_shop, exclude_cargo_fee) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id");
            let id_val: i64 = if let Some(provided_id) = id {
                sqlx::query_scalar(&q1)
                .bind(provided_id).bind(customer_id).bind(&normalized_status).bind(&order_from).bind(exchange_rate).bind(shipping_fee).bind(delivery_fee).bind(cargo_fee).bind(&order_date).bind(&arrived_date).bind(&shipment_date).bind(&user_withdraw_date).bind(service_fee).bind(product_discount).bind(&service_fee_type).bind(shipping_fee_paid.unwrap_or(false)).bind(delivery_fee_paid.unwrap_or(false)).bind(cargo_fee_paid.unwrap_or(false)).bind(service_fee_paid.unwrap_or(false)).bind(shipping_fee_by_shop.unwrap_or(false)).bind(delivery_fee_by_shop.unwrap_or(false)).bind(cargo_fee_by_shop.unwrap_or(false)).bind(exclude_cargo_fee.unwrap_or(false))
                .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?
            } else {
                sqlx::query_scalar(&q2)
                .bind(customer_id).bind(&normalized_status).bind(&order_from).bind(exchange_rate).bind(shipping_fee).bind(delivery_fee).bind(cargo_fee).bind(&order_date).bind(&arrived_date).bind(&shipment_date).bind(&user_withdraw_date).bind(service_fee).bind(product_discount).bind(&service_fee_type).bind(shipping_fee_paid.unwrap_or(false)).bind(delivery_fee_paid.unwrap_or(false)).bind(cargo_fee_paid.unwrap_or(false)).bind(service_fee_paid.unwrap_or(false)).bind(shipping_fee_by_shop.unwrap_or(false)).bind(delivery_fee_by_shop.unwrap_or(false)).bind(cargo_fee_by_shop.unwrap_or(false)).bind(exclude_cargo_fee.unwrap_or(false))
                .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?
            };

            let qi = crate::db_macros::adapt_query_for_pg("INSERT INTO order_items (order_id, product_url, product_qty, price, product_weight) VALUES (?, ?, ?, ?, ?)");
            for item in &items {
                sqlx::query(&qi)
                .bind(id_val).bind(&item.product_url).bind(item.product_qty).bind(item.price).bind(item.product_weight)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;
            }

            if let Some(ref oid) = order_id {
                let qu = crate::db_macros::adapt_query_for_pg("UPDATE orders SET order_id = ? WHERE id = ?");
                sqlx::query(&qu).bind(oid).bind(id_val).execute(&mut *tx).await.map_err(|e| e.to_string())?;
            } else {
                let prefix: Option<String> = sqlx::query_scalar(&crate::db_macros::adapt_query_for_pg("SELECT order_id_prefix FROM shop_settings ORDER BY id DESC LIMIT 1")).fetch_optional(&mut *tx).await.unwrap_or(Some(DEFAULT_ORDER_ID_PREFIX.to_string()));
                let prefix_str = prefix.filter(|p| !p.is_empty()).unwrap_or_else(|| DEFAULT_ORDER_ID_PREFIX.to_string());
                let new_order_id = format!("{}{:05}", prefix_str, id_val);
                let qu = crate::db_macros::adapt_query_for_pg("UPDATE orders SET order_id = ? WHERE id = ?");
                sqlx::query(&qu).bind(new_order_id).bind(id_val).execute(&mut *tx).await.map_err(|e| e.to_string())?;
            }

            tx.commit().await.map_err(|e| e.to_string())?;
            id_val
        },
        #[cfg(not(feature = "postgres"))]
        _ => unreachable!(),
    };

    // Enqueue sync for order
    if let Ok(order) = db_query_as_one!(crate::models::Order, &*pool, "SELECT * FROM orders WHERE id = ?", inserted_id)
    {
        enqueue_sync(&pool, "orders", "INSERT", inserted_id, serde_json::json!(order)).await;
    }
    // Enqueue sync for order items
    if let Ok(items_db) = db_query_as!(OrderItem, &*pool, "SELECT * FROM order_items WHERE order_id = ?", inserted_id)
    {
        for item in items_db {
            enqueue_sync(&pool, "order_items", "INSERT", item.id, serde_json::json!(item)).await;
        }
    }

    Ok(inserted_id)
}

#[tauri::command]
pub async fn get_orders(app: AppHandle) -> Result<Vec<OrderWithCustomer>, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let query = format!(
        "{} {} ORDER BY o.created_at DESC",
        ORDER_WITH_CUSTOMER_SELECT, ORDER_WITH_CUSTOMER_GROUP_BY
    );
    let orders = db_query_as!(OrderWithCustomer, &*pool, &query)
        .map_err(|e| e.to_string())?;

    Ok(orders)
}

#[tauri::command]
pub async fn get_orders_paginated(
    app: AppHandle,
    page: Option<i64>,
    page_size: Option<i64>,
    search_key: Option<String>,
    search_term: Option<String>,
    status_filter: Option<String>,
    sort_by: Option<String>,
    sort_order: Option<String>,
) -> Result<PaginatedOrders, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

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
        _ => return Err("Invalid search key".to_string()),
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

    let mut where_clause = String::new();
    if has_search || has_status_filter {
        where_clause.push_str(" WHERE ");
        let mut conditions = Vec::new();
        if has_search {
            conditions.push(format!("COALESCE({}, '') LIKE ?", search_column));
        }
        if let Some(status) = &normalized_status_filter {
            conditions.push(format!("o.status = '{}'", status));
        }
        where_clause.push_str(&conditions.join(" AND "));
    }

    let limit_clause = if no_limit {
        String::new()
    } else {
        format!(" LIMIT {} OFFSET {}", page_size, offset)
    };

    let count_query = format!(
        "SELECT COUNT(*) FROM orders o LEFT JOIN customers c ON o.customer_id = c.id {}",
        where_clause
    );

    let total: i64 = if has_search {
        db_query_scalar!(i64, &*pool, &count_query, &search_pattern)
            .map_err(|e| e.to_string())?
    } else {
        db_query_scalar!(i64, &*pool, &count_query)
            .map_err(|e| e.to_string())?
    };

    let data_query = format!(
        "{} {} {} {} {}",
        ORDER_WITH_CUSTOMER_SELECT, where_clause, ORDER_WITH_CUSTOMER_GROUP_BY, order_clause, limit_clause
    );

    let orders = if has_search {
        db_query_as!(OrderWithCustomer, &*pool, &data_query, &search_pattern)
            .map_err(|e| e.to_string())?
    } else {
        db_query_as!(OrderWithCustomer, &*pool, &data_query)
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

#[tauri::command]
pub async fn get_customer_orders(
    app: AppHandle,
    customer_id: i64,
) -> Result<Vec<OrderWithCustomer>, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let query = format!(
        "{} WHERE o.customer_id = ? {} ORDER BY o.created_at DESC",
        ORDER_WITH_CUSTOMER_SELECT, ORDER_WITH_CUSTOMER_GROUP_BY
    );
    let orders = db_query_as!(OrderWithCustomer, &*pool, &query, customer_id)
        .map_err(|e| e.to_string())?;

    Ok(orders)
}

#[tauri::command]
pub async fn get_order(app: AppHandle, id: i64) -> Result<OrderDetail, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let query = format!(
        "{} WHERE o.id = ? {}",
        ORDER_WITH_CUSTOMER_SELECT, ORDER_WITH_CUSTOMER_GROUP_BY
    );
    let order = db_query_as_optional!(OrderWithCustomer, &*pool, &query, id)
        .map_err(|e| e.to_string())?
        .ok_or("Order not found".to_string())?;

    let items = db_query_as!(OrderItem, &*pool, "SELECT * FROM order_items WHERE order_id = ?", id)
        .map_err(|e| e.to_string())?;

    Ok(OrderDetail { order, items })
}

#[tauri::command]
pub async fn update_order(
    app: AppHandle,
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
) -> Result<(), String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;
    let normalized_status =
        normalize_order_status(status)?.unwrap_or_else(|| "pending".to_string());

    match &*pool {
        crate::state::Database::Sqlite(p) => {
            let mut tx = p.begin().await.map_err(|e| e.to_string())?;
            sqlx::query("UPDATE orders SET customer_id = ?, status = ?, order_from = ?, exchange_rate = ?, shipping_fee = ?, delivery_fee = ?, cargo_fee = ?, order_date = ?, arrived_date = ?, shipment_date = ?, user_withdraw_date = ?, service_fee = ?, product_discount = ?, service_fee_type = ?, shipping_fee_paid = ?, delivery_fee_paid = ?, cargo_fee_paid = ?, service_fee_paid = ?, shipping_fee_by_shop = ?, delivery_fee_by_shop = ?, cargo_fee_by_shop = ?, exclude_cargo_fee = ? WHERE id = ?")
            .bind(customer_id).bind(&normalized_status).bind(&order_from).bind(exchange_rate).bind(shipping_fee).bind(delivery_fee).bind(cargo_fee).bind(&order_date).bind(&arrived_date).bind(&shipment_date).bind(&user_withdraw_date).bind(service_fee).bind(product_discount).bind(&service_fee_type).bind(shipping_fee_paid.unwrap_or(false)).bind(delivery_fee_paid.unwrap_or(false)).bind(cargo_fee_paid.unwrap_or(false)).bind(service_fee_paid.unwrap_or(false)).bind(shipping_fee_by_shop.unwrap_or(false)).bind(delivery_fee_by_shop.unwrap_or(false)).bind(cargo_fee_by_shop.unwrap_or(false)).bind(exclude_cargo_fee.unwrap_or(false)).bind(id)
            .execute(&mut *tx).await.map_err(|e| e.to_string())?;

            sqlx::query("DELETE FROM order_items WHERE order_id = ?").bind(id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

            for item in &items {
                sqlx::query("INSERT INTO order_items (order_id, product_url, product_qty, price, product_weight) VALUES (?, ?, ?, ?, ?)")
                .bind(id).bind(&item.product_url).bind(item.product_qty).bind(item.price).bind(item.product_weight)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;
            }
            tx.commit().await.map_err(|e| e.to_string())?;
        },
        #[cfg(feature = "postgres")]
        crate::state::Database::Postgres(p) => {
            let mut tx = p.begin().await.map_err(|e| e.to_string())?;
            let q1 = crate::db_macros::adapt_query_for_pg("UPDATE orders SET customer_id = ?, status = ?, order_from = ?, exchange_rate = ?, shipping_fee = ?, delivery_fee = ?, cargo_fee = ?, order_date = ?, arrived_date = ?, shipment_date = ?, user_withdraw_date = ?, service_fee = ?, product_discount = ?, service_fee_type = ?, shipping_fee_paid = ?, delivery_fee_paid = ?, cargo_fee_paid = ?, service_fee_paid = ?, shipping_fee_by_shop = ?, delivery_fee_by_shop = ?, cargo_fee_by_shop = ?, exclude_cargo_fee = ? WHERE id = ?");
            sqlx::query(&q1)
            .bind(customer_id).bind(&normalized_status).bind(&order_from).bind(exchange_rate).bind(shipping_fee).bind(delivery_fee).bind(cargo_fee).bind(&order_date).bind(&arrived_date).bind(&shipment_date).bind(&user_withdraw_date).bind(service_fee).bind(product_discount).bind(&service_fee_type).bind(shipping_fee_paid.unwrap_or(false)).bind(delivery_fee_paid.unwrap_or(false)).bind(cargo_fee_paid.unwrap_or(false)).bind(service_fee_paid.unwrap_or(false)).bind(shipping_fee_by_shop.unwrap_or(false)).bind(delivery_fee_by_shop.unwrap_or(false)).bind(cargo_fee_by_shop.unwrap_or(false)).bind(exclude_cargo_fee.unwrap_or(false)).bind(id)
            .execute(&mut *tx).await.map_err(|e| e.to_string())?;

            let q2 = crate::db_macros::adapt_query_for_pg("DELETE FROM order_items WHERE order_id = ?");
            sqlx::query(&q2).bind(id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

            let q3 = crate::db_macros::adapt_query_for_pg("INSERT INTO order_items (order_id, product_url, product_qty, price, product_weight) VALUES (?, ?, ?, ?, ?)");
            for item in &items {
                sqlx::query(&q3)
                .bind(id).bind(&item.product_url).bind(item.product_qty).bind(item.price).bind(item.product_weight)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;
            }
            tx.commit().await.map_err(|e| e.to_string())?;
        },
        #[cfg(not(feature = "postgres"))]
        _ => unreachable!(),
    }

    // Enqueue sync for order
    if let Ok(order) = db_query_as_one!(crate::models::Order, &*pool, "SELECT * FROM orders WHERE id = ?", id)
    {
        enqueue_sync(&pool, "orders", "UPDATE", id, serde_json::json!(order)).await;
    }
    // Enqueue sync for order items
    if let Ok(items_db) = db_query_as!(OrderItem, &*pool, "SELECT * FROM order_items WHERE order_id = ?", id)
    {
        for item in items_db {
            enqueue_sync(&pool, "order_items", "INSERT", item.id, serde_json::json!(item)).await;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_order(app: AppHandle, id: i64) -> Result<(), String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    // Soft delete
    db_query!(&*pool, "UPDATE orders SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", id)
        .map_err(|e| e.to_string())?;

    // Also soft delete order items
    db_query!(&*pool, "UPDATE order_items SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE order_id = ?", id)
        .map_err(|e| e.to_string())?;

    // Enqueue sync
    if let Ok(order) = db_query_as_one!(crate::models::Order, &*pool, "SELECT * FROM orders WHERE id = ?", id)
    {
        enqueue_sync(&pool, "orders", "DELETE", id, serde_json::json!(order)).await;
    }
    if let Ok(items_db) = db_query_as!(OrderItem, &*pool, "SELECT * FROM order_items WHERE order_id = ?", id)
    {
        for item in items_db {
            enqueue_sync(&pool, "order_items", "DELETE", item.id, serde_json::json!(item)).await;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn get_dashboard_stats(
    app: AppHandle,
    date_from: Option<String>,
    date_to: Option<String>,
    date_field: Option<String>,
    status: Option<String>,
) -> Result<DashboardStats, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    // Validate date_field — only allow "order_date" or "created_at"
    let col = match date_field.as_deref() {
        Some("created_at") => "created_at",
        _ => "order_date", // default
    };

    let has_range = date_from.is_some() && date_to.is_some();
    let df = date_from.unwrap_or_default();
    let dt = date_to.unwrap_or_default();
    let normalized_status = normalize_order_status_filter(status)?;

    // Helper: build a WHERE clause fragment for the orders table
    let orders_where = |alias: &str| -> String {
        let mut conditions = Vec::new();

        if has_range {
            let prefix = if alias.is_empty() {
                col.to_string()
            } else {
                format!("{}.{}", alias, col)
            };
            conditions.push(format!("{} >= '{}' AND {} <= '{}'", prefix, df, prefix, dt));
        }

        if let Some(s) = &normalized_status {
            let prefix = if alias.is_empty() {
                "status".to_string()
            } else {
                format!("{}.status", alias)
            };
            conditions.push(format!("{} = '{}'", prefix, s));
        }

        if conditions.is_empty() {
            String::new()
        } else {
            format!(" WHERE {}", conditions.join(" AND "))
        }
    };

    // 1) Total revenue
    let revenue_where = orders_where("o");
    let revenue_sql = format!(
        "SELECT COALESCE(SUM(oi.price * oi.product_qty), 0.0) FROM order_items oi INNER JOIN orders o ON oi.order_id = o.id{}",
        revenue_where
    );
    let total_revenue: (f64,) = db_query_as_one!((f64,), &*pool, &revenue_sql)
        .map_err(|e| e.to_string())?;

    // 2) Total profit
    let profit_where = orders_where("");
    let profit_sql = format!(
        r#"
        SELECT COALESCE(SUM(
            CASE 
                WHEN service_fee_type = 'percent' THEN 
                    (SELECT COALESCE(SUM(price * product_qty), 0) FROM order_items WHERE order_id = orders.id) * (service_fee / 100.0)
                ELSE 
                    COALESCE(service_fee, 0)
            END
            + COALESCE(product_discount, 0)
            + CASE WHEN shipping_fee_by_shop = 1 THEN COALESCE(shipping_fee, 0) ELSE 0 END
            + CASE WHEN delivery_fee_by_shop = 1 THEN COALESCE(delivery_fee, 0) ELSE 0 END
            + CASE WHEN cargo_fee_by_shop = 1 AND exclude_cargo_fee != 1 THEN COALESCE(cargo_fee, 0) ELSE 0 END
        ), 0.0)
        FROM orders{}
        "#,
        profit_where
    );
    let total_profit: (f64,) = db_query_as_one!((f64,), &*pool, &profit_sql)
        .map_err(|e| e.to_string())?;

    // 3) Total orders
    let orders_count_sql = format!("SELECT COUNT(*) FROM orders{}", orders_where(""));
    let total_orders: (i64,) = db_query_as_one!((i64,), &*pool, &orders_count_sql)
        .map_err(|e| e.to_string())?;

    // 4) Total customers
    let customers_sql = format!("SELECT COUNT(DISTINCT customer_id) FROM orders{}", orders_where(""));
    let total_customers: (i64,) = db_query_as_one!((i64,), &*pool, &customers_sql)
        .map_err(|e| e.to_string())?;

    // 5) Total cargo fee
    let cargo_sql = format!(
        "SELECT COALESCE(SUM(CASE WHEN exclude_cargo_fee != 1 THEN cargo_fee ELSE 0 END), 0.0) FROM orders{}", 
        orders_where("")
    );
    let total_cargo_fee: (f64,) = db_query_as_one!((f64,), &*pool, &cargo_sql)
        .map_err(|e| e.to_string())?;

    // 6) Recent orders
    let recent_where = orders_where("o");
    let query = format!(
        "{}{} {} ORDER BY o.created_at DESC LIMIT 5",
        ORDER_WITH_CUSTOMER_SELECT, recent_where, ORDER_WITH_CUSTOMER_GROUP_BY
    );
    let recent_orders = db_query_as!(OrderWithCustomer, &*pool, &query)
        .map_err(|e| e.to_string())?;

    Ok(DashboardStats {
        total_revenue: total_revenue.0,
        total_profit: total_profit.0,
        total_cargo_fee: total_cargo_fee.0,
        total_orders: total_orders.0,
        total_customers: total_customers.0,
        recent_orders,
    })
}

#[tauri::command]
pub async fn get_orders_for_export(app: AppHandle) -> Result<Vec<OrderExportRow>, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

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
        LEFT JOIN order_items oi ON o.id = oi.order_id
        ORDER BY o.id ASC
    "#;

    let rows = db_query_as!(OrderExportRow, &*pool, query)
        .map_err(|e| e.to_string())?;

    Ok(rows)
}
