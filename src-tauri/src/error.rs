use serde::ser::Serializer;
use serde::Serialize;
use thiserror::Error;

/// Unified app error type for Tauri commands and internal services.
#[derive(Debug, Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] sea_orm::DbErr),
    #[error("HTTP client error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Serialization error: {0}")]
    SerdeJson(#[from] serde_json::Error),
    #[error("Crypto error: {0}")]
    Bcrypt(#[from] bcrypt::BcryptError),
    #[error("Tauri error: {0}")]
    Tauri(#[from] tauri::Error),
    #[error("Sync is not configured or enabled.")]
    SyncConfigNotFound,
    #[error("Invalid input: {0}")]
    InvalidInput(String),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Internal error: {0}")]
    Internal(String),
    #[error("{operation} failed with status {status}: {body}")]
    SupabaseRequestFailed {
        operation: &'static str,
        status: u16,
        body: String,
    },
    #[error("Failed to parse {operation} response: {details}")]
    InvalidApiResponse {
        operation: &'static str,
        details: String,
    },
}

/// Serializable error response sent to the frontend.
#[derive(Debug, Serialize)]
pub struct AppErrorResponse {
    pub code: &'static str,
    pub message: String,
}

/// Result alias used across command/service modules.
pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    /// Creates a validation error from a displayable message.
    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self::InvalidInput(message.into())
    }

    /// Creates a not-found error from a displayable message.
    pub fn not_found(message: impl Into<String>) -> Self {
        Self::NotFound(message.into())
    }

    /// Creates a generic internal error from a displayable message.
    pub fn internal(message: impl Into<String>) -> Self {
        Self::Internal(message.into())
    }

    /// Creates a Supabase HTTP failure error and trims oversized response bodies.
    pub fn supabase_request_failed(operation: &'static str, status: u16, body: String) -> Self {
        Self::SupabaseRequestFailed {
            operation,
            status,
            body: trim_body(body),
        }
    }

    /// Creates an API response parsing error from a serde JSON error.
    pub fn invalid_api_response(operation: &'static str, error: serde_json::Error) -> Self {
        Self::InvalidApiResponse {
            operation,
            details: error.to_string(),
        }
    }

    /// Returns a stable error code that frontend code can match on.
    pub fn code(&self) -> &'static str {
        match self {
            Self::Database(_) => "database_error",
            Self::Http(_) => "http_error",
            Self::Io(_) => "io_error",
            Self::SerdeJson(_) => "serde_json_error",
            Self::Bcrypt(_) => "bcrypt_error",
            Self::Tauri(_) => "tauri_error",
            Self::SyncConfigNotFound => "sync_config_not_found",
            Self::InvalidInput(_) => "invalid_input",
            Self::NotFound(_) => "not_found",
            Self::Internal(_) => "internal_error",
            Self::SupabaseRequestFailed { .. } => "supabase_request_failed",
            Self::InvalidApiResponse { .. } => "invalid_api_response",
        }
    }
}

impl From<&AppError> for AppErrorResponse {
    fn from(value: &AppError) -> Self {
        Self {
            code: value.code(),
            message: value.to_string(),
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        AppErrorResponse::from(self).serialize(serializer)
    }
}

impl From<String> for AppError {
    fn from(value: String) -> Self {
        Self::Internal(value)
    }
}

impl From<&str> for AppError {
    fn from(value: &str) -> Self {
        Self::Internal(value.to_string())
    }
}

fn trim_body(mut body: String) -> String {
    const MAX: usize = 1_024;
    if body.len() > MAX {
        body.truncate(MAX);
        body.push_str("...");
    }

    body
}
