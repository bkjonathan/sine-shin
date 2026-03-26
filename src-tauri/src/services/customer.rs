use std::sync::Arc;

use sea_orm::{ActiveModelTrait, ConnectionTrait, DatabaseBackend, EntityTrait, FromQueryResult, Set, Statement};
use tauri::AppHandle;
use tracing::instrument;
use uuid::Uuid;

use crate::db::DEFAULT_CUSTOMER_ID_PREFIX;
use crate::entities::customers;
use crate::error::{AppError, AppResult};
use crate::models::{Customer, PaginatedCustomers};
use crate::state::AppState;
use crate::sync::enqueue_sync;

const DEFAULT_CUSTOMERS_PAGE_SIZE: i64 = 5;
const MIN_CUSTOMERS_PAGE_SIZE: i64 = 5;
const MAX_CUSTOMERS_PAGE_SIZE: i64 = 100;

#[derive(Debug, FromQueryResult)]
struct CountRow {
    cnt: i64,
}

#[derive(Debug, FromQueryResult)]
struct PrefixRow {
    customer_id_prefix: Option<String>,
}

#[derive(Debug, FromQueryResult)]
struct NextSeqRow {
    next_seq: i64,
}

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
    let db = state.db.lock().await.clone();
    let record_id = id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let normalized_customer_id = customer_id
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());

    // Use entity insert; created_at defaults to CURRENT_TIMESTAMP when NotSet
    customers::ActiveModel {
        id: Set(record_id.clone()),
        customer_id: Set(normalized_customer_id.clone()),
        name: Set(name),
        phone: Set(phone),
        address: Set(address),
        city: Set(city),
        social_media_url: Set(social_media_url),
        platform: Set(platform),
        created_at: created_at
            .map(|v| Set(Some(v)))
            .unwrap_or(sea_orm::ActiveValue::NotSet),
        updated_at: Set(updated_at),
        deleted_at: Set(deleted_at),
        synced: Set(Some(0)),
    }
    .insert(&db)
    .await?;

    if normalized_customer_id.is_none() {
        let prefix_str = PrefixRow::find_by_statement(Statement::from_string(
            DatabaseBackend::Sqlite,
            "SELECT customer_id_prefix FROM shop_settings ORDER BY created_at DESC LIMIT 1"
                .to_string(),
        ))
        .one(&db)
        .await
        .unwrap_or(None)
        .and_then(|r| r.customer_id_prefix)
        .filter(|p| !p.is_empty())
        .unwrap_or_else(|| DEFAULT_CUSTOMER_ID_PREFIX.to_string());

        let like_pattern = format!("{}%", prefix_str);
        let next_seq = NextSeqRow::find_by_statement(Statement::from_sql_and_values(
            DatabaseBackend::Sqlite,
            "SELECT COALESCE(MAX(CAST(REPLACE(customer_id, ?, '') AS INTEGER)), 0) + 1 AS next_seq \
             FROM customers WHERE customer_id LIKE ?",
            [prefix_str.clone().into(), like_pattern.into()],
        ))
        .one(&db)
        .await
        .unwrap_or(None)
        .map(|r| r.next_seq)
        .unwrap_or(1);

        let new_customer_id = format!("{}{:05}", prefix_str, next_seq);
        let _ = db
            .execute(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                "UPDATE customers SET customer_id = ? WHERE id = ?",
                [new_customer_id.into(), record_id.clone().into()],
            ))
            .await;
    }

    if let Ok(Some(record)) = Customer::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Sqlite,
        "SELECT id, customer_id, name, phone, address, city, social_media_url, platform, \
         created_at, updated_at, deleted_at FROM customers WHERE id = ?",
        [record_id.clone().into()],
    ))
    .one(&db)
    .await
    {
        let pool = state.pool.lock().await;
        enqueue_sync(&pool, app, "customers", "INSERT", &record_id, serde_json::json!(record))
            .await;
    }

    Ok(record_id)
}

