use std::sync::Arc;

use tauri::AppHandle;
use tracing::instrument;
use uuid::Uuid;

use crate::db::DEFAULT_CUSTOMER_ID_PREFIX;
use crate::error::{AppError, AppResult};
use crate::models::{Customer, PaginatedCustomers};
use crate::state::AppState;
use crate::sync::enqueue_sync;

const DEFAULT_CUSTOMERS_PAGE_SIZE: i64 = 5;
const MIN_CUSTOMERS_PAGE_SIZE: i64 = 5;
const MAX_CUSTOMERS_PAGE_SIZE: i64 = 100;

/// Creates a customer and optionally enqueues initial sync payload.
#[instrument(skip(state, app))]
#[allow(clippy::too_many_arguments)]
pub async fn create_customer(
    state: Arc<AppState>,
    app: &AppHandle,
    name: String,
    phone: Option<String>,
    address: Option<String>,
    city: Option<String>,
    social_media_url: Option<String>,
    platform: Option<String>,
    id: Option<String>,
    customer_id: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
    deleted_at: Option<String>,
) -> AppResult<String> {
    let pool = state.db.lock().await;
    let d = state.dialect();
    let record_id = id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let normalized_customer_id = customer_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let insert_sql = format!(
        "INSERT INTO customers \
         (id, customer_id, name, phone, address, city, social_media_url, platform, \
          created_at, updated_at, deleted_at) \
         VALUES ({}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {})",
        d.p(1), d.p(2), d.p(3), d.p(4), d.p(5), d.p(6), d.p(7), d.p(8),
        d.coalesce_or_now(9),
        d.p(10), d.p(11)
    );

    let rowid = d.query(&insert_sql)
        .bind(&record_id)
        .bind(&normalized_customer_id)
        .bind(&name)
        .bind(&phone)
        .bind(&address)
        .bind(&city)
        .bind(&social_media_url)
        .bind(&platform)
        .bind(&created_at)
        .bind(&updated_at)
        .bind(&deleted_at)
        .execute(&*pool)
        .await?
        .last_insert_id();

    if normalized_customer_id.is_none() {
        let prefix: Option<String> = d.query_scalar(
            "SELECT customer_id_prefix FROM shop_settings ORDER BY created_at DESC LIMIT 1",
        )
        .fetch_optional(&*pool)
        .await
        .unwrap_or(Some(DEFAULT_CUSTOMER_ID_PREFIX.to_string()));

        let prefix_str = prefix.unwrap_or_else(|| DEFAULT_CUSTOMER_ID_PREFIX.to_string());

        let seq_num: i64 = if d.is_postgres() {
            d.query_scalar("SELECT COUNT(*) FROM customers")
                .fetch_one(&*pool)
                .await
                .unwrap_or(1)
        } else {
            rowid.unwrap_or(0) as i64
        };

        let new_customer_id = format!("{prefix_str}{:05}", seq_num);

        let update_id_sql = format!(
            "UPDATE customers SET customer_id = {} WHERE id = {}",
            d.p(1), d.p(2)
        );
        let _ = d.query(&update_id_sql)
            .bind(new_customer_id)
            .bind(&record_id)
            .execute(&*pool)
            .await;
    }

    let select_sql = format!("SELECT * FROM customers WHERE id = {}", d.p(1));
    if let Ok(record) = d.query_as::<Customer>(&select_sql)
        .bind(&record_id)
        .fetch_one(&*pool)
        .await
    {
        enqueue_sync(
            &pool,
            app,
            "customers",
            "INSERT",
            &record_id,
            serde_json::json!(record),
        )
        .await;
    }

    Ok(record_id)
}

/// Loads all customers in reverse creation order.
#[instrument(skip(state))]
pub async fn get_customers(state: Arc<AppState>) -> AppResult<Vec<Customer>> {
    let pool = state.db.lock().await;
    let d = state.dialect();
    let customers = d.query_as::<Customer>("SELECT * FROM customers ORDER BY created_at DESC")
        .fetch_all(&*pool)
        .await?;

    Ok(customers)
}

