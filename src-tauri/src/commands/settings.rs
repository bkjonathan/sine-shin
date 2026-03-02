use aws_config::BehaviorVersion;
use aws_credential_types::provider::SharedCredentialsProvider;
use aws_sdk_s3::config::{Credentials, Region};
use serde::{Deserialize, Serialize};
use std::fs;
use tauri::Manager;

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

fn normalize_s3_bucket_name(bucket_name: &str) -> String {
    bucket_name
        .trim()
        .trim_start_matches("s3://")
        .trim_end_matches('/')
        .to_string()
}

fn validate_s3_connection_input(input: &AwsS3ConnectionInput) -> Result<AwsS3ConnectionInput, String> {
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
        return Err("AWS Access Key, Secret Key, Region, and Bucket are required.".to_string());
    }

    Ok(normalized)
}

async fn check_aws_s3_connection(input: &AwsS3ConnectionInput) -> Result<(), String> {
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
        .map_err(|err| format!("Unable to connect to S3 bucket: {err}"))?;

    Ok(())
}

#[tauri::command]
pub fn get_app_settings(app: tauri::AppHandle) -> Result<AppSettings, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let settings_path = app_data_dir.join("settings.json");

    if !settings_path.exists() {
        let default_settings = AppSettings::default();
        let settings_json =
            serde_json::to_string_pretty(&default_settings).map_err(|e| e.to_string())?;
        fs::write(&settings_path, settings_json).map_err(|e| e.to_string())?;
        return Ok(default_settings);
    }

    let settings_content = fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
    let settings: AppSettings =
        serde_json::from_str(&settings_content).unwrap_or_else(|_| AppSettings::default());

    Ok(settings)
}

#[tauri::command]
pub fn update_app_settings(app: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let settings_path = app_data_dir.join("settings.json");

    let settings_json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(settings_path, settings_json).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn test_aws_s3_connection(
    config: AwsS3ConnectionInput,
) -> Result<AwsS3ConnectionStatus, String> {
    match check_aws_s3_connection(&config).await {
        Ok(_) => Ok(AwsS3ConnectionStatus {
            connected: true,
            message: "Connected to AWS S3 successfully.".to_string(),
        }),
        Err(err) => Ok(AwsS3ConnectionStatus {
            connected: false,
            message: err,
        }),
    }
}

#[tauri::command]
pub async fn get_aws_s3_connection_status(app: tauri::AppHandle) -> Result<AwsS3ConnectionStatus, String> {
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
            message: err,
        }),
    }
}
