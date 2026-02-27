use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::time::timeout;
use chrono::Utc;
use std::time::Duration;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

// For desktop apps, Google allows 127.0.0.1 on any port. We use 127.0.0.1:3456
const REDIRECT_URI: &str = "http://127.0.0.1:3456";
const AUTH_URI: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URI: &str = "https://oauth2.googleapis.com/token";
const DRIVE_UPLOAD_URI: &str = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
const USER_INFO_URI: &str = "https://www.googleapis.com/oauth2/v2/userinfo";

fn get_client_id() -> String {
    dotenvy::dotenv().ok();
    std::env::var("GOOGLE_CLIENT_ID").expect("GOOGLE_CLIENT_ID must be set in .env")
}

fn get_client_secret() -> String {
    dotenvy::dotenv().ok();
    std::env::var("GOOGLE_CLIENT_SECRET").expect("GOOGLE_CLIENT_SECRET must be set in .env")
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

fn get_tokens_path(app: &AppHandle) -> PathBuf {
    let app_data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
    app_data_dir.join("drive_auth.json")
}

pub fn read_tokens(app: &AppHandle) -> Result<DriveTokens, String> {
    let path = get_tokens_path(app);
    if !path.exists() {
        return Err("No tokens found".into());
    }
    let data = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

fn save_tokens(app: &AppHandle, tokens: &DriveTokens) -> Result<(), String> {
    let path = get_tokens_path(app);
    let data = serde_json::to_string(tokens).map_err(|e| e.to_string())?;
    fs::write(path, data).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn start_google_oauth(app: AppHandle) -> Result<DriveStatus, String> {
    // 1. Start a local server to listen for the redirect
    let listener = TcpListener::bind("127.0.0.1:3456")
        .await
        .map_err(|e| format!("Failed to bind to port 3456: {}", e))?;

    // 2. Open the user's browser to the Google OAuth page
    let client_id = get_client_id();
    let auth_url = format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent",
        AUTH_URI, client_id, REDIRECT_URI, "https://www.googleapis.com/auth/drive.file email profile"
    );

    tauri_plugin_opener::open_url(&auth_url, None::<&str>)
        .map_err(|e| format!("Failed to open browser: {}", e))?;

    // 3. Wait for the redirect with a timeout of 5 minutes
    let result = timeout(Duration::from_secs(300), listener.accept()).await;
    
    let (mut socket, _) = match result {
        Ok(Ok(cxn)) => cxn,
        Ok(Err(e)) => return Err(format!("Server error: {}", e)),
        Err(_) => return Err("OAuth timed out after 5 minutes.".into()),
    };

    let mut buf = [0; 4096];
    let n = socket.read(&mut buf).await.map_err(|e| e.to_string())?;
    let request = String::from_utf8_lossy(&buf[..n]);

    let mut code = String::new();
    if let Some(code_start) = request.find("code=") {
        let start = code_start + 5;
        if let Some(code_end) = request[start..].find('&').or_else(|| request[start..].find(' ')) {
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
        return Err("Authorization code not found in the redirect request.".into());
    }

    // 4. Exchange code for tokens
    let client = reqwest::Client::new();
    let client_id = get_client_id();
    let client_secret = get_client_secret();
    let params = [
        ("client_id", client_id.as_str()),
        ("client_secret", client_secret.as_str()),
        ("code", code.as_str()),
        ("grant_type", "authorization_code"),
        ("redirect_uri", REDIRECT_URI),
    ];

    let res = client.post(TOKEN_URI)
        .form(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Failed to exchange token: {}", err_text));
    }

    let token_res: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let access_token = token_res["access_token"].as_str().ok_or("No access token")?.to_string();
    let refresh_token = token_res["refresh_token"].as_str().unwrap_or_default().to_string();
    let expires_in = token_res["expires_in"].as_i64().unwrap_or(3600);
    
    // Fetch email
    let user_info_res = client.get(USER_INFO_URI)
        .bearer_auth(&access_token)
        .send()
        .await;
        
    let mut email = None;
    if let Ok(u_res) = user_info_res {
        if let Ok(info) = u_res.json::<serde_json::Value>().await {
            if let Some(e) = info["email"].as_str() {
                email = Some(e.to_string());
            }
        }
    }

    let drive_tokens = DriveTokens {
        access_token,
        refresh_token,
        expires_at: Utc::now().timestamp() + expires_in,
        email: email.clone(),
    };

    save_tokens(&app, &drive_tokens)?;

    Ok(DriveStatus {
        connected: true,
        email,
    })
}

#[tauri::command]
pub async fn get_drive_connection_status(app: AppHandle) -> Result<DriveStatus, String> {
    match read_tokens(&app) {
        Ok(tokens) => Ok(DriveStatus {
            connected: true,
            email: tokens.email,
        }),
        Err(_) => Ok(DriveStatus {
            connected: false,
            email: None,
        })
    }
}

#[tauri::command]
pub async fn disconnect_google_drive(app: AppHandle) -> Result<(), String> {
    let path = get_tokens_path(&app);
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

async fn refresh_token_if_needed(app: &AppHandle, tokens: &mut DriveTokens) -> Result<(), String> {
    if Utc::now().timestamp() > tokens.expires_at - 300 { // 5 mins buffer
        if tokens.refresh_token.is_empty() {
            return Err("Token expired and no refresh token available".into());
        }

        let client = reqwest::Client::new();
        let client_id = get_client_id();
        let client_secret = get_client_secret();
        let params = [
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("refresh_token", tokens.refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ];

        let res = client.post(TOKEN_URI)
            .form(&params)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !res.status().is_success() {
            let err_text = res.text().await.unwrap_or_default();
            return Err(format!("Failed to refresh token: {}", err_text));
        }

        let token_res: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        tokens.access_token = token_res["access_token"].as_str().ok_or("No access token")?.to_string();
        if let Some(rt) = token_res["refresh_token"].as_str() {
            tokens.refresh_token = rt.to_string();
        }
        let expires_in = token_res["expires_in"].as_i64().unwrap_or(3600);
        tokens.expires_at = Utc::now().timestamp() + expires_in;
        save_tokens(app, tokens)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn trigger_drive_backup(app: AppHandle) -> Result<String, String> {
    perform_drive_backup(&app).await
}

pub async fn perform_drive_backup(app: &AppHandle) -> Result<String, String> {
    let mut tokens = read_tokens(app)?;
    refresh_token_if_needed(app, &mut tokens).await?;

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_data_dir.join("shop.db");
    if !db_path.exists() {
        return Err("Database file not found".into());
    }

    let timestamp = Utc::now().format("%Y-%m-%d_%H%M").to_string();
    let zip_filename = format!("backup_{}.sqlite.zip", timestamp);
    let zip_path = app_data_dir.join(&zip_filename);

    // Compress DB
    {
        let file = File::create(&zip_path).map_err(|e| e.to_string())?;
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        zip.start_file("shop.db", options).map_err(|e| e.to_string())?;
        let mut db_file = File::open(&db_path).map_err(|e| e.to_string())?;
        let mut buffer = Vec::new();
        db_file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
        zip.write_all(&buffer).map_err(|e| e.to_string())?;
        zip.finish().map_err(|e| e.to_string())?;
    }

    // Upload to Google Drive using multipart upload
    let file_metadata = serde_json::json!({
        "name": zip_filename,
        "parents": ["root"] // Or we could search/create a specific folder
    });

    let zip_content = fs::read(&zip_path).map_err(|e| e.to_string())?;

    let metadata_part = reqwest::multipart::Part::text(file_metadata.to_string())
        .mime_str("application/json").unwrap();
    let file_part = reqwest::multipart::Part::bytes(zip_content)
        .mime_str("application/zip").unwrap();

    let form = reqwest::multipart::Form::new()
        .part("metadata", metadata_part)
        .part("file", file_part);

    let client = reqwest::Client::new();
    let res = client.post(DRIVE_UPLOAD_URI)
        .bearer_auth(&tokens.access_token)
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = res.status();
    let response_text = res.text().await.unwrap_or_default();
    
    // Cleanup local zip
    let _ = fs::remove_file(&zip_path);

    if !status.is_success() {
        return Err(format!("Drive upload failed: {}", response_text));
    }

    Ok("Backup uploaded successfully".into())
}
