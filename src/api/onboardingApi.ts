import { invoke } from "@tauri-apps/api/core";

import { getAppSettings, updateAppSettings } from "./appApi";

import type { AppSettings } from "../types/settings";

export interface SaveShopSetupPayload {
  name: string;
  phone: string;
  address: string;
  logoFilePath: string;
}

export const saveShopSetup = async (
  payload: SaveShopSetupPayload,
): Promise<void> => {
  return invoke("save_shop_setup", {
    name: payload.name,
    phone: payload.phone,
    address: payload.address,
    logoFilePath: payload.logoFilePath,
  });
};

export const restoreDatabase = async (restorePath: string): Promise<void> => {
  return invoke("restore_database", { restorePath });
};

export const updateAppLanguage = async (language: string): Promise<void> => {
  const settings = await getAppSettings();
  await updateAppSettings({ ...settings, language });
};

export const updateOnboardingTheme = async (
  theme: AppSettings["theme"],
): Promise<void> => {
  const settings = await getAppSettings();
  await updateAppSettings({ ...settings, theme });
};

export interface DatabaseConfig {
  database_type: "sqlite" | "postgresql";
  postgres_url: string;
}

export const saveDatabaseConfig = async (
  config: DatabaseConfig,
): Promise<void> => {
  return invoke("save_database_config", {
    databaseType: config.database_type,
    postgresUrl: config.postgres_url,
  });
};

export const getDatabaseConfig = async (): Promise<DatabaseConfig> => {
  return invoke("get_database_config");
};

export const testPostgresConnection = async (url: string): Promise<boolean> => {
  return invoke("test_postgres_connection", { url });
};

export const restartApp = async (): Promise<void> => {
  return invoke("restart_app");
};
