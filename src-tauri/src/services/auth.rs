use std::sync::Arc;

use tracing::{info, instrument};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::models::User;
use crate::state::AppState;

/// Registers a user by hashing and storing credentials.
#[instrument(skip(state, password), fields(username = %name))]
pub async fn register_user(state: Arc<AppState>, name: String, password: String) -> AppResult<()> {
    let pool = state.db.lock().await;
    let user_id = Uuid::new_v4().to_string();
    let password_hash = bcrypt::hash(password, bcrypt::DEFAULT_COST)?;

    sqlx::query("INSERT INTO users (id, name, password_hash) VALUES (?, ?, ?)")
        .bind(user_id)
        .bind(name)
        .bind(password_hash)
        .execute(&*pool)
        .await?;

    info!("user registered");
    Ok(())
}

/// Logs in a user by validating password hash.
#[instrument(skip(state, password), fields(username = %name))]
pub async fn login_user(state: Arc<AppState>, name: String, password: String) -> AppResult<User> {
    let pool = state.db.lock().await;

    let user: Option<User> = sqlx::query_as("SELECT * FROM users WHERE name = ?")
        .bind(&name)
        .fetch_optional(&*pool)
        .await?;

    match user {
        Some(user) => {
            let valid = bcrypt::verify(password, &user.password_hash)?;
            if valid {
                info!(user_id = user.id, "user login successful");
                Ok(user)
            } else {
                Err(AppError::invalid_input("Invalid password"))
            }
        }
        None => Err(AppError::not_found("User not found")),
    }
}

/// Checks whether onboarding data exists.
#[instrument(skip(state))]
pub async fn check_is_onboarded(state: Arc<AppState>) -> AppResult<bool> {
    let pool = state.db.lock().await;

    let shop_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM shop_settings")
        .fetch_one(&*pool)
        .await?;

    let user_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
        .fetch_one(&*pool)
        .await?;

    Ok(shop_count.0 > 0 && user_count.0 > 0)
}
