mod commands;
mod db;
mod models;
mod state;
pub mod scheduler;
pub mod sync;

use std::fs;
use std::process::Command;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use sqlx::sqlite::SqlitePoolOptions;
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};
use tokio::sync::Mutex;

use crate::commands::auth::{check_is_onboarded, login_user, register_user};
use crate::commands::customer::{
    create_customer, delete_customer, get_customer, get_customers, get_customers_paginated,
    update_customer,
};
use crate::commands::expense::{
    create_expense, delete_expense, get_expense, get_expenses, get_expenses_paginated,
    update_expense,
};
use crate::commands::order::{
    create_order, delete_order, get_customer_orders, get_dashboard_stats, get_order, get_orders,
    get_orders_for_export, get_orders_paginated, update_order,
};
use crate::commands::settings::{get_app_settings, update_app_settings, AppSettings};
use crate::commands::shop::{get_shop_settings, save_shop_setup, update_shop_settings};
use crate::commands::system::{backup_database, get_db_status, reset_app_data, restore_database};
use crate::commands::drive::{disconnect_google_drive, get_drive_connection_status, start_google_oauth, trigger_drive_backup};
use crate::db::init_db;
use crate::state::AppDb;
use crate::scheduler::{setup_scheduler, reload_scheduler};
use crate::sync::{
    save_sync_config, get_sync_config, test_sync_connection, trigger_sync_now,
    get_sync_queue_stats, get_sync_sessions, get_sync_queue_items, retry_failed_items,
    clear_synced_items, clean_sync_data, set_master_password, verify_master_password, migrate_to_new_database,
    get_migration_sql, trigger_full_sync, start_sync_loop,
};

#[tauri::command]
fn print_window(window: tauri::WebviewWindow) -> tauri::Result<()> {
    window.print()?;
    Ok(())
}

#[tauri::command]
fn print_invoice_direct(
    app: tauri::AppHandle,
    bytes: Vec<u8>,
    printer_name: Option<String>,
) -> Result<(), String> {
    if bytes.is_empty() {
        return Err("Invoice image is empty".to_string());
    }

    let temp_dir = app
        .path()
        .app_cache_dir()
        .unwrap_or_else(|_| std::env::temp_dir());
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let temp_path = temp_dir.join(format!("invoice_{timestamp}.png"));
    fs::write(&temp_path, bytes).map_err(|e| e.to_string())?;

    let sanitized_printer = printer_name
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty());

    let print_result = (|| -> Result<(), String> {
        #[cfg(target_os = "macos")]
        {
            let mut command = Command::new("lp");
            if let Some(printer) = sanitized_printer {
                command.arg("-d").arg(printer);
            }
            let output = command
                .arg(&temp_path)
                .output()
                .map_err(|e| e.to_string())?;
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let details = if !stderr.is_empty() { stderr } else { stdout };
                return Err(if details.is_empty() {
                    "Failed to print invoice".to_string()
                } else {
                    details
                });
            }
            Ok(())
        }

        #[cfg(target_os = "linux")]
        {
            let mut command = Command::new("lp");
            if let Some(printer) = sanitized_printer {
                command.arg("-d").arg(printer);
            }
            let output = command
                .arg(&temp_path)
                .output()
                .map_err(|e| e.to_string())?;
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let details = if !stderr.is_empty() { stderr } else { stdout };
                return Err(if details.is_empty() {
                    "Failed to print invoice".to_string()
                } else {
                    details
                });
            }
            Ok(())
        }

        #[cfg(target_os = "windows")]
        {
            let printer = sanitized_printer.ok_or_else(|| {
                "Please set a printer name in Settings before using direct print.".to_string()
            })?;

            let output = Command::new("mspaint")
                .arg("/pt")
                .arg(&temp_path)
                .arg(printer)
                .output()
                .map_err(|e| e.to_string())?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let details = if !stderr.is_empty() { stderr } else { stdout };
                return Err(if details.is_empty() {
                    "Failed to print invoice".to_string()
                } else {
                    details
                });
            }
            Ok(())
        }
    })();

    let _ = fs::remove_file(&temp_path);
    print_result
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "init database",
        sql: include_str!("../migrations/001_init.sql"),
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
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");

            // Initialize settings.json if it doesn't exist
            let settings_path = app_data_dir.join("settings.json");
            if !settings_path.exists() {
                let default_settings = AppSettings::default();
                let settings_json = serde_json::to_string_pretty(&default_settings)
                    .expect("Failed to serialize default settings");
                fs::write(&settings_path, settings_json).expect("Failed to write settings.json");
            }

            let db_path = app_data_dir.join("shop.db");
            let db_url = format!("sqlite:{}?mode=rwc", db_path.to_string_lossy());

            let pool = tauri::async_runtime::block_on(async {
                let pool = SqlitePoolOptions::new()
                    .max_connections(5)
                    .connect(&db_url)
                    .await
                    .expect("Failed to create database pool");

                init_db(&pool).await.expect("Failed to initialize database");

                pool
            });

            app.manage(AppDb(Arc::new(Mutex::new(pool))));

            let app_handle = app.handle().clone();
            let scheduler_state = tauri::async_runtime::block_on(async {
                setup_scheduler(app_handle).await
            });
            app.manage(scheduler_state);

            // Start the sync background loop
            start_sync_loop(app.handle().clone());

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
            backup_database,
            restore_database,
            register_user,
            login_user,
            get_db_status,
            create_customer,
            get_customers,
            get_customers_paginated,
            get_customer,
            update_customer,
            delete_customer,
            create_expense,
            get_expenses,
            get_expenses_paginated,
            get_expense,
            update_expense,
            delete_expense,
            create_order,
            get_orders,
            get_orders_for_export,
            get_orders_paginated,
            get_order,
            get_customer_orders,
            update_order,
            delete_order,
            get_dashboard_stats,
            get_app_settings,
            update_app_settings,
            print_window,
            print_invoice_direct,
            start_google_oauth,
            get_drive_connection_status,
            disconnect_google_drive,
            trigger_drive_backup,
            reload_scheduler,
            save_sync_config,
            get_sync_config,
            test_sync_connection,
            trigger_sync_now,
            get_sync_queue_stats,
            get_sync_sessions,
            get_sync_queue_items,
            retry_failed_items,
            clear_synced_items,
            set_master_password,
            verify_master_password,
            migrate_to_new_database,
            get_migration_sql,
            trigger_full_sync,
            clean_sync_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
