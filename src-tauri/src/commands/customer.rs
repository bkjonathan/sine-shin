use tauri::{AppHandle, Manager};

use crate::db::DEFAULT_CUSTOMER_ID_PREFIX;
use crate::models::{Customer, PaginatedCustomers};
use crate::state::AppDb;

const DEFAULT_CUSTOMERS_PAGE_SIZE: i64 = 5;
const MIN_CUSTOMERS_PAGE_SIZE: i64 = 5;
const MAX_CUSTOMERS_PAGE_SIZE: i64 = 100;

#[tauri::command]
pub async fn create_customer(
    app: AppHandle,
    name: String,
    phone: Option<String>,
    address: Option<String>,
    city: Option<String>,
    social_media_url: Option<String>,
    platform: Option<String>,
    id: Option<i64>,
    customer_id: Option<String>,
) -> Result<i64, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let inserted_id = if let Some(provided_id) = id {
        sqlx::query(
            "INSERT INTO customers (id, name, phone, address, city, social_media_url, platform) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(provided_id)
        .bind(&name)
        .bind(&phone)
        .bind(&address)
        .bind(&city)
        .bind(&social_media_url)
        .bind(&platform)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .last_insert_rowid()
    } else {
        sqlx::query(
            "INSERT INTO customers (name, phone, address, city, social_media_url, platform) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(&name)
        .bind(&phone)
        .bind(&address)
        .bind(&city)
        .bind(&social_media_url)
        .bind(&platform)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .last_insert_rowid()
    };

    // If a customer_id was provided efficiently, we can use it.
    // If not, we generate it.

    if let Some(cid) = customer_id {
        // Optimization: If we could insert customer_id in the first INSERT, that would be better,
        // but since `id` auto-generation case doesn't have it, we might need a separate UPDATE
        // or a smarter INSERT query.
        // For simplicity/safety with existing schema, let's just UPDATE it if it was null/different or verify it.
        // Actually, let's just update it to ensure it's set correctly.
        let _ = sqlx::query("UPDATE customers SET customer_id = ? WHERE id = ?")
            .bind(cid)
            .bind(inserted_id)
            .execute(&*pool)
            .await;
    } else {
        // Generate new one
        let prefix: Option<String> =
            sqlx::query_scalar("SELECT customer_id_prefix FROM shop_settings ORDER BY id DESC LIMIT 1")
                .fetch_optional(&*pool)
                .await
                .unwrap_or(Some(DEFAULT_CUSTOMER_ID_PREFIX.to_string()));

        let prefix_str = prefix.unwrap_or_else(|| DEFAULT_CUSTOMER_ID_PREFIX.to_string());
        let new_customer_id = format!("{}{:05}", prefix_str, inserted_id);

        let _ = sqlx::query("UPDATE customers SET customer_id = ? WHERE id = ?")
            .bind(new_customer_id)
            .bind(inserted_id)
            .execute(&*pool)
            .await;
    }

    Ok(inserted_id)
}

#[tauri::command]
pub async fn get_customers(app: AppHandle) -> Result<Vec<Customer>, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let customers =
        sqlx::query_as::<_, Customer>("SELECT * FROM customers ORDER BY created_at DESC")
            .fetch_all(&*pool)
            .await
            .map_err(|e| e.to_string())?;

    Ok(customers)
}

#[tauri::command]
pub async fn get_customers_paginated(
    app: AppHandle,
    page: Option<i64>,
    page_size: Option<i64>,
    search_key: Option<String>,
    search_term: Option<String>,
) -> Result<PaginatedCustomers, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let requested_page_size = page_size.unwrap_or(DEFAULT_CUSTOMERS_PAGE_SIZE);
    let no_limit = requested_page_size <= 0;
    let page_size = if no_limit {
        DEFAULT_CUSTOMERS_PAGE_SIZE
    } else {
        requested_page_size.clamp(MIN_CUSTOMERS_PAGE_SIZE, MAX_CUSTOMERS_PAGE_SIZE)
    };
    let page = if no_limit { 1 } else { page.unwrap_or(1).max(1) };
    let offset = if no_limit { 0 } else { (page - 1) * page_size };

    let raw_search = search_term.unwrap_or_default().trim().to_string();
    let has_search = !raw_search.is_empty();
    let search_pattern = format!("%{}%", raw_search);

    let search_column = match search_key.as_deref().unwrap_or("name") {
        "name" => "name",
        "customerId" => "customer_id",
        "phone" => "phone",
        _ => return Err("Invalid search key".to_string()),
    };

    let (total, customers) = if has_search {
        let count_query = format!(
            "SELECT COUNT(*) FROM customers WHERE COALESCE({}, '') LIKE ?",
            search_column
        );
        let total: i64 = sqlx::query_scalar(&count_query)
            .bind(&search_pattern)
            .fetch_one(&*pool)
            .await
            .map_err(|e| e.to_string())?;

        let customers = if no_limit {
            let data_query = format!(
                "SELECT * FROM customers WHERE COALESCE({}, '') LIKE ? ORDER BY created_at DESC",
                search_column
            );
            sqlx::query_as::<_, Customer>(&data_query)
                .bind(&search_pattern)
                .fetch_all(&*pool)
                .await
                .map_err(|e| e.to_string())?
        } else {
            let data_query = format!(
                "SELECT * FROM customers WHERE COALESCE({}, '') LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
                search_column
            );
            sqlx::query_as::<_, Customer>(&data_query)
                .bind(&search_pattern)
                .bind(page_size)
                .bind(offset)
                .fetch_all(&*pool)
                .await
                .map_err(|e| e.to_string())?
        };

        (total, customers)
    } else {
        let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM customers")
            .fetch_one(&*pool)
            .await
            .map_err(|e| e.to_string())?;

        let customers = if no_limit {
            sqlx::query_as::<_, Customer>("SELECT * FROM customers ORDER BY created_at DESC")
                .fetch_all(&*pool)
                .await
                .map_err(|e| e.to_string())?
        } else {
            sqlx::query_as::<_, Customer>(
                "SELECT * FROM customers ORDER BY created_at DESC LIMIT ? OFFSET ?",
            )
            .bind(page_size)
            .bind(offset)
            .fetch_all(&*pool)
            .await
            .map_err(|e| e.to_string())?
        };

        (total, customers)
    };

    let response_page_size = if no_limit {
        total.max(0)
    } else {
        page_size
    };

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

#[tauri::command]
pub async fn get_customer(app: AppHandle, id: i64) -> Result<Customer, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let customer = sqlx::query_as::<_, Customer>("SELECT * FROM customers WHERE id = ?")
        .bind(id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Customer not found".to_string())?;

    Ok(customer)
}

#[tauri::command]
pub async fn update_customer(
    app: AppHandle,
    id: i64,
    name: String,
    phone: Option<String>,
    address: Option<String>,
    city: Option<String>,
    social_media_url: Option<String>,
    platform: Option<String>,
) -> Result<(), String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    sqlx::query(
        "UPDATE customers SET name = ?, phone = ?, address = ?, city = ?, social_media_url = ?, platform = ? WHERE id = ?",
    )
    .bind(name)
    .bind(phone)
    .bind(address)
    .bind(city)
    .bind(social_media_url)
    .bind(platform)
    .bind(id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_customer(app: AppHandle, id: i64) -> Result<(), String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    sqlx::query("DELETE FROM customers WHERE id = ?")
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
