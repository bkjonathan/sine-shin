use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use serde::{Deserialize, Serialize};
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::{Pool, Sqlite};
use tauri_plugin_sql::{Migration, MigrationKind};
use tokio::sync::Mutex;

// Shared database pool state
pub struct AppDb(pub Arc<Mutex<Pool<Sqlite>>>);

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
struct ShopSettings {
    id: i64,
    shop_name: String,
    phone: Option<String>,
    address: Option<String>,
    logo_path: Option<String>,
    customer_id_prefix: Option<String>,
    order_id_prefix: Option<String>,
    created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
struct User {
    id: i64,
    name: String,
    password_hash: String,
    role: String,
    created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
struct Customer {
    id: i64,
    customer_id: Option<String>,
    name: String,
    phone: Option<String>,
    address: Option<String>,
    city: Option<String>,
    social_media_url: Option<String>,
    platform: Option<String>,
    created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
struct Order {
    id: i64,
    order_id: Option<String>,
    customer_id: Option<i64>,
    order_from: Option<String>,
    product_qty: Option<i64>,
    price: Option<f64>,
    exchange_rate: Option<f64>,
    shipping_fee: Option<f64>,
    delivery_fee: Option<f64>,
    cargo_fee: Option<f64>,
    product_weight: Option<f64>,
    order_date: Option<String>,
    arrived_date: Option<String>,
    shipment_date: Option<String>,
    user_withdraw_date: Option<String>,
    created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
struct OrderWithCustomer {
    id: i64,
    order_id: Option<String>,
    customer_id: Option<i64>,
    customer_name: Option<String>,
    order_from: Option<String>,
    product_qty: Option<i64>,
    price: Option<f64>,
    exchange_rate: Option<f64>,
    shipping_fee: Option<f64>,
    delivery_fee: Option<f64>,
    cargo_fee: Option<f64>,
    product_weight: Option<f64>,
    order_date: Option<String>,
    arrived_date: Option<String>,
    shipment_date: Option<String>,
    user_withdraw_date: Option<String>,
    created_at: Option<String>,
}

#[tauri::command]
async fn register_user(app: AppHandle, name: String, password: String) -> Result<(), String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    // Hash password
    let password_hash = bcrypt::hash(password, bcrypt::DEFAULT_COST).map_err(|e| e.to_string())?;

