use std::collections::HashMap;
use std::sync::Arc;

use sea_orm::{ColumnTrait, EntityTrait, QueryFilter, QueryOrder};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::{info, instrument};

use crate::entities::sync_config;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::sync::SyncConfig;

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct StaffUserMetadata {
    pub name: Option<String>,
    pub role: Option<String>,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct StaffUser {
    pub id: String,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub user_metadata: StaffUserMetadata,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct StaffUsersResponse {
    #[serde(default)]
    pub users: Vec<StaffUser>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum StaffUsersApiResponse {
    Wrapped(StaffUsersResponse),
    Direct(Vec<StaffUser>),
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum StaffUserApiResponse {
    Direct(StaffUser),
    Wrapped { user: StaffUser },
}

#[derive(Debug, Serialize)]
struct CreateStaffUserPayload {
    email: String,
    password: String,
    email_confirm: bool,
    user_metadata: StaffUserMetadata,
}

#[derive(Debug, Serialize, Default)]
struct UpdateStaffUserPayload {
    #[serde(skip_serializing_if = "Option::is_none")]
    email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    user_metadata: Option<StaffUserMetadata>,
}

/// Loads the active sync configuration using the SeaORM entity.
async fn load_sync_config(state: &AppState) -> AppResult<SyncConfig> {
    let db = state.db.lock().await.clone();
    let row = sync_config::Entity::find()
        .filter(sync_config::Column::IsActive.eq(1))
        .order_by_desc(sync_config::Column::Id)
        .one(&db)
        .await?
        .ok_or(AppError::SyncConfigNotFound)?;

    let sync_interval = row.sync_interval.unwrap_or(30);
    let sync_enabled = row.sync_enabled.unwrap_or(1) == 1;

    Ok(SyncConfig {
        id: Some(row.id),
        supabase_url: row.supabase_url,
        supabase_anon_key: row.supabase_anon_key,
        supabase_service_key: row.supabase_service_key,
        sync_enabled,
        sync_interval,
    })
}

/// Fetches all staff users from Supabase admin users API.
#[instrument(skip(state), fields(command = "get_staff_users"))]
pub async fn get_staff_users(state: Arc<AppState>) -> AppResult<StaffUsersResponse> {
    let config = load_sync_config(&state).await?;
    let url = format!(
        "{}/auth/v1/admin/users",
        config.supabase_url.trim_end_matches('/')
    );

    let response: StaffUsersApiResponse = state
        .supabase_client
        .get_json(&url, &config.supabase_service_key, "get_staff_users")
        .await?;

    let users = match response {
        StaffUsersApiResponse::Wrapped(payload) => payload,
        StaffUsersApiResponse::Direct(users) => StaffUsersResponse { users },
    };

    info!(count = users.users.len(), "loaded staff users");
    Ok(users)
}

/// Creates a new staff user in Supabase.
#[instrument(skip(state, password, data), fields(command = "create_staff_user", email = %email))]
pub async fn create_staff_user(
    state: Arc<AppState>,
    email: String,
    password: String,
    data: StaffUserMetadata,
) -> AppResult<StaffUser> {
    let email = normalize_required(&email, "email")?;
    let password = normalize_required(&password, "password")?;
    let payload = CreateStaffUserPayload {
        email: email.clone(),
        password,
        email_confirm: true,
        user_metadata: data.normalized(),
    };

    let config = load_sync_config(&state).await?;
    let url = format!(
        "{}/auth/v1/admin/users",
        config.supabase_url.trim_end_matches('/')
    );

    let response: StaffUserApiResponse = state
        .supabase_client
        .post_json(&url, &config.supabase_service_key, &payload, "create_staff_user")
        .await?;

    let user = unpack_user(response);
    info!(user_id = %user.id, email = %user.email, "created staff user");
    Ok(user)
}

/// Updates an existing staff user in Supabase.
#[instrument(skip(state, password, data), fields(command = "update_staff_user", user_id = %id))]
pub async fn update_staff_user(
    state: Arc<AppState>,
    id: String,
    email: Option<String>,
    password: Option<String>,
    data: Option<StaffUserMetadata>,
) -> AppResult<StaffUser> {
    let id = normalize_required(&id, "id")?;
    let payload = UpdateStaffUserPayload {
        email: normalize_optional(email),
        password: normalize_optional(password),
        user_metadata: data.map(StaffUserMetadata::normalized),
    };

    if payload.email.is_none() && payload.password.is_none() && payload.user_metadata.is_none() {
        return Err(AppError::invalid_input(
            "At least one field must be provided to update a staff user",
        ));
    }

    let config = load_sync_config(&state).await?;
    let url = format!(
        "{}/auth/v1/admin/users/{id}",
        config.supabase_url.trim_end_matches('/')
    );

    let response: StaffUserApiResponse = state
        .supabase_client
        .put_json(&url, &config.supabase_service_key, &payload, "update_staff_user")
        .await?;

    let user = unpack_user(response);
    info!(user_id = %user.id, "updated staff user");
    Ok(user)
}

/// Deletes a staff user in Supabase by id.
#[instrument(skip(state), fields(command = "delete_staff_user", user_id = %id))]
pub async fn delete_staff_user(state: Arc<AppState>, id: String) -> AppResult<()> {
    let id = normalize_required(&id, "id")?;
    let config = load_sync_config(&state).await?;
    let url = format!(
        "{}/auth/v1/admin/users/{id}",
        config.supabase_url.trim_end_matches('/')
    );

    state
        .supabase_client
        .delete_empty(&url, &config.supabase_service_key, "delete_staff_user")
        .await?;

    info!(user_id = %id, "deleted staff user");
    Ok(())
}

fn normalize_optional(value: Option<String>) -> Option<String> {
    value
        .map(|raw| raw.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn normalize_required(value: &str, field_name: &str) -> AppResult<String> {
    let normalized = value.trim();
    if normalized.is_empty() {
        return Err(AppError::invalid_input(format!(
            "{field_name} cannot be empty"
        )));
    }
    Ok(normalized.to_string())
}

fn unpack_user(response: StaffUserApiResponse) -> StaffUser {
    match response {
        StaffUserApiResponse::Direct(user) => user,
        StaffUserApiResponse::Wrapped { user } => user,
    }
}

impl StaffUserMetadata {
    fn normalized(mut self) -> Self {
        self.name = self.name.and_then(trimmed);
        self.role = self.role.and_then(trimmed);
        self
    }
}

fn trimmed(value: String) -> Option<String> {
    let normalized = value.trim().to_string();
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}
