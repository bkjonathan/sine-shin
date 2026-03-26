mod commands;
mod db;
mod entities;
mod error;
mod migration;
mod models;
pub mod scheduler;
mod services;
mod state;
pub mod sync;

use std::fs;
use std::process::Command;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use reqwest::Client;
use tauri::Manager;
use tokio::sync::Mutex;

use crate::commands::account::get_account_summary;
use crate::commands::auth::{check_is_onboarded, login_user, register_user};
use crate::commands::customer::{
    create_customer, delete_customer, get_customer, get_customers, get_customers_paginated,
    update_customer,
};
use crate::commands::drive::{
    disconnect_google_drive, get_drive_connection_status, start_google_oauth, trigger_drive_backup,
};
use crate::commands::expense::{
    create_expense, delete_expense, get_expense, get_expenses, get_expenses_paginated,
    update_expense,
};
use crate::commands::order::{
    create_order, delete_order, get_customer_orders, get_dashboard_detail_records,
    get_dashboard_stats, get_order, get_orders, get_orders_for_export, get_orders_paginated,
    update_order,
};
use crate::commands::settings::{
    configure_database, get_app_settings, get_aws_s3_connection_status, test_aws_s3_connection,
    test_postgresql_connection, update_app_settings, AppSettings,
};
use crate::commands::shop::{
    get_shop_settings, save_shop_setup, update_shop_settings, upload_shop_logo_to_s3,
};
use crate::commands::staff::{
    create_staff_user, delete_staff_user, get_staff_users, update_staff_user,
};
use crate::commands::system::{
    backup_database, get_db_status, reset_app_data, reset_table_sequence, restore_database,
};
use crate::db::connect_database;
use crate::scheduler::{reload_scheduler, setup_scheduler};
use crate::state::{AppDb, AppState};
use crate::sync::{
    apply_remote_changes, clean_sync_data, clear_synced_items, fetch_remote_changes,
    get_migration_sql, get_sync_config, get_sync_queue_items, get_sync_queue_stats,
    get_sync_sessions, migrate_to_new_database, retry_failed_items, save_sync_config,
    set_master_password, start_sync_loop, test_sync_connection, trigger_full_sync,
    trigger_sync_now, truncate_and_sync, update_sync_interval, verify_master_password,
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
        #[cfg(any(target_os = "macos", target_os = "linux"))]
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
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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

            let settings: AppSettings = serde_json::from_str(
                &fs::read_to_string(&settings_path).expect("Failed to read settings.json"),
            )
            .unwrap_or_default();

            let normalized_postgresql_url = settings.normalized_postgresql_url();
            let app_handle = app.handle().clone();
            let (db, sqlite_pool) = tauri::async_runtime::block_on(async {
                connect_database(
                    &app_handle,
                    settings.database_kind,
                    normalized_postgresql_url.as_deref(),
                )
                .await
                .expect("Failed to initialize database")
            });
            let shared_pool = Arc::new(Mutex::new(sqlite_pool));

            let app_state = Arc::new(AppState::new(
                db,
                shared_pool.clone(),
                settings.database_kind,
                Client::new(),
            ));
            app.manage(app_state.clone());
            app.manage(AppDb(shared_pool));

            let app_handle = app.handle().clone();
            let scheduler_state =
                tauri::async_runtime::block_on(async { setup_scheduler(app_handle).await });
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
            upload_shop_logo_to_s3,
            reset_app_data,
            backup_database,
            restore_database,
            register_user,
            login_user,
            get_db_status,
            reset_table_sequence,
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
            get_dashboard_detail_records,
            get_account_summary,
            get_app_settings,
            update_app_settings,
            configure_database,
            test_aws_s3_connection,
            test_postgresql_connection,
            get_aws_s3_connection_status,
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
            truncate_and_sync,
            clean_sync_data,
            update_sync_interval,
            get_staff_users,
            create_staff_user,
            update_staff_user,
            delete_staff_user,
            fetch_remote_changes,
            apply_remote_changes
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