    sqlx::query("INSERT INTO users (name, password_hash) VALUES (?, ?)")
        .bind(name)
        .bind(password_hash)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn login_user(app: AppHandle, name: String, password: String) -> Result<User, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let user: Option<User> = sqlx::query_as("SELECT * FROM users WHERE name = ?")
        .bind(&name)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(user) = user {
        let valid = bcrypt::verify(password, &user.password_hash).map_err(|e| e.to_string())?;
        if valid {
            Ok(user)
        } else {
            Err("Invalid password".to_string())
        }
    } else {
        Err("User not found".to_string())
    }
}

#[tauri::command]
async fn check_is_onboarded(app: AppHandle) -> Result<bool, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let shop_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM shop_settings")
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let user_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(shop_count.0 > 0 && user_count.0 > 0)
}

#[tauri::command]
async fn save_shop_setup(
    app: AppHandle,
    name: String,
    phone: String,
    address: String,
    logo_file_path: String,
) -> Result<(), String> {
    // Determine where to store the logo
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    let logos_dir = app_data_dir.join("logos");
    fs::create_dir_all(&logos_dir).map_err(|e| format!("Failed to create logos dir: {}", e))?;

    // Copy logo file if a path was provided
    let internal_logo_path = if !logo_file_path.is_empty() {
        let source = PathBuf::from(&logo_file_path);
        if !source.exists() {
            return Err(format!("Logo file not found: {}", logo_file_path));
        }

        let file_name = source
            .file_name()
            .ok_or("Invalid file name")?
            .to_string_lossy()
            .to_string();

        // Add a timestamp prefix to avoid collisions
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_millis();
        let dest_name = format!("{}_{}", timestamp, file_name);
        let dest = logos_dir.join(&dest_name);

        fs::copy(&source, &dest).map_err(|e| format!("Failed to copy logo: {}", e))?;

        Some(dest.to_string_lossy().to_string())
    } else {
        None
    };

    // Insert into the database
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    sqlx::query(
        "INSERT INTO shop_settings (shop_name, phone, address, logo_path) VALUES (?, ?, ?, ?)",
    )
    .bind(&name)
    .bind(&phone)
    .bind(&address)
    .bind(&internal_logo_path)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn get_shop_settings(app: AppHandle) -> Result<ShopSettings, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let settings: ShopSettings = sqlx::query_as("SELECT * FROM shop_settings ORDER BY id DESC LIMIT 1")
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(settings)
}

#[tauri::command]
async fn update_shop_settings(
    app: AppHandle,
    shop_name: String,
    phone: String,
    address: String,
    logo_path: Option<String>,
    customer_id_prefix: Option<String>,
    order_id_prefix: Option<String>,
) -> Result<(), String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    // We update the most recent record
    let latest_id: Option<i64> = sqlx::query_scalar("SELECT id FROM shop_settings ORDER BY id DESC LIMIT 1")
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(id) = latest_id {
        // Handle Logo Logic
        let new_internal_logo_path = if let Some(path) = logo_path {
            if !path.is_empty() {
                // Copy logic same as save_shop_setup (could be refactored into helper)
                let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
                let logos_dir = app_data_dir.join("logos");
                fs::create_dir_all(&logos_dir).map_err(|e| format!("Failed to create logos dir: {}", e))?;

                let source = PathBuf::from(&path);
                if !source.exists() {
                     // If file doesn't exist, maybe ignore or error? 
                     // Let's warn and skip updating logo if invalid path provided
                     // Or return error.
                     return Err(format!("Logo file not found: {}", path));
                }

                let file_name = source
                    .file_name()
                    .ok_or("Invalid file name")?
                    .to_string_lossy()
                    .to_string();

                let timestamp = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_err(|e| e.to_string())?
                    .as_millis();
                let dest_name = format!("{}_{}", timestamp, file_name);
                let dest = logos_dir.join(&dest_name);

                fs::copy(&source, &dest).map_err(|e| format!("Failed to copy logo: {}", e))?;
                Some(dest.to_string_lossy().to_string())
            } else {
                None
            }
        } else {
            None
        };

        if let Some(internal_path) = new_internal_logo_path {
             sqlx::query("UPDATE shop_settings SET shop_name = ?, phone = ?, address = ?, logo_path = ?, customer_id_prefix = ?, order_id_prefix = ? WHERE id = ?")
                .bind(shop_name)
                .bind(phone)
                .bind(address)
                .bind(internal_path)
                .bind(customer_id_prefix)
                .bind(order_id_prefix)
                .bind(id)
                .execute(&*pool)
                .await
                .map_err(|e| e.to_string())?;
        } else {
             // Keep existing logo
             sqlx::query("UPDATE shop_settings SET shop_name = ?, phone = ?, address = ?, customer_id_prefix = ?, order_id_prefix = ? WHERE id = ?")
                .bind(shop_name)
                .bind(phone)
                .bind(address)
                .bind(customer_id_prefix)
                .bind(order_id_prefix)
                .bind(id)
                .execute(&*pool)
                .await
                .map_err(|e| e.to_string())?;
        }

    } else {
        return Err("No shop settings found to update".to_string());
    }

    Ok(())
}

// ... (previous code)

#[tauri::command]
async fn reset_app_data(app: AppHandle) -> Result<(), String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    // 1. Drop all tables
    sqlx::query("DROP TABLE IF EXISTS shop_settings")
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DROP TABLE IF EXISTS users")
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DROP TABLE IF EXISTS customers")
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DROP TABLE IF EXISTS orders")
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    // Also clear migration history so it re-runs cleanly
    sqlx::query("DROP TABLE IF EXISTS _sqlx_migrations")
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    // 2. Delete logos directory
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let logos_dir = app_data_dir.join("logos");
        if logos_dir.exists() {
             let _ = fs::remove_dir_all(&logos_dir); 
        }
    }

    // 3. Re-run migrations
    // Since we cleared migration history, we can just run the init sql manually 
    // or let the migration framework handle it on restart.
    // Ideally we re-run the init script to make the app usable immediately without restart.
    sqlx::query(include_str!("../migrations/001_init.sql"))
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    // Re-insert migration record to keep state consistent?
    // Or just rely on the fact that running the SQL created the tables.
    // If we want the migration system to know about it, we'd need to insert into _sqlx_migrations.
    // But simplified approach for "Reset": just run the schema creation.
    // When app restarts, migration logic will see tables exist and might try to run migration again if not recorded.
    // So let's record it manually to be safe, matching tauri-plugin-sql logic if possible.
    // Actually, tauri-plugin-sql creates the _sqlx_migrations table.
    // By dropping it, we force a re-check on next startup. 
    // If we run `001_init.sql` now, tables exist. Next startup, plugin sees migration 1 not applied (because table dropped), tries to run it.
    // `001_init.sql` uses `CREATE TABLE IF NOT EXISTS`, so it should be safe to run again on startup.
    // So current approach is fine.

    Ok(())
}


