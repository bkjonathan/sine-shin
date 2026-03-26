use std::sync::Arc;

use sea_orm::{ColumnTrait, ConnectionTrait, EntityTrait, FromQueryResult, PaginatorTrait, QueryFilter, Statement};
use tracing::{info, instrument};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::models::User;
use crate::state::AppState;

/// Registers a user by hashing and storing credentials.
#[instrument(skip(state, password), fields(username = %name))]
pub async fn register_user(state: Arc<AppState>, name: String, password: String) -> AppResult<()> {
    use crate::entities::users;
    use sea_orm::{ActiveModelTrait, Set};

    let id = Uuid::new_v4().to_string();
    let password_hash = bcrypt::hash(password, bcrypt::DEFAULT_COST)?;
    let now = chrono::Utc::now().to_rfc3339();

    users::ActiveModel {
        id: Set(id),
        name: Set(name),
        password_hash: Set(password_hash),
        role: Set("admin".to_string()),
        created_at: Set(Some(now)),
        ..Default::default()
    }
    .insert(state.db.as_ref())
    .await?;

    info!("user registered");
    Ok(())
}

/// Logs in a user by validating password hash.
#[instrument(skip(state, password), fields(username = %name))]
pub async fn login_user(state: Arc<AppState>, name: String, password: String) -> AppResult<User> {
    use crate::entities::users;

    let backend = state.db.as_ref().get_database_backend();
    let user = User::find_by_statement(Statement::from_sql_and_values(
        backend,
        "SELECT id, name, password_hash, role, created_at FROM users WHERE name = $1 LIMIT 1",
        [name.clone().into()],
    ))
    .one(state.db.as_ref())
    .await?;

    match user {
        Some(user) => {
            let valid = bcrypt::verify(password, &user.password_hash)?;
            if valid {
                info!("user login successful");
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
    use crate::entities::{shop_settings, users};

    let shop_count = shop_settings::Entity::find()
        .count(state.db.as_ref())
        .await?;
    let user_count = users::Entity::find()
        .count(state.db.as_ref())
        .await?;

    Ok(shop_count > 0 && user_count > 0)
}
