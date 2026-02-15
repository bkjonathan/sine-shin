use serde::{Deserialize, Serialize};
use std::fs;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub language: String,
    pub sound_effect: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            language: "en".to_string(),
            sound_effect: true,
        }
    }
}

#[tauri::command]
pub fn get_app_settings(app: tauri::AppHandle) -> Result<AppSettings, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let settings_path = app_data_dir.join("settings.json");

    if !settings_path.exists() {
        let default_settings = AppSettings::default();
        let settings_json = serde_json::to_string_pretty(&default_settings)
            .map_err(|e| e.to_string())?;
        fs::write(&settings_path, settings_json).map_err(|e| e.to_string())?;
        return Ok(default_settings);
    }

    let settings_content = fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
    let settings: AppSettings = serde_json::from_str(&settings_content)
        .unwrap_or_else(|_| AppSettings::default());

    Ok(settings)
}

#[tauri::command]
pub fn update_app_settings(app: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let settings_path = app_data_dir.join("settings.json");

    let settings_json = serde_json::to_string_pretty(&settings)
        .map_err(|e| e.to_string())?;
    fs::write(settings_path, settings_json).map_err(|e| e.to_string())?;

    Ok(())
}
