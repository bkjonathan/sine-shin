use tauri::{AppHandle, Manager};

use crate::models::User;
use crate::state::AppDb;

#[tauri::command]
pub async fn register_user(app: AppHandle, name: String, password: String) -> Result<(), String> {
    let db = app.state::<AppDb>();
    let pool = db.0.lock().await;

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
pub async fn login_user(app: AppHandle, name: String, password: String) -> Result<User, String> {
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
pub async fn check_is_onboarded(app: AppHandle) -> Result<bool, String> {
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
