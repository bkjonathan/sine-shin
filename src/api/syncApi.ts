import { invoke } from "@tauri-apps/api/core";

// ─── Types ───

export interface SyncConfig {
  id?: number;
  supabase_url: string;
  supabase_anon_key: string;
  supabase_service_key: string;
  sync_enabled: boolean;
  sync_interval: number;
}

export interface SyncStats {
  pending: number;
  syncing: number;
  synced: number;
  failed: number;
}

export interface SyncSession {
  id: number;
  started_at: string | null;
  finished_at: string | null;
  total_queued: number;
  total_synced: number;
  total_failed: number;
  status: string;
}

export interface SyncQueueItem {
  id: number;
  table_name: string;
  operation: string;
  record_id: number;
  payload: string;
  status: string;
  retry_count: number;
  error_message: string | null;
  created_at: string | null;
  synced_at: string | null;
}

// ─── API Functions ───

export async function saveSyncConfig(
  url: string,
  anonKey: string,
  serviceKey: string,
) {
  return invoke("save_sync_config", {
    url,
    anonKey,
    serviceKey,
  });
}

export async function getSyncConfig(): Promise<SyncConfig | null> {
  return invoke("get_sync_config");
}

export async function updateSyncInterval(interval: number): Promise<void> {
  return invoke("update_sync_interval", { interval });
}

export interface TestConnectionResult {
  connected: boolean;
  tables_exist: boolean;
  message: string;
}

export async function testSyncConnection(): Promise<TestConnectionResult> {
  return invoke("test_sync_connection");
}

export async function getMigrationSql(): Promise<string> {
  return invoke("get_migration_sql");
}

export async function triggerFullSync(): Promise<string> {
  return invoke("trigger_full_sync");
}

export async function truncateAndSync(): Promise<string> {
  return invoke("truncate_and_sync");
}

export async function triggerSyncNow(): Promise<string> {
  return invoke("trigger_sync_now");
}

export async function getSyncQueueStats(): Promise<SyncStats> {
  return invoke("get_sync_queue_stats");
}

export async function getSyncSessions(
  limit: number = 10,
): Promise<SyncSession[]> {
  return invoke("get_sync_sessions", { limit });
}

export async function getSyncQueueItems(
  status: string | null,
  limit: number = 50,
): Promise<SyncQueueItem[]> {
  return invoke("get_sync_queue_items", { status, limit });
}

export async function retryFailedItems(): Promise<number> {
  return invoke("retry_failed_items");
}

export async function clearSyncedItems(olderThanDays: number): Promise<number> {
  return invoke("clear_synced_items", { olderThanDays });
}

export async function cleanSyncData(): Promise<number> {
  return invoke("clean_sync_data");
}

export async function setMasterPassword(
  currentPassword: string,
  newMaster: string,
) {
  return invoke("set_master_password", { currentPassword, newMaster });
}

export async function verifyMasterPassword(input: string): Promise<boolean> {
  return invoke("verify_master_password", { input });
}

export async function migrateToNewDatabase(
  masterPassword: string,
  newSupabaseUrl: string,
  newAnonKey: string,
  newServiceKey: string,
): Promise<string> {
  return invoke("migrate_to_new_database", {
    masterPassword,
    newSupabaseUrl,
    newAnonKey,
    newServiceKey,
  });
}

// ─── Remote Fetch and Apply ───

export interface RemoteChange {
  table_name: string;
  record_id: number;
  change_type: "new" | "modified";
  payload: Record<string, any>;
}

export async function fetchRemoteChanges(): Promise<RemoteChange[]> {
  return invoke("fetch_remote_changes");
}

export async function applyRemoteChanges(
  changes: RemoteChange[],
): Promise<string> {
  return invoke("apply_remote_changes", { changes });
}
