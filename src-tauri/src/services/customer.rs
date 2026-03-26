use std::sync::Arc;

use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter, QueryOrder, Select,
    QuerySelect, Set,
};
use tauri::AppHandle;
use tracing::instrument;
use uuid::Uuid;

use crate::db::{current_timestamp_utc, parse_optional_datetime, DEFAULT_CUSTOMER_ID_PREFIX};
use crate::entities::{customers, shop_settings};
use crate::error::{AppError, AppResult};
use crate::models::{Customer, PaginatedCustomers};
use crate::state::AppState;
use crate::sync::enqueue_sync_if_available;

const DEFAULT_CUSTOMERS_PAGE_SIZE: i64 = 5;
const MIN_CUSTOMERS_PAGE_SIZE: i64 = 5;
const MAX_CUSTOMERS_PAGE_SIZE: i64 = 100;

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value.map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

fn normalize_name(name: String) -> AppResult<String> {
    let normalized = name.trim().to_string();
    if normalized.is_empty() {
        return Err(AppError::invalid_input("Customer name is required"));
    }
    Ok(normalized)
}

fn to_customer(record: customers::Model) -> Customer {
    Customer {
        id: record.id,
        customer_id: record.customer_id,
        name: record.name,
        phone: record.phone,
        address: record.address,
        city: record.city,
        social_media_url: record.social_media_url,
        platform: record.platform,
        created_at: record.created_at,
        updated_at: record.updated_at,
        deleted_at: record.deleted_at,
    }
}

fn apply_customer_filters(
    query: Select<customers::Entity>,
    search_key: Option<&str>,
    raw_search: &str,
) -> AppResult<Select<customers::Entity>> {
    let mut query = query.filter(customers::Column::DeletedAt.is_null());

    if raw_search.is_empty() {
        return Ok(query);
    }

    query = match search_key.unwrap_or("name") {
        "name" => query.filter(customers::Column::Name.contains(raw_search)),
        "customerId" => query.filter(customers::Column::CustomerId.contains(raw_search)),
        "phone" => query.filter(customers::Column::Phone.contains(raw_search)),
        _ => return Err(AppError::invalid_input("Invalid search key")),
    };

    Ok(query)
}

fn apply_customer_sort(
    query: Select<customers::Entity>,
    sort_by: Option<&str>,
    sort_order: Option<&str>,
) -> Select<customers::Entity> {
    let ascending = sort_order == Some("asc");

    match sort_by.unwrap_or("customer_id") {
        "name" => {
            if ascending {
                query.order_by_asc(customers::Column::Name)
            } else {
                query.order_by_desc(customers::Column::Name)
            }
        }
        "created_at" => {
            if ascending {
                query.order_by_asc(customers::Column::CreatedAt)
            } else {
                query.order_by_desc(customers::Column::CreatedAt)
            }
        }
        "customer_id" => {
            if ascending {
                query.order_by_asc(customers::Column::CustomerId)
            } else {
                query.order_by_desc(customers::Column::CustomerId)
            }
        }
        _ => {
            if ascending {
                query.order_by_asc(customers::Column::CustomerId)
            } else {
                query.order_by_desc(customers::Column::CustomerId)
            }
        }
    }
}

async fn resolve_customer_id_prefix(db: &sea_orm::DatabaseConnection) -> AppResult<String> {
    let prefix = shop_settings::Entity::find()
        .filter(shop_settings::Column::CustomerIdPrefix.is_not_null())
        .order_by_desc(shop_settings::Column::CreatedAt)
        .one(db)
        .await?
        .and_then(|settings| settings.customer_id_prefix)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_CUSTOMER_ID_PREFIX.to_string());

    Ok(prefix)
}

