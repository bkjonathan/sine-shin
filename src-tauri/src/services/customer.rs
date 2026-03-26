use std::sync::Arc;

use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, EntityTrait, FromQueryResult, PaginatorTrait, QueryFilter,
    Set, Statement,
};
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
    _uuid: Option<String>,
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
    use crate::entities::customers;

    let normalized_customer_id = customer_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let new_id = id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = chrono::Utc::now().to_rfc3339();

    customers::ActiveModel {
        id: Set(new_id.clone()),
        name: Set(name.clone()),
        phone: Set(phone),
        address: Set(address),
        city: Set(city),
        social_media_url: Set(social_media_url),
        platform: Set(platform),
        customer_id: Set(normalized_customer_id.clone()),
        created_at: Set(Some(created_at.unwrap_or_else(|| now.clone()))),
        updated_at: Set(updated_at.or(Some(now.clone()))),
        deleted_at: Set(deleted_at),
        ..Default::default()
    }
    .insert(state.db.as_ref())
    .await?;

    if normalized_customer_id.is_none() {
        let backend = state.db.as_ref().get_database_backend();
        let prefix: Option<String> = {
            #[derive(FromQueryResult)]
            struct PrefixRow {
                customer_id_prefix: Option<String>,
            }
            PrefixRow::find_by_statement(Statement::from_sql_and_values(
                backend,
                "SELECT customer_id_prefix FROM shop_settings ORDER BY id DESC LIMIT 1",
                [],
            ))
            .one(state.db.as_ref())
            .await
            .unwrap_or(None)
            .and_then(|r| r.customer_id_prefix)
        };

        let prefix_str = prefix.unwrap_or_else(|| DEFAULT_CUSTOMER_ID_PREFIX.to_string());

        // Get count for sequence number
        let count = crate::entities::customers::Entity::find()
            .count(state.db.as_ref())
            .await
            .unwrap_or(1);
        let new_customer_id = format!("{}{:05}", prefix_str, count);

        let _ = state
            .db
            .execute(Statement::from_sql_and_values(
                backend,
                "UPDATE customers SET customer_id = $1 WHERE id = $2",
                [new_customer_id.into(), new_id.clone().into()],
            ))
            .await;
    }

    if let Ok(Some(record)) = Customer::find_by_statement(Statement::from_sql_and_values(
        state.db.as_ref().get_database_backend(),
        "SELECT id, customer_id, name, phone, address, city, social_media_url, platform, created_at, updated_at, deleted_at FROM customers WHERE id = $1",
        [new_id.clone().into()],
    ))
    .one(state.db.as_ref())
    .await
    {
        enqueue_sync(
            state.db.as_ref(),
            app,
            "customers",
            "INSERT",
            &new_id,
            serde_json::json!(record),
        )
        .await;
    }

    Ok(new_id)
}

