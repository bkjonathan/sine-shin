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
    #[serde(default)]
    pub invoice_printer_name: String,
    #[serde(default = "default_silent_invoice_print")]
    pub silent_invoice_print: bool,
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

fn default_silent_invoice_print() -> bool {
    true
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
            invoice_printer_name: String::new(),
            silent_invoice_print: true,
        }
    }
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
