import { invoke } from "@tauri-apps/api/core";

import type {
  DbStatus,
  DriveConnectionStatus,
  ResetTableSequenceResult,
} from "../types/settings";

export const getDbStatus = async (): Promise<DbStatus> => {
  return invoke<DbStatus>("get_db_status");
};

export const resetTableSequence = async (
  tableName: string,
): Promise<ResetTableSequenceResult> => {
  return invoke<ResetTableSequenceResult>("reset_table_sequence", { tableName });
};

export const getDriveConnectionStatus = async (): Promise<DriveConnectionStatus> => {
  return invoke<DriveConnectionStatus>("get_drive_connection_status");
};

export const startGoogleOauth = async (): Promise<DriveConnectionStatus> => {
  return invoke<DriveConnectionStatus>("start_google_oauth");
};

export const disconnectGoogleDrive = async (): Promise<void> => {
  return invoke("disconnect_google_drive");
};

export const triggerDriveBackup = async (): Promise<void> => {
  return invoke("trigger_drive_backup");
};

export const resetAppData = async (): Promise<void> => {
  return invoke("reset_app_data");
};

export const backupDatabase = async (destPath: string): Promise<void> => {
  return invoke("backup_database", { destPath });
};

export const restoreDatabase = async (restorePath: string): Promise<void> => {
  return invoke("restore_database", { restorePath });
};
