use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::time::Duration;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::time::timeout;
use tracing::instrument;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use crate::error::{AppError, AppResult};

const REDIRECT_URI: &str = "http://127.0.0.1:3456";
const AUTH_URI: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URI: &str = "https://oauth2.googleapis.com/token";
const DRIVE_UPLOAD_URI: &str =
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
const USER_INFO_URI: &str = "https://www.googleapis.com/oauth2/v2/userinfo";

fn get_client_id() -> AppResult<String> {
    let _ = dotenvy::dotenv();
    std::env::var("GOOGLE_CLIENT_ID")
        .map_err(|_| AppError::invalid_input("GOOGLE_CLIENT_ID must be set in .env"))
}

fn get_client_secret() -> AppResult<String> {
    let _ = dotenvy::dotenv();
    std::env::var("GOOGLE_CLIENT_SECRET")
        .map_err(|_| AppError::invalid_input("GOOGLE_CLIENT_SECRET must be set in .env"))
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DriveTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
    pub email: Option<String>,
}

#[derive(Serialize)]
pub struct DriveStatus {
    pub connected: bool,
    pub email: Option<String>,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    expires_in: Option<i64>,
}

#[derive(Deserialize)]
struct UserInfoResponse {
    #[serde(default)]
    email: Option<String>,
}

fn get_tokens_path(app: &AppHandle) -> AppResult<PathBuf> {
    let app_data_dir = app.path().app_data_dir()?;
    Ok(app_data_dir.join("drive_auth.json"))
}

pub fn read_tokens(app: &AppHandle) -> AppResult<DriveTokens> {
    let path = get_tokens_path(app)?;
    if !path.exists() {
        return Err(AppError::not_found("No tokens found"));
    }
    let data = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&data)?)
}

fn save_tokens(app: &AppHandle, tokens: &DriveTokens) -> AppResult<()> {
    let path = get_tokens_path(app)?;
    let data = serde_json::to_string(tokens)?;
    fs::write(path, data)?;
    Ok(())
}

/// Starts OAuth flow and stores Google Drive tokens.
#[instrument(skip(app))]
pub async fn start_google_oauth(app: &AppHandle) -> AppResult<DriveStatus> {
    let listener = TcpListener::bind("127.0.0.1:3456")
        .await
        .map_err(|e| AppError::internal(format!("Failed to bind to port 3456: {}", e)))?;

    let client_id = get_client_id()?;
    let auth_url = format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent",
        AUTH_URI, client_id, REDIRECT_URI, "https://www.googleapis.com/auth/drive.file email profile"
    );

    tauri_plugin_opener::open_url(&auth_url, None::<&str>)
        .map_err(|e| AppError::internal(format!("Failed to open browser: {}", e)))?;

    let result = timeout(Duration::from_secs(300), listener.accept()).await;
    let (mut socket, _) = match result {
        Ok(Ok(cxn)) => cxn,
        Ok(Err(e)) => return Err(AppError::internal(format!("Server error: {}", e))),
        Err(_) => return Err(AppError::internal("OAuth timed out after 5 minutes.")),
    };

    let mut buf = [0; 4096];
    let n = socket.read(&mut buf).await?;
    let request = String::from_utf8_lossy(&buf[..n]);

    let mut code = String::new();
    if let Some(code_start) = request.find("code=") {
        let start = code_start + 5;
        if let Some(code_end) = request[start..]
            .find('&')
            .or_else(|| request[start..].find(' '))
        {
            code = request[start..start + code_end].to_string();
        }
    }

    let response_html = if code.is_empty() {
        "HTTP/1.1 400 Bad Request\r\n\r\n<html><body><h2>Authentication failed</h2><p>Could not find authorization code.</p></body></html>"
    } else {
        "HTTP/1.1 200 OK\r\n\r\n<html><body><h2>Authentication successful!</h2><p>You can close this tab and return to the application.</p><script>window.close();</script></body></html>"
    };

    let _ = socket.write_all(response_html.as_bytes()).await;
    let _ = socket.flush().await;

    if code.is_empty() {
        return Err(AppError::internal(
            "Authorization code not found in the redirect request.",
        ));
    }

    let client = reqwest::Client::new();
    let client_id = get_client_id()?;
    let client_secret = get_client_secret()?;
    let params = [
        ("client_id", client_id.as_str()),
        ("client_secret", client_secret.as_str()),
        ("code", code.as_str()),
        ("grant_type", "authorization_code"),
        ("redirect_uri", REDIRECT_URI),
    ];

    let res = client.post(TOKEN_URI).form(&params).send().await?;
    if !res.status().is_success() {
        let err_text = response_text_or_empty(res).await;
        return Err(AppError::internal(format!(
            "Failed to exchange token: {}",
            err_text
        )));
    }

    let token_res: TokenResponse = res.json().await?;
    let access_token = token_res.access_token;
    let refresh_token = token_res.refresh_token.unwrap_or_default();
    let expires_in = token_res.expires_in.unwrap_or(3600);

    let user_info_res = client
        .get(USER_INFO_URI)
        .bearer_auth(&access_token)
        .send()
        .await;
    let email = match user_info_res {
        Ok(response) => match response.json::<UserInfoResponse>().await {
            Ok(info) => info.email,
            Err(_) => None,
        },
        Err(_) => None,
    };

    let drive_tokens = DriveTokens {
        access_token,
        refresh_token,
        expires_at: Utc::now().timestamp() + expires_in,
        email: email.clone(),
    };

    save_tokens(app, &drive_tokens)?;
    Ok(DriveStatus {
        connected: true,
        email,
    })
}

