use std::sync::Arc;

use sea_orm::{
    ActiveModelTrait, ConnectionTrait, EntityTrait, FromQueryResult, PaginatorTrait, Set,
};
use tracing::{info, instrument};
use uuid::Uuid;

use crate::db::sql_statement_with_values;
use crate::entities::{shop_settings, users};
use crate::error::{AppError, AppResult};
use crate::models::User;
use crate::state::AppState;

/// Registers a user by hashing and storing credentials.
#[instrument(skip(state, password), fields(username = %name))]
pub async fn register_user(state: Arc<AppState>, name: String, password: String) -> AppResult<()> {
    let db = state.db.lock().await.clone();
    let user_id = Uuid::new_v4().to_string();
    let password_hash = bcrypt::hash(password, bcrypt::DEFAULT_COST)?;

    users::ActiveModel {
        id: Set(user_id),
        name: Set(name),
        password_hash: Set(password_hash),
        role: Set("owner".to_string()),
        ..Default::default()
    }
    .insert(&db)
    .await?;

    info!("user registered");
    Ok(())
}

/// Logs in a user by validating password hash.
#[instrument(skip(state, password), fields(username = %name))]
pub async fn login_user(state: Arc<AppState>, name: String, password: String) -> AppResult<User> {
    let db = state.db.lock().await.clone();
    let backend = db.get_database_backend();

    let user = User::find_by_statement(sql_statement_with_values(
        backend,
        "SELECT id, name, password_hash, role, created_at FROM users WHERE name = ?",
        [name.into()],
    ))
    .one(&db)
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
    let db = state.db.lock().await.clone();

    let shop_count = shop_settings::Entity::find().count(&db).await?;
    let user_count = users::Entity::find().count(&db).await?;

    Ok(shop_count > 0 && user_count > 0)
}