#[tauri::command]
async fn create_customer(
    app: AppHandle,
    name: String,
    phone: Option<String>,
    address: Option<String>,
    city: Option<String>,
    social_media_url: Option<String>,
    platform: Option<String>,
) -> Result<i64, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let id = sqlx::query(
        "INSERT INTO customers (name, phone, address, city, social_media_url, platform) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(name)
    .bind(phone)
    .bind(address)
    .bind(city)
    .bind(social_media_url)
    .bind(platform)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .last_insert_rowid();

    // Auto-generate customer_id
    // 1. Get prefix
    let prefix: Option<String> = sqlx::query_scalar("SELECT customer_id_prefix FROM shop_settings ORDER BY id DESC LIMIT 1")
        .fetch_optional(&*pool)
        .await
        .unwrap_or(Some("SSC-".to_string())); // Default fallback if DB check fails, though migration should ensure it exists
    
    let prefix_str = prefix.unwrap_or_else(|| "SSC-".to_string());
    let customer_id = format!("{}{:05}", prefix_str, id);

    // 2. Update customer with generated ID
    let _ = sqlx::query("UPDATE customers SET customer_id = ? WHERE id = ?")
        .bind(customer_id)
        .bind(id)
        .execute(&*pool)
        .await;

    Ok(id)
}

#[tauri::command]
async fn get_customers(app: AppHandle) -> Result<Vec<Customer>, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let customers = sqlx::query_as::<_, Customer>("SELECT * FROM customers ORDER BY created_at DESC")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(customers)
}