async fn generate_customer_id(db: &sea_orm::DatabaseConnection) -> AppResult<String> {
    let prefix = resolve_customer_id_prefix(db).await?;
    let next_seq = customers::Entity::find()
        .filter(customers::Column::CustomerId.starts_with(&prefix))
        .all(db)
        .await?
        .into_iter()
        .filter_map(|record| {
            record.customer_id.and_then(|customer_id| {
                customer_id
                    .strip_prefix(&prefix)
                    .and_then(|suffix| suffix.parse::<i64>().ok())
            })
        })
        .max()
        .unwrap_or(0)
        + 1;

    Ok(format!("{prefix}{next_seq:05}"))
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
    let normalized_name = normalize_name(name)?;
    let normalized_customer_id = normalize_optional_text(customer_id);
    let parsed_created_at = parse_optional_datetime(created_at)?;
    let parsed_updated_at = parse_optional_datetime(updated_at)?;
    let parsed_deleted_at = parse_optional_datetime(deleted_at)?;

    let inserted = customers::ActiveModel {
        id: Set(record_id.clone()),
        customer_id: Set(normalized_customer_id),
        name: Set(normalized_name),
        phone: Set(normalize_optional_text(phone)),
        address: Set(normalize_optional_text(address)),
        city: Set(normalize_optional_text(city)),
        social_media_url: Set(normalize_optional_text(social_media_url)),
        platform: Set(normalize_optional_text(platform)),
        created_at: parsed_created_at
            .map(|value| Set(Some(value)))
            .unwrap_or(sea_orm::ActiveValue::NotSet),
        updated_at: Set(parsed_updated_at),
        deleted_at: Set(parsed_deleted_at),
        synced: Set(Some(0)),
    }
    .insert(&db)
    .await?;

    let record = if inserted.customer_id.is_some() {
        inserted
    } else {
        let generated_customer_id = generate_customer_id(&db).await?;
        let mut active_model: customers::ActiveModel = inserted.into();
        active_model.customer_id = Set(Some(generated_customer_id));
        active_model.update(&db).await?
    };

    enqueue_sync_if_available(
        &state,
        app,
        "customers",
        "INSERT",
        &record_id,
        serde_json::json!(to_customer(record)),
    )
    .await;

    Ok(record_id)
}

/// Loads all customers in reverse creation order.
#[instrument(skip(state))]
pub async fn get_customers(state: Arc<AppState>) -> AppResult<Vec<Customer>> {
    let db = state.db.lock().await.clone();
    let customers = customers::Entity::find()
        .filter(customers::Column::DeletedAt.is_null())
        .order_by_desc(customers::Column::CreatedAt)
        .all(&db)
        .await?
        .into_iter()
        .map(to_customer)
        .collect();
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
    let filtered_query =
        apply_customer_filters(customers::Entity::find(), search_key.as_deref(), &raw_search)?;
    let total = filtered_query.clone().count(&db).await? as i64;
    let sorted_query =
        apply_customer_sort(filtered_query, sort_by.as_deref(), sort_order.as_deref());

    let rows = if no_limit {
        sorted_query.all(&db).await?
    } else {
        sorted_query
            .offset(offset as u64)
            .limit(page_size as u64)
            .all(&db)
            .await?
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
        customers: rows.into_iter().map(to_customer).collect(),
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
        .one(&db)
        .await?
        .map(to_customer)
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
    let now = current_timestamp_utc();
    let normalized_name = normalize_name(name)?;
    let normalized_customer_id = normalize_optional_text(customer_id);
    let parsed_created_at = parse_optional_datetime(created_at)?;
    let parsed_updated_at = parse_optional_datetime(updated_at)?;
    let parsed_deleted_at = parse_optional_datetime(deleted_at)?;

    let existing = customers::Entity::find_by_id(id.clone())
        .one(&db)
        .await?
        .ok_or_else(|| AppError::not_found("Customer not found"))?;
    let next_customer_id = match normalized_customer_id {
        Some(value) => Some(value),
        None => match existing.customer_id.clone() {
            Some(value) => Some(value),
            None => Some(generate_customer_id(&db).await?),
        },
    };

    let mut active_model: customers::ActiveModel = existing.into();
    active_model.customer_id = Set(next_customer_id);
    active_model.name = Set(normalized_name);
    active_model.phone = Set(normalize_optional_text(phone));
    active_model.address = Set(normalize_optional_text(address));
    active_model.city = Set(normalize_optional_text(city));
    active_model.social_media_url = Set(normalize_optional_text(social_media_url));
    active_model.platform = Set(normalize_optional_text(platform));
    if let Some(value) = parsed_created_at {
        active_model.created_at = Set(Some(value));
    }
    active_model.updated_at = Set(parsed_updated_at.or(Some(now)));
    active_model.deleted_at = Set(parsed_deleted_at);

    let record = active_model.update(&db).await?;

    enqueue_sync_if_available(
        &state,
        app,
        "customers",
        "UPDATE",
        &id,
        serde_json::json!(to_customer(record)),
    )
    .await;

    Ok(())
}

/// Soft-deletes a customer and enqueues sync payload.
#[instrument(skip(state, app))]
pub async fn delete_customer(state: Arc<AppState>, app: &AppHandle, id: String) -> AppResult<()> {
    let db = state.db.lock().await.clone();
    let now = current_timestamp_utc();

    let existing = customers::Entity::find_by_id(id.clone())
        .one(&db)
        .await?
        .ok_or_else(|| AppError::not_found("Customer not found"))?;

    let mut active_model: customers::ActiveModel = existing.into();
    active_model.deleted_at = Set(Some(now.clone()));
    active_model.updated_at = Set(Some(now));
    let record = active_model.update(&db).await?;

    enqueue_sync_if_available(
        &state,
        app,
        "customers",
        "DELETE",
        &id,
        serde_json::json!(to_customer(record)),
    )
    .await;

    Ok(())
}
