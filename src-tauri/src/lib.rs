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
             sqlx::query("UPDATE shop_settings SET shop_name = ?, phone = ?, address = ?, logo_path = ? WHERE id = ?")
                .bind(shop_name)
                .bind(phone)
                .bind(address)
                .bind(internal_path)
                .bind(id)
                .execute(&*pool)
                .await
                .map_err(|e| e.to_string())?;
        } else {
             // Keep existing logo
             sqlx::query("UPDATE shop_settings SET shop_name = ?, phone = ?, address = ? WHERE id = ?")
                .bind(shop_name)
                .bind(phone)
                .bind(address)
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
    // We can just drop the specific tables we know about, or use a query to find all tables.
    // Since we only have 'shop_settings' for now (and maybe others in future), 
    // let's be explicit or try to drop everything.
    // For now, let's just drop 'shop_settings'. 
    // A more robust way for "Reset All" is to drop the table.
    sqlx::query("DROP TABLE IF EXISTS shop_settings")
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DROP TABLE IF EXISTS users")
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    // 2. Delete logos directory
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let logos_dir = app_data_dir.join("logos");
        if logos_dir.exists() {
             let _ = fs::remove_dir_all(&logos_dir); // Ignore errors if we can't delete
        }
    }

    // 3. Re-run migrations
    sqlx::query(include_str!("../migrations/001_create_shop_settings.sql"))
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query(include_str!("../migrations/002_create_users_table.sql"))
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create shop_settings table",
            sql: include_str!("../migrations/001_create_shop_settings.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create users table",
            sql: include_str!("../migrations/002_create_users_table.sql"),
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

            // Run the migration on our pool as well
            tauri::async_runtime::block_on(async {
                sqlx::query(include_str!("../migrations/001_create_shop_settings.sql"))
                    .execute(&pool)
                    .await
                    .expect("Failed to run migration 001");
                
                sqlx::query(include_str!("../migrations/002_create_users_table.sql"))
                    .execute(&pool)
                    .await
                    .expect("Failed to run migration 002");
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
            login_user
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
