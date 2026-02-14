use tauri::{AppHandle, Manager};

use crate::db::{
    DEFAULT_ORDER_ID_PREFIX, ORDER_WITH_CUSTOMER_GROUP_BY, ORDER_WITH_CUSTOMER_SELECT,
};
use crate::models::{DashboardStats, OrderDetail, OrderItem, OrderItemPayload, OrderWithCustomer};
use crate::state::AppDb;

#[tauri::command]
pub async fn create_order(
    app: AppHandle,
    customer_id: i64,
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
    service_fee_type: Option<String>,
    items: Vec<OrderItemPayload>,
) -> Result<i64, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let id = sqlx::query(
        "INSERT INTO orders (customer_id, order_from, exchange_rate, shipping_fee, delivery_fee, cargo_fee, order_date, arrived_date, shipment_date, user_withdraw_date, service_fee, service_fee_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(customer_id)
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
    .bind(service_fee_type)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .last_insert_rowid();

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

    let prefix: Option<String> =
        sqlx::query_scalar("SELECT order_id_prefix FROM shop_settings ORDER BY id DESC LIMIT 1")
            .fetch_optional(&mut *tx)
            .await
            .unwrap_or(Some(DEFAULT_ORDER_ID_PREFIX.to_string()));

    let prefix_str = prefix.unwrap_or_else(|| DEFAULT_ORDER_ID_PREFIX.to_string());
    let order_id = format!("{}{:05}", prefix_str, id);

    let _ = sqlx::query("UPDATE orders SET order_id = ? WHERE id = ?")
        .bind(order_id)
        .bind(id)
        .execute(&mut *tx)
        .await;

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(id)
}

#[tauri::command]
pub async fn get_orders(app: AppHandle) -> Result<Vec<OrderWithCustomer>, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

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
    let orders = sqlx::query_as::<_, OrderWithCustomer>(&query)
        .bind(customer_id)
        .fetch_all(&*pool)
        .await
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
    let order = sqlx::query_as::<_, OrderWithCustomer>(&query)
        .bind(id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Order not found".to_string())?;

    let items = sqlx::query_as::<_, OrderItem>("SELECT * FROM order_items WHERE order_id = ?")
        .bind(id)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(OrderDetail { order, items })
}

#[tauri::command]
pub async fn update_order(
    app: AppHandle,
    id: i64,
    customer_id: i64,
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
    service_fee_type: Option<String>,
    items: Vec<OrderItemPayload>,
) -> Result<(), String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query(
        "UPDATE orders SET customer_id = ?, order_from = ?, exchange_rate = ?, shipping_fee = ?, delivery_fee = ?, cargo_fee = ?, order_date = ?, arrived_date = ?, shipment_date = ?, user_withdraw_date = ?, service_fee = ?, service_fee_type = ? WHERE id = ?",
    )
    .bind(customer_id)
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
    .bind(service_fee_type)
    .bind(id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM order_items WHERE order_id = ?")
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

    Ok(())
}

#[tauri::command]
pub async fn delete_order(app: AppHandle, id: i64) -> Result<(), String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    sqlx::query("DELETE FROM orders WHERE id = ?")
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_dashboard_stats(app: AppHandle) -> Result<DashboardStats, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let total_revenue: (f64,) =
        sqlx::query_as("SELECT COALESCE(SUM(price * product_qty), 0.0) FROM order_items")
            .fetch_one(&*pool)
            .await
            .map_err(|e| e.to_string())?;

    let total_orders: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM orders")
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let total_customers: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM customers")
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let query = format!(
        "{} {} ORDER BY o.created_at DESC LIMIT 5",
        ORDER_WITH_CUSTOMER_SELECT, ORDER_WITH_CUSTOMER_GROUP_BY
    );
    let recent_orders = sqlx::query_as::<_, OrderWithCustomer>(&query)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(DashboardStats {
        total_revenue: total_revenue.0,
        total_orders: total_orders.0,
        total_customers: total_customers.0,
        recent_orders,
    })
}