#[tauri::command]
async fn update_customer(
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
async fn delete_customer(app: AppHandle, id: i64) -> Result<(), String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    sqlx::query("DELETE FROM customers WHERE id = ?")
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn create_order(
    app: AppHandle,
    customer_id: i64,
    order_from: Option<String>,
    product_qty: Option<i64>,
    price: Option<f64>,
    exchange_rate: Option<f64>,
    shipping_fee: Option<f64>,
    delivery_fee: Option<f64>,
    cargo_fee: Option<f64>,
    product_weight: Option<f64>,
    order_date: Option<String>,
    arrived_date: Option<String>,
    shipment_date: Option<String>,
    user_withdraw_date: Option<String>,
) -> Result<i64, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let id = sqlx::query(
        "INSERT INTO orders (customer_id, order_from, product_qty, price, exchange_rate, shipping_fee, delivery_fee, cargo_fee, product_weight, order_date, arrived_date, shipment_date, user_withdraw_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(customer_id)
    .bind(order_from)
    .bind(product_qty)
    .bind(price)
    .bind(exchange_rate)
    .bind(shipping_fee)
    .bind(delivery_fee)
    .bind(cargo_fee)
    .bind(product_weight)
    .bind(order_date)
    .bind(arrived_date)
    .bind(shipment_date)
    .bind(user_withdraw_date)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?
    .last_insert_rowid();

    // Auto-generate order_id
    let prefix: Option<String> = sqlx::query_scalar("SELECT order_id_prefix FROM shop_settings ORDER BY id DESC LIMIT 1")
        .fetch_optional(&*pool)
        .await
        .unwrap_or(Some("SSO0-".to_string()));
    
    let prefix_str = prefix.unwrap_or_else(|| "SSO0-".to_string());
    let order_id = format!("{}{:05}", prefix_str, id);

    let _ = sqlx::query("UPDATE orders SET order_id = ? WHERE id = ?")
        .bind(order_id)
        .bind(id)
        .execute(&*pool)
        .await;

    Ok(id)
}

#[tauri::command]
async fn get_orders(app: AppHandle) -> Result<Vec<OrderWithCustomer>, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let orders = sqlx::query_as::<_, OrderWithCustomer>(
        "SELECT o.*, c.name as customer_name FROM orders o LEFT JOIN customers c ON o.customer_id = c.id ORDER BY o.created_at DESC"
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(orders)
}

#[tauri::command]
async fn update_order(
    app: AppHandle,
    id: i64,
    customer_id: i64,
    order_from: Option<String>,
    product_qty: Option<i64>,
    price: Option<f64>,
    exchange_rate: Option<f64>,
    shipping_fee: Option<f64>,
    delivery_fee: Option<f64>,
    cargo_fee: Option<f64>,
    product_weight: Option<f64>,
    order_date: Option<String>,
    arrived_date: Option<String>,
    shipment_date: Option<String>,
    user_withdraw_date: Option<String>,
) -> Result<(), String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    sqlx::query(
        "UPDATE orders SET customer_id = ?, order_from = ?, product_qty = ?, price = ?, exchange_rate = ?, shipping_fee = ?, delivery_fee = ?, cargo_fee = ?, product_weight = ?, order_date = ?, arrived_date = ?, shipment_date = ?, user_withdraw_date = ? WHERE id = ?",
    )
    .bind(customer_id)
    .bind(order_from)
    .bind(product_qty)
    .bind(price)
    .bind(exchange_rate)
    .bind(shipping_fee)
    .bind(delivery_fee)
    .bind(cargo_fee)
    .bind(product_weight)
    .bind(order_date)
    .bind(arrived_date)
    .bind(shipment_date)
    .bind(user_withdraw_date)
    .bind(id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn delete_order(app: AppHandle, id: i64) -> Result<(), String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    sqlx::query("DELETE FROM orders WHERE id = ?")
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
struct TableStatus {
    name: String,
    row_count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
struct DbStatus {
    total_tables: i64,
    tables: Vec<TableStatus>,
    size_bytes: Option<u64>,
}

#[tauri::command]
async fn get_db_status(app: AppHandle) -> Result<DbStatus, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    // Get all tables (excluding internal sqlite tables)
    let tables: Vec<(String,)> = sqlx::query_as("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut table_statuses = Vec::new();

    for (name,) in &tables {
        let query = format!("SELECT COUNT(*) FROM {}", name);
        let count: (i64,) = sqlx::query_as(&query)
            .fetch_one(&*pool)
            .await
            .map_err(|e| e.to_string())?;

        table_statuses.push(TableStatus {
            name: name.clone(),
            row_count: count.0,
        });
    }
    
    // Get DB file size
    let size_bytes = if let Ok(app_data_dir) = app.path().app_data_dir() {
        let db_path = app_data_dir.join("shop.db");
        if let Ok(metadata) = fs::metadata(db_path) {
            Some(metadata.len())
        } else {
            None
        }
    } else {
        None
    };

    Ok(DbStatus {
        total_tables: tables.len() as i64,
        tables: table_statuses,
        size_bytes,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "init database",
            sql: include_str!("../migrations/001_init.sql"),
            kind: MigrationKind::Up,
        }
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:shop.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Create our own connection pool for backend commands
            let app_data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");
            let db_path = app_data_dir.join("shop.db");
            let db_url = format!("sqlite:{}?mode=rwc", db_path.to_string_lossy());

            let pool = tauri::async_runtime::block_on(async {
                SqlitePoolOptions::new()
                    .max_connections(5)
                    .connect(&db_url)
                    .await
                    .expect("Failed to create database pool")
            });



            app.manage(AppDb(Arc::new(Mutex::new(pool))));

            #[cfg(target_os = "windows")]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_decorations(false);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            check_is_onboarded, 
            save_shop_setup, 
            get_shop_settings, 
            update_shop_settings,
            reset_app_data,
            register_user,
            login_user,
            get_db_status,
            create_customer,
            get_customers,
            update_customer,
            delete_customer,
            create_order,
            get_orders,
            update_order,
            delete_order
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

