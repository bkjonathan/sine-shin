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

#[tauri::command]
async fn check_is_onboarded(app: AppHandle) -> Result<bool, String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM shop_settings")
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(count.0 > 0)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "create shop_settings table",
        sql: include_str!("../migrations/001_create_shop_settings.sql"),
        kind: MigrationKind::Up,
    }];

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
                    .expect("Failed to run migration");
            });

            app.manage(AppDb(Arc::new(Mutex::new(pool))));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![check_is_onboarded, save_shop_setup, get_shop_settings])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