/// Returns Google Drive connection status.
#[instrument(skip(app))]
pub async fn get_drive_connection_status(app: &AppHandle) -> AppResult<DriveStatus> {
    match read_tokens(app) {
        Ok(tokens) => Ok(DriveStatus {
            connected: true,
            email: tokens.email,
        }),
        Err(_) => Ok(DriveStatus {
            connected: false,
            email: None,
        }),
    }
}

/// Removes locally stored Google Drive tokens.
#[instrument(skip(app))]
pub async fn disconnect_google_drive(app: &AppHandle) -> AppResult<()> {
    let path = get_tokens_path(app)?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}

async fn refresh_token_if_needed(app: &AppHandle, tokens: &mut DriveTokens) -> AppResult<()> {
    if Utc::now().timestamp() > tokens.expires_at - 300 {
        if tokens.refresh_token.is_empty() {
            return Err(AppError::internal(
                "Token expired and no refresh token available",
            ));
        }

        let client = reqwest::Client::new();
        let client_id = get_client_id()?;
        let client_secret = get_client_secret()?;
        let params = [
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("refresh_token", tokens.refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ];

        let res = client.post(TOKEN_URI).form(&params).send().await?;
        if !res.status().is_success() {
            let err_text = response_text_or_empty(res).await;
            return Err(AppError::internal(format!(
                "Failed to refresh token: {}",
                err_text
            )));
        }

        let token_res: TokenResponse = res.json().await?;
        tokens.access_token = token_res.access_token;
        if let Some(rt) = token_res.refresh_token {
            tokens.refresh_token = rt;
        }
        let expires_in = token_res.expires_in.unwrap_or(3600);
        tokens.expires_at = Utc::now().timestamp() + expires_in;
        save_tokens(app, tokens)?;
    }
    Ok(())
}

/// Triggers an immediate Google Drive backup upload.
#[instrument(skip(app))]
pub async fn trigger_drive_backup(app: &AppHandle) -> AppResult<String> {
    perform_drive_backup(app).await
}

/// Performs DB zip backup and uploads it to Google Drive.
#[instrument(skip(app))]
pub async fn perform_drive_backup(app: &AppHandle) -> AppResult<String> {
    let mut tokens = read_tokens(app)?;
    refresh_token_if_needed(app, &mut tokens).await?;

    let app_data_dir = app.path().app_data_dir()?;
    let db_path = app_data_dir.join("shop.db");
    if !db_path.exists() {
        return Err(AppError::not_found("Database file not found"));
    }

    let timestamp = Utc::now().format("%Y-%m-%d_%H%M").to_string();
    let zip_filename = format!("backup_{}.sqlite.zip", timestamp);
    let zip_path = app_data_dir.join(&zip_filename);

    {
        let file = File::create(&zip_path)?;
        let mut zip = ZipWriter::new(file);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        zip.start_file("shop.db", options)
            .map_err(|e| AppError::internal(e.to_string()))?;
        let mut db_file = File::open(&db_path)?;
        let mut buffer = Vec::new();
        db_file.read_to_end(&mut buffer)?;
        zip.write_all(&buffer)?;
        zip.finish()
            .map_err(|e| AppError::internal(e.to_string()))?;
    }

    let file_metadata = serde_json::json!({
        "name": zip_filename,
        "parents": ["root"]
    });

    let zip_content = fs::read(&zip_path)?;
    let metadata_part = reqwest::multipart::Part::text(file_metadata.to_string())
        .mime_str("application/json")
        .map_err(|e| AppError::internal(e.to_string()))?;
    let file_part = reqwest::multipart::Part::bytes(zip_content)
        .mime_str("application/zip")
        .map_err(|e| AppError::internal(e.to_string()))?;

    let form = reqwest::multipart::Form::new()
        .part("metadata", metadata_part)
        .part("file", file_part);

    let client = reqwest::Client::new();
    let res = client
        .post(DRIVE_UPLOAD_URI)
        .bearer_auth(&tokens.access_token)
        .multipart(form)
        .send()
        .await?;

    let status = res.status();
    let response_text = response_text_or_empty(res).await;
    let _ = fs::remove_file(&zip_path);

    if !status.is_success() {
        return Err(AppError::internal(format!(
            "Drive upload failed: {}",
            response_text
        )));
    }

    Ok("Backup uploaded successfully".into())
}

async fn response_text_or_empty(response: reqwest::Response) -> String {
    (response.text().await).unwrap_or_default()
}