/// Loads all customers in reverse creation order.
#[instrument(skip(state))]
pub async fn get_customers(state: Arc<AppState>) -> AppResult<Vec<Customer>> {
    let db = state.db.lock().await.clone();
    let customers = Customer::find_by_statement(Statement::from_string(
        DatabaseBackend::Sqlite,
        "SELECT id, customer_id, name, phone, address, city, social_media_url, platform, \
         created_at, updated_at, deleted_at FROM customers ORDER BY created_at DESC"
            .to_string(),
    ))
    .all(&db)
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
    let db = state.db.lock().await.clone();

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
    let sort_dir = if sort_order.as_deref() == Some("asc") {
        "ASC"
    } else {
        "DESC"
    };

    let base_select = "SELECT id, customer_id, name, phone, address, city, social_media_url, \
                       platform, created_at, updated_at, deleted_at FROM customers";

    let (total, customers) = if has_search {
        let count = CountRow::find_by_statement(Statement::from_sql_and_values(
            DatabaseBackend::Sqlite,
            &format!("SELECT COUNT(*) as cnt FROM customers WHERE COALESCE({}, '') LIKE ?", search_column),
            [search_pattern.clone().into()],
        ))
        .one(&db)
        .await?
        .unwrap_or(CountRow { cnt: 0 })
        .cnt;

        let data_sql = if no_limit {
            format!("{} WHERE COALESCE({}, '') LIKE ? ORDER BY {} {}", base_select, search_column, sort_column, sort_dir)
        } else {
            format!("{} WHERE COALESCE({}, '') LIKE ? ORDER BY {} {} LIMIT ? OFFSET ?", base_select, search_column, sort_column, sort_dir)
        };

        let rows = if no_limit {
            Customer::find_by_statement(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                &data_sql,
                [search_pattern.into()],
            ))
            .all(&db)
            .await?
        } else {
            Customer::find_by_statement(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                &data_sql,
                [search_pattern.into(), page_size.into(), offset.into()],
            ))
            .all(&db)
            .await?
        };
        (count, rows)
    } else {
        let count = CountRow::find_by_statement(Statement::from_string(
            DatabaseBackend::Sqlite,
            "SELECT COUNT(*) as cnt FROM customers".to_string(),
        ))
        .one(&db)
        .await?
        .unwrap_or(CountRow { cnt: 0 })
        .cnt;

        let data_sql = if no_limit {
            format!("{} ORDER BY {} {}", base_select, sort_column, sort_dir)
        } else {
            format!("{} ORDER BY {} {} LIMIT ? OFFSET ?", base_select, sort_column, sort_dir)
        };

        let rows = if no_limit {
            Customer::find_by_statement(Statement::from_string(DatabaseBackend::Sqlite, data_sql))
                .all(&db)
                .await?
        } else {
            Customer::find_by_statement(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                &data_sql,
                [page_size.into(), offset.into()],
            ))
            .all(&db)
            .await?
        };
        (count, rows)
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
    let db = state.db.lock().await.clone();
    customers::Entity::find_by_id(id)
        .into_model::<Customer>()
        .one(&db)
        .await?
        .ok_or_else(|| AppError::not_found("Customer not found"))
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
    let db = state.db.lock().await.clone();
    let normalized_customer_id = customer_id
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());

    db.execute(Statement::from_sql_and_values(
        DatabaseBackend::Sqlite,
        "UPDATE customers SET customer_id = ?, name = ?, phone = ?, address = ?, city = ?, \
         social_media_url = ?, platform = ?, \
         created_at = COALESCE(?, created_at), \
         updated_at = COALESCE(?, datetime('now')), \
         deleted_at = ? WHERE id = ?",
        [
            normalized_customer_id.into(),
            name.into(),
            phone.into(),
            address.into(),
            city.into(),
            social_media_url.into(),
            platform.into(),
            created_at.into(),
            updated_at.into(),
            deleted_at.into(),
            id.clone().into(),
        ],
    ))
    .await?;

    if let Ok(Some(record)) = customers::Entity::find_by_id(id.clone())
        .into_model::<Customer>()
        .one(&db)
        .await
    {
        let pool = state.pool.lock().await;
        enqueue_sync(&pool, app, "customers", "UPDATE", &id, serde_json::json!(record)).await;
    }

    Ok(())
}

/// Soft-deletes a customer and enqueues sync payload.
#[instrument(skip(state, app))]
pub async fn delete_customer(state: Arc<AppState>, app: &AppHandle, id: String) -> AppResult<()> {
    let db = state.db.lock().await.clone();

    db.execute(Statement::from_sql_and_values(
        DatabaseBackend::Sqlite,
        "UPDATE customers SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
        [id.clone().into()],
    ))
    .await?;

    if let Ok(Some(record)) = customers::Entity::find_by_id(id.clone())
        .into_model::<Customer>()
        .one(&db)
        .await
    {
        let pool = state.pool.lock().await;
        enqueue_sync(&pool, app, "customers", "DELETE", &id, serde_json::json!(record)).await;
    }

    Ok(())
}
