import { invoke } from "@tauri-apps/api/core";

import type { AppSettings, AppSettingsLanguage } from "../types/settings";

export const getAppSettings = async (): Promise<AppSettings> => {
  return invoke<AppSettings>("get_app_settings");
};

export const updateAppSettings = async (
  settings: AppSettings,
): Promise<void> => {
  return invoke("update_app_settings", { settings });
};

export const reloadScheduler = async (): Promise<void> => {
  return invoke("reload_scheduler");
};

export const checkIsOnboarded = async (): Promise<boolean> => {
  return invoke<boolean>("check_is_onboarded");
};

export const getAppLanguageSetting = async (): Promise<AppSettingsLanguage> => {
  const settings = await getAppSettings();
  return { language: settings.language };
};
