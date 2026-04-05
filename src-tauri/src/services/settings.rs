use std::fs;
use std::sync::Arc;

use aws_config::BehaviorVersion;
use aws_credential_types::provider::SharedCredentialsProvider;
use aws_sdk_s3::config::{Credentials, Region};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tracing::instrument;

use sea_orm::{EntityTrait, PaginatorTrait};

use crate::crypto;
use crate::db;
use crate::entities::{shop_settings, users};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DatabaseKind {
    Sqlite,
    Postgresql,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub language: String,
    pub sound_effect: bool,
    pub theme: String,
    #[serde(default = "default_accent_color")]
    pub accent_color: String,
    #[serde(default = "default_currency")]
    pub currency: String,
    #[serde(default = "default_currency_symbol")]
    pub currency_symbol: String,
    #[serde(default = "default_exchange_currency")]
    pub exchange_currency: String,
    #[serde(default = "default_exchange_currency_symbol")]
    pub exchange_currency_symbol: String,
    #[serde(default)]
    pub invoice_printer_name: String,
    #[serde(default = "default_silent_invoice_print")]
    pub silent_invoice_print: bool,
    #[serde(default = "default_auto_backup")]
    pub auto_backup: bool,
    #[serde(default = "default_backup_frequency")]
    pub backup_frequency: String,
    #[serde(default = "default_backup_time")]
    pub backup_time: String,
    #[serde(default = "default_font_size")]
    pub font_size: String,
    #[serde(default)]
    pub aws_access_key_id: String,
    #[serde(default)]
    pub aws_secret_access_key: String,
    #[serde(default)]
    pub aws_region: String,
    #[serde(default)]
    pub aws_bucket_name: String,
    #[serde(default)]
    pub imagekit_base_url: String,
    #[serde(default = "default_database_kind")]
    pub database_kind: DatabaseKind,
    #[serde(default)]
    pub postgresql_url: String,
}

fn default_accent_color() -> String {
    "blue".to_string()
}

fn default_currency() -> String {
    "USD".to_string()
}

fn default_currency_symbol() -> String {
    "$".to_string()
}

fn default_exchange_currency() -> String {
    "MMK".to_string()
}

fn default_exchange_currency_symbol() -> String {
    "Ks".to_string()
}

fn default_silent_invoice_print() -> bool {
    true
}

fn default_auto_backup() -> bool {
    true
}

fn default_backup_frequency() -> String {
    "never".to_string()
}

fn default_backup_time() -> String {
    "23:00".to_string()
}

fn default_font_size() -> String {
    "normal".to_string()
}