/// Loads customers page with filtering and sorting.
#[instrument(skip(state))]
pub async fn get_customers_paginated(
    state: Arc<AppState>,
    page: Option<i64>,
    page_size: Option<i64>,
    search_key: Option<String>,
    search_term: Option<String>,
    sort_by: Option<String>,
    sort_order: Option<String>,
) -> AppResult<PaginatedCustomers> {
    let pool = state.db.lock().await;
    let d = state.dialect();

    let requested_page_size = page_size.unwrap_or(DEFAULT_CUSTOMERS_PAGE_SIZE);
    let no_limit = requested_page_size <= 0;
    let page_size = if no_limit {
        DEFAULT_CUSTOMERS_PAGE_SIZE
    } else {
        requested_page_size.clamp(MIN_CUSTOMERS_PAGE_SIZE, MAX_CUSTOMERS_PAGE_SIZE)
    };
    let page = if no_limit {
        1
    } else {
        page.unwrap_or(1).max(1)
    };
    let offset = if no_limit { 0 } else { (page - 1) * page_size };

    let raw_search = search_term.unwrap_or_default().trim().to_string();
    let has_search = !raw_search.is_empty();
    let search_pattern = format!("%{raw_search}%");

    let search_column = match search_key.as_deref().unwrap_or("name") {
        "name" => "name",
        "customerId" => "customer_id",
        "phone" => "phone",
        _ => return Err(AppError::invalid_input("Invalid search key")),
    };

    let sort_column = match sort_by.as_deref().unwrap_or("customer_id") {
        "name" => "name",
        "customer_id" => "customer_id",
        "created_at" => "created_at",
        _ => "customer_id",
    };

    let sort_direction = match sort_order.as_deref().unwrap_or("desc") {
        "asc" => "ASC",
        "desc" => "DESC",
        _ => "DESC",
    };

    let order_clause = format!("ORDER BY {sort_column} {sort_direction}");

    let (total, customers) = if has_search {
        let count_sql = format!(
            "SELECT COUNT(*) FROM customers WHERE COALESCE({search_column}, '') LIKE {}",
            d.p(1)
        );
        let total: i64 = d.query_scalar(&count_sql)
            .bind(&search_pattern)
            .fetch_one(&*pool)
            .await?;

        let customers = if no_limit {
            let data_sql = format!(
                "SELECT * FROM customers WHERE COALESCE({search_column}, '') LIKE {} {order_clause}",
                d.p(1)
            );
            d.query_as::<Customer>(&data_sql)
                .bind(&search_pattern)
                .fetch_all(&*pool)
                .await?
        } else {
            let data_sql = format!(
                "SELECT * FROM customers WHERE COALESCE({search_column}, '') LIKE {} \
                 {order_clause} LIMIT {} OFFSET {}",
                d.p(1), d.p(2), d.p(3)
            );
            d.query_as::<Customer>(&data_sql)
                .bind(&search_pattern)
                .bind(page_size)
                .bind(offset)
                .fetch_all(&*pool)
                .await?
        };

        (total, customers)
    } else {
        let total: i64 = d.query_scalar("SELECT COUNT(*) FROM customers")
            .fetch_one(&*pool)
            .await?;

        let customers = if no_limit {
            let data_sql = format!("SELECT * FROM customers {order_clause}");
            d.query_as::<Customer>(&data_sql)
                .fetch_all(&*pool)
                .await?
        } else {
            let data_sql = format!(
                "SELECT * FROM customers {order_clause} LIMIT {} OFFSET {}",
                d.p(1), d.p(2)
            );
            d.query_as::<Customer>(&data_sql)
                .bind(page_size)
                .bind(offset)
                .fetch_all(&*pool)
                .await?
        };

        (total, customers)
    };

    let response_page_size = if no_limit { total.max(0) } else { page_size };
    let total_pages = if total == 0 {
        0
    } else if no_limit {
        1
    } else {
        (total + page_size - 1) / page_size
    };

    Ok(PaginatedCustomers {
        customers,
        total,
        page,
        page_size: response_page_size,
        total_pages,
    })
}

/// Loads a single customer by id.
#[instrument(skip(state))]
pub async fn get_customer(state: Arc<AppState>, id: String) -> AppResult<Customer> {
    let pool = state.db.lock().await;
    let d = state.dialect();
    let sql = format!("SELECT * FROM customers WHERE id = {}", d.p(1));
    let customer = d.query_as::<Customer>(&sql)
        .bind(&id)
        .fetch_optional(&*pool)
        .await?
        .ok_or_else(|| AppError::not_found("Customer not found"))?;

    Ok(customer)
}

/// Updates customer row and enqueues sync payload.
#[instrument(skip(state, app))]
#[allow(clippy::too_many_arguments)]
pub async fn update_customer(
    state: Arc<AppState>,
    app: &AppHandle,
    id: String,
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
) -> AppResult<()> {
    let pool = state.db.lock().await;
    let d = state.dialect();
    let normalized_customer_id = customer_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let update_sql = format!(
        "UPDATE customers SET \
         customer_id = {}, name = {}, phone = {}, address = {}, city = {}, \
         social_media_url = {}, platform = {}, \
         created_at = COALESCE({}, created_at), \
         updated_at = {}, \
         deleted_at = {} \
         WHERE id = {}",
        d.p(1), d.p(2), d.p(3), d.p(4), d.p(5), d.p(6), d.p(7),
        d.p(8),
        d.coalesce_or_now(9),
        d.p(10),
        d.p(11)
    );

    d.query(&update_sql)
        .bind(&normalized_customer_id)
        .bind(&name)
        .bind(&phone)
        .bind(&address)
        .bind(&city)
        .bind(&social_media_url)
        .bind(&platform)
        .bind(&created_at)
        .bind(&updated_at)
        .bind(&deleted_at)
        .bind(&id)
        .execute(&*pool)
        .await?;

    let select_sql = format!("SELECT * FROM customers WHERE id = {}", d.p(1));
    if let Ok(record) = d.query_as::<Customer>(&select_sql)
        .bind(&id)
        .fetch_one(&*pool)
        .await
    {
        enqueue_sync(
            &pool,
            app,
            "customers",
            "UPDATE",
            &id,
            serde_json::json!(record),
        )
        .await;
    }

    Ok(())
}

/// Soft-deletes a customer and enqueues sync payload.
#[instrument(skip(state, app))]
pub async fn delete_customer(state: Arc<AppState>, app: &AppHandle, id: String) -> AppResult<()> {
    let pool = state.db.lock().await;
    let d = state.dialect();

    let delete_sql = format!(
        "UPDATE customers SET deleted_at = {now}, updated_at = {now} WHERE id = {p1}",
        now = d.now(),
        p1 = d.p(1)
    );
    d.query(&delete_sql)
        .bind(&id)
        .execute(&*pool)
        .await?;

    let select_sql = format!("SELECT * FROM customers WHERE id = {}", d.p(1));
    if let Ok(record) = d.query_as::<Customer>(&select_sql)
        .bind(&id)
        .fetch_one(&*pool)
        .await
    {
        enqueue_sync(
            &pool,
            app,
            "customers",
            "DELETE",
            &id,
            serde_json::json!(record),
        )
        .await;
    }

    Ok(())
}