/// Loads all customers in reverse creation order.
#[instrument(skip(state))]
pub async fn get_customers(state: Arc<AppState>) -> AppResult<Vec<Customer>> {
    let backend = state.db.as_ref().get_database_backend();
    let customers = Customer::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT id, customer_id, name, phone, address, city, social_media_url, platform, created_at, updated_at, deleted_at FROM customers ORDER BY created_at DESC",
        [],
    ))
    .all(state.db.as_ref())
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
    let backend = state.db.as_ref().get_database_backend();

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

    let where_clause = if has_search {
        format!("WHERE COALESCE({}, '') LIKE $1", search_column)
    } else {
        String::new()
    };

    let count_sql = format!("SELECT COUNT(*) as count FROM customers {}", where_clause);
    let data_sql = if no_limit {
        format!(
            "SELECT id, customer_id, name, phone, address, city, social_media_url, platform, created_at, updated_at, deleted_at FROM customers {} ORDER BY {} {}",
            where_clause, sort_column, sort_direction
        )
    } else {
        format!(
            "SELECT id, customer_id, name, phone, address, city, social_media_url, platform, created_at, updated_at, deleted_at FROM customers {} ORDER BY {} {} LIMIT $2 OFFSET $3",
            where_clause, sort_column, sort_direction
        )
    };

    #[derive(FromQueryResult)]
    struct CountRow {
        count: i64,
    }

    let (total, customers) = if has_search {
        let total_row = CountRow::find_by_statement(Statement::from_sql_and_values(
            backend,
            &count_sql,
            [search_pattern.clone().into()],
        ))
        .one(state.db.as_ref())
        .await?
        .map(|r| r.count)
        .unwrap_or(0);

        let customers = if no_limit {
            Customer::find_by_statement(Statement::from_sql_and_values(
                backend,
                &data_sql,
                [search_pattern.into()],
            ))
            .all(state.db.as_ref())
            .await?
        } else {
            Customer::find_by_statement(Statement::from_sql_and_values(
                backend,
                &data_sql,
                [search_pattern.into(), page_size.into(), offset.into()],
            ))
            .all(state.db.as_ref())
            .await?
        };

        (total_row, customers)
    } else {
        let total_row = CountRow::find_by_statement(Statement::from_sql_and_values(
            backend,
            &count_sql,
            [],
        ))
        .one(state.db.as_ref())
        .await?
        .map(|r| r.count)
        .unwrap_or(0);

        let customers = if no_limit {
            Customer::find_by_statement(Statement::from_sql_and_values(
                backend,
                &data_sql,
                [],
            ))
            .all(state.db.as_ref())
            .await?
        } else {
            Customer::find_by_statement(Statement::from_sql_and_values(
                backend,
                &data_sql,
                [page_size.into(), offset.into()],
            ))
            .all(state.db.as_ref())
            .await?
        };

        (total_row, customers)
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
    let backend = state.db.as_ref().get_database_backend();
    let customer = Customer::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT id, customer_id, name, phone, address, city, social_media_url, platform, created_at, updated_at, deleted_at FROM customers WHERE id = $1",
        [id.into()],
    ))
    .one(state.db.as_ref())
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
    _uuid: Option<String>,
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
    let backend = state.db.as_ref().get_database_backend();
    let normalized_customer_id = customer_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let now = chrono::Utc::now().to_rfc3339();

    state
        .db
        .execute(Statement::from_sql_and_values(
            backend,
            "UPDATE customers SET customer_id = $1, name = $2, phone = $3, address = $4, city = $5, social_media_url = $6, platform = $7, created_at = COALESCE($8, created_at), updated_at = COALESCE($9, $10), deleted_at = $11 WHERE id = $12",
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
                now.into(),
                deleted_at.into(),
                id.clone().into(),
            ],
        ))
        .await?;

    if let Ok(Some(record)) = Customer::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT id, customer_id, name, phone, address, city, social_media_url, platform, created_at, updated_at, deleted_at FROM customers WHERE id = $1",
        [id.clone().into()],
    ))
    .one(state.db.as_ref())
    .await
    {
        enqueue_sync(
            state.db.as_ref(),
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
pub async fn delete_customer(
    state: Arc<AppState>,
    app: &AppHandle,
    id: String,
) -> AppResult<()> {
    let backend = state.db.as_ref().get_database_backend();
    let now = chrono::Utc::now().to_rfc3339();

    state
        .db
        .execute(Statement::from_sql_and_values(
            backend,
            "UPDATE customers SET deleted_at = $1, updated_at = $2 WHERE id = $3",
            [now.clone().into(), now.into(), id.clone().into()],
        ))
        .await?;

    if let Ok(Some(record)) = Customer::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT id, customer_id, name, phone, address, city, social_media_url, platform, created_at, updated_at, deleted_at FROM customers WHERE id = $1",
        [id.clone().into()],
    ))
    .one(state.db.as_ref())
    .await
    {
        enqueue_sync(
            state.db.as_ref(),
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