fn default_database_kind() -> DatabaseKind {
    DatabaseKind::Sqlite
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            language: "en".to_string(),
            sound_effect: true,
            theme: "dark".to_string(),
            accent_color: "blue".to_string(),
            currency: "USD".to_string(),
            currency_symbol: "$".to_string(),
            exchange_currency: "MMK".to_string(),
            exchange_currency_symbol: "Ks".to_string(),
            invoice_printer_name: String::new(),
            silent_invoice_print: true,
            auto_backup: true,
            backup_frequency: "never".to_string(),
            backup_time: "23:00".to_string(),
            font_size: "normal".to_string(),
            aws_access_key_id: String::new(),
            aws_secret_access_key: String::new(),
            aws_region: String::new(),
            aws_bucket_name: String::new(),
            imagekit_base_url: String::new(),
            database_kind: DatabaseKind::Sqlite,
            postgresql_url: String::new(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AwsS3ConnectionInput {
    pub access_key_id: String,
    pub secret_access_key: String,
    pub region: String,
    pub bucket_name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AwsS3ConnectionStatus {
    pub connected: bool,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DatabaseConnectionInput {
    pub database_kind: DatabaseKind,
    pub postgresql_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DatabaseConnectionStatus {
    pub connected: bool,
    pub message: String,
}

impl AppSettings {
    pub fn normalized_postgresql_url(&self) -> Option<String> {
        match self.database_kind {
            DatabaseKind::Sqlite => None,
            DatabaseKind::Postgresql => {
                let normalized = self.postgresql_url.trim().to_string();
                if normalized.is_empty() {
                    None
                } else {
                    Some(normalized)
                }
            }
        }
    }
}

pub(crate) fn normalize_s3_bucket_name(bucket_name: &str) -> String {
    bucket_name
        .trim()
        .trim_start_matches("s3://")
        .trim_end_matches('/')
        .to_string()
}

fn validate_s3_connection_input(input: &AwsS3ConnectionInput) -> AppResult<AwsS3ConnectionInput> {
    let normalized = AwsS3ConnectionInput {
        access_key_id: input.access_key_id.trim().to_string(),
        secret_access_key: input.secret_access_key.trim().to_string(),
        region: input.region.trim().to_string(),
        bucket_name: normalize_s3_bucket_name(&input.bucket_name),
    };

    if normalized.access_key_id.is_empty()
        || normalized.secret_access_key.is_empty()
        || normalized.region.is_empty()
        || normalized.bucket_name.is_empty()
    {
        return Err(AppError::invalid_input(
            "AWS Access Key, Secret Key, Region, and Bucket are required.",
        ));
    }

    Ok(normalized)
}

async fn check_aws_s3_connection(input: &AwsS3ConnectionInput) -> AppResult<()> {
    let normalized = validate_s3_connection_input(input)?;

    let credentials = Credentials::new(
        normalized.access_key_id,
        normalized.secret_access_key,
        None,
        None,
        "thai-htay-settings",
    );

    let config = aws_config::defaults(BehaviorVersion::latest())
        .region(Region::new(normalized.region))
        .credentials_provider(SharedCredentialsProvider::new(credentials))
        .load()
        .await;

    let client = aws_sdk_s3::Client::new(&config);
    client
        .head_bucket()
        .bucket(normalized.bucket_name)
        .send()
        .await
        .map_err(|err| AppError::internal(format!("Unable to connect to S3 bucket: {err}")))?;

    Ok(())
}

/// Reads and returns app settings from disk.
#[instrument(skip(app))]
pub fn get_app_settings(app: AppHandle) -> AppResult<AppSettings> {
    let app_data_dir = app.path().app_data_dir()?;
    let settings_path = app_data_dir.join("settings.json");

    if !settings_path.exists() {
        let default_settings = AppSettings::default();
        let settings_json = serde_json::to_string_pretty(&default_settings)?;
        fs::write(&settings_path, settings_json)?;
        return Ok(default_settings);
    }

    let settings_content = fs::read_to_string(&settings_path)?;
    let mut settings: AppSettings = serde_json::from_str(&settings_content).unwrap_or_default();

    // Decrypt sensitive fields — plain-text values (from before encryption was added) pass through unchanged
    settings.aws_access_key_id = crypto::decrypt_value(&app_data_dir, &settings.aws_access_key_id);
    settings.aws_secret_access_key =
        crypto::decrypt_value(&app_data_dir, &settings.aws_secret_access_key);
    settings.postgresql_url = crypto::decrypt_value(&app_data_dir, &settings.postgresql_url);

    Ok(settings)
}

/// Persists app settings to disk.
#[instrument(skip(app, settings))]
pub fn update_app_settings(app: AppHandle, settings: AppSettings) -> AppResult<()> {
    let app_data_dir = app.path().app_data_dir()?;
    let settings_path = app_data_dir.join("settings.json");

    // Encrypt sensitive fields before persisting to disk
    let encrypted_settings = AppSettings {
        postgresql_url: crypto::encrypt_value(
            &app_data_dir,
            settings.postgresql_url.trim(),
        ),
        aws_access_key_id: crypto::encrypt_value(
            &app_data_dir,
            settings.aws_access_key_id.trim(),
        ),
        aws_secret_access_key: crypto::encrypt_value(
            &app_data_dir,
            settings.aws_secret_access_key.trim(),
        ),
        ..settings
    };
    let settings_json = serde_json::to_string_pretty(&encrypted_settings)?;
    fs::write(settings_path, settings_json)?;
    Ok(())
}

/// Tests provided AWS S3 configuration and returns connection status payload.
#[instrument(skip(config))]
pub async fn test_aws_s3_connection(
    config: AwsS3ConnectionInput,
) -> AppResult<AwsS3ConnectionStatus> {
    match check_aws_s3_connection(&config).await {
        Ok(_) => Ok(AwsS3ConnectionStatus {
            connected: true,
            message: "Connected to AWS S3 successfully.".to_string(),
        }),
        Err(err) => Ok(AwsS3ConnectionStatus {
            connected: false,
            message: err.to_string(),
        }),
    }
}

/// Reads configured AWS S3 values from settings and reports connection status.
#[instrument(skip(app))]
pub async fn get_aws_s3_connection_status(app: AppHandle) -> AppResult<AwsS3ConnectionStatus> {
    let settings = get_app_settings(app)?;
    if settings.aws_access_key_id.trim().is_empty()
        || settings.aws_secret_access_key.trim().is_empty()
        || settings.aws_region.trim().is_empty()
        || settings.aws_bucket_name.trim().is_empty()
    {
        return Ok(AwsS3ConnectionStatus {
            connected: false,
            message: "AWS S3 is not configured.".to_string(),
        });
    }

    let config = AwsS3ConnectionInput {
        access_key_id: settings.aws_access_key_id,
        secret_access_key: settings.aws_secret_access_key,
        region: settings.aws_region,
        bucket_name: settings.aws_bucket_name,
    };

    match check_aws_s3_connection(&config).await {
        Ok(_) => Ok(AwsS3ConnectionStatus {
            connected: true,
            message: "Connected to AWS S3 successfully.".to_string(),
        }),
        Err(err) => Ok(AwsS3ConnectionStatus {
            connected: false,
            message: err.to_string(),
        }),
    }
}

#[instrument(skip(url))]
pub async fn test_postgresql_connection(url: String) -> AppResult<DatabaseConnectionStatus> {
    let normalized_url = url.trim().to_string();
    if normalized_url.is_empty() {
        return Err(AppError::invalid_input("PostgreSQL URL is required."));
    }

    db::connect_postgresql_database(&normalized_url).await?;

    Ok(DatabaseConnectionStatus {
        connected: true,
        message: "PostgreSQL connection and schema initialization successful.".to_string(),
    })
}

/// Connects to the given PostgreSQL URL and checks whether onboarding data already exists.
/// Returns `true` when both `shop_settings` and `users` have at least one row — meaning
/// a previous setup was done on this database and the user should connect directly rather
/// than go through the full onboarding wizard.
#[instrument(skip(url))]
pub async fn check_postgresql_already_onboarded(url: String) -> AppResult<bool> {
    let normalized_url = url.trim().to_string();
    if normalized_url.is_empty() {
        return Err(AppError::invalid_input("PostgreSQL URL is required."));
    }

    let db = db::connect_postgresql_database(&normalized_url).await?;
    let shop_count = shop_settings::Entity::find().count(&db).await?;
    let user_count = users::Entity::find().count(&db).await?;
    Ok(shop_count > 0 && user_count > 0)
}

#[instrument(skip(input))]
pub fn validate_database_connection_input(
    input: DatabaseConnectionInput,
) -> AppResult<DatabaseConnectionInput> {
    let normalized_url = input.postgresql_url.unwrap_or_default().trim().to_string();

    match input.database_kind {
        DatabaseKind::Sqlite => Ok(DatabaseConnectionInput {
            database_kind: DatabaseKind::Sqlite,
            postgresql_url: None,
        }),
        DatabaseKind::Postgresql => {
            if normalized_url.is_empty() {
                return Err(AppError::invalid_input("PostgreSQL URL is required."));
            }

            Ok(DatabaseConnectionInput {
                database_kind: DatabaseKind::Postgresql,
                postgresql_url: Some(normalized_url),
            })
        }
    }
}

#[instrument(skip(app, state, input))]
pub async fn configure_database(
    app: AppHandle,
    state: Arc<AppState>,
    input: DatabaseConnectionInput,
) -> AppResult<()> {
    let normalized = validate_database_connection_input(input)?;
    let (new_db, new_sqlite_pool) = db::connect_database(
        &app,
        normalized.database_kind,
        normalized.postgresql_url.as_deref(),
    )
    .await?;

    let mut next_settings = get_app_settings(app.clone())?;
    next_settings.database_kind = normalized.database_kind;
    next_settings.postgresql_url = normalized.postgresql_url.unwrap_or_default();
    update_app_settings(app.clone(), next_settings)?;

    let mut db_guard = state.db.lock().await;
    let mut sqlite_pool_guard = state.sqlite_pool.lock().await;
    let mut database_kind_guard = state.database_kind.lock().await;

    if let Some(existing_pool) = sqlite_pool_guard.take() {
        existing_pool.close().await;
    }

    *db_guard = new_db;
    *sqlite_pool_guard = new_sqlite_pool;
    *database_kind_guard = normalized.database_kind;

    Ok(())
}
