import { invoke } from "@tauri-apps/api/core";

import { getAppSettings, updateAppSettings } from "./appApi";

import type {
  AppSettings,
  DatabaseConnectionStatus,
  DatabaseKind,
} from "../types/settings";

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

export const configureDatabase = async (
  databaseKind: DatabaseKind,
  postgresqlUrl?: string,
): Promise<void> => {
  return invoke("configure_database", {
    input: {
      database_kind: databaseKind,
      postgresql_url: postgresqlUrl?.trim() || null,
    },
  });
};

export const testPostgresqlConnection = async (
  url: string,
): Promise<DatabaseConnectionStatus> => {
  return invoke("test_postgresql_connection", { url });
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
