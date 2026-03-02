import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { Button, Input, Select } from "../../ui";
import { useSound } from "../../../context/SoundContext";
import { RESET_APP_CODE } from "../../../cheapcode";
import {
  IconCloud,
  IconDownload,
  IconRefresh,
  IconRotateCcw,
  IconTrash,
  IconTriangleAlert,
} from "../../icons";
import { useAppSettings } from "../../../context/AppSettingsContext";
import SettingsToggle from "./SettingsToggle";
import { cleanSyncData } from "../../../api/syncApi";

function SettingsDbStatus() {
  const [status, setStatus] = useState<{
    total_tables: number;
    tables: Array<{ name: string; row_count: number }>;
    size_bytes: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [resettingTable, setResettingTable] = useState<string | null>(null);
  const [cleanMsg, setCleanMsg] = useState<string | null>(null);
  const { t } = useTranslation();
  const { playSound } = useSound();

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const data = await invoke<{
        total_tables: number;
        tables: Array<{ name: string; row_count: number }>;
        size_bytes: number | null;
      }>("get_db_status");
      setStatus(data);
    } catch (err) {
      console.error("Failed to fetch DB status:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCleanSync = async () => {
    try {
      setCleaning(true);
      setCleanMsg(null);
      const count = await cleanSyncData();
      playSound("success");
      setCleanMsg(t("settings.data_mgmt.cleaned_count", { count }));
      setTimeout(() => setCleanMsg(null), 3000);
      await fetchStatus();
    } catch (err) {
      console.error("Failed to clean sync data:", err);
      playSound("error");
    } finally {
      setCleaning(false);
    }
  };

  const handleResetTableSequence = async (tableName: string) => {
    try {
      setResettingTable(tableName);
      setCleanMsg(null);
      const result = await invoke<{
        table_name: string;
        max_id: number;
        sequence_value: number;
      }>("reset_table_sequence", { tableName });
      playSound("success");
      setCleanMsg(
        t("settings.data_mgmt.sequence_reset_done", {
          table: result.table_name,
          seq: result.sequence_value,
        }),
      );
      setTimeout(() => setCleanMsg(null), 3000);
      await fetchStatus();
    } catch (err) {
      console.error("Failed to reset table sequence:", err);
      playSound("error");
    } finally {
      setResettingTable(null);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (loading) {
    return null;
  }

  const syncTables = ["sync_sessions", "sync_queue"];
  const hasSyncData = status?.tables.some(
    (t) => syncTables.includes(t.name) && t.row_count > 0,
  );

  return (
    <div className="mb-6 p-4 rounded-xl border border-glass-border bg-glass-white">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">
            {t("settings.data_mgmt.db_status")}
          </h3>
          <div className="flex gap-3 text-xs text-text-muted mt-1">
            <span>
              {status?.total_tables || 0} {t("settings.data_mgmt.tables")}
            </span>
            {status?.size_bytes && (
              <>
                <span>•</span>
                <span>{formatBytes(status.size_bytes)}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {hasSyncData && (
            <button
              onClick={handleCleanSync}
              disabled={cleaning}
              className="p-1.5 hover:bg-red-500/10 hover:text-red-500 rounded-lg text-text-secondary transition-colors disabled:opacity-50"
              title={t("settings.data_mgmt.clean_sync")}
            >
              {cleaning ? (
                <IconRefresh
                  size={14}
                  strokeWidth={2}
                  className="animate-spin"
                />
              ) : (
                <IconTrash size={14} strokeWidth={2} />
              )}
            </button>
          )}
          <button
            onClick={fetchStatus}
            className="p-1.5 hover:bg-glass-white-hover rounded-lg text-text-secondary transition-colors"
            title={t("settings.data_mgmt.refresh_status")}
          >
            <IconRefresh size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

      {cleanMsg && <p className="text-xs text-green-500 mb-3">{cleanMsg}</p>}

      <div className="space-y-2">
        {status?.tables.map((table) => (
          <div
            key={table.name}
            className="flex items-center justify-between text-xs py-2 border-b border-glass-border last:border-0 last:pb-0"
          >
            <span className="font-mono text-text-secondary">{table.name}</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleResetTableSequence(table.name)}
                disabled={resettingTable === table.name}
                className="p-1 hover:bg-glass-white-hover rounded-md text-text-secondary transition-colors disabled:opacity-50"
                title={t("settings.data_mgmt.reset_sequence")}
              >
                {resettingTable === table.name ? (
                  <IconRefresh
                    size={12}
                    strokeWidth={2}
                    className="animate-spin"
                  />
                ) : (
                  <IconRotateCcw size={12} strokeWidth={2} />
                )}
              </button>
              <span
                className={`font-medium px-2 py-0.5 rounded-md ${
                  syncTables.includes(table.name) && table.row_count > 100
                    ? "text-amber-600 bg-amber-500/10"
                    : "text-text-primary bg-glass-white-hover"
                }`}
              >
                {table.row_count} {t("settings.data_mgmt.rows")}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SettingsDataPanel() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const { playSound } = useSound();
  const { t } = useTranslation();

  const {
    auto_backup,
    setAutoBackup,
    backup_frequency,
    setBackupFrequency,
    backup_time,
    setBackupTime,
  } = useAppSettings();

  const [driveConnected, setDriveConnected] = useState(false);
  const [driveEmail, setDriveEmail] = useState<string | null>(null);
  const [checkingDrive, setCheckingDrive] = useState(true);
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [triggeringBackup, setTriggeringBackup] = useState(false);

  useEffect(() => {
    checkDriveStatus();
  }, []);

  const checkDriveStatus = async () => {
    try {
      const status = await invoke<{ connected: boolean; email: string | null }>(
        "get_drive_connection_status",
      );
      setDriveConnected(status.connected);
      setDriveEmail(status.email);
    } catch (err) {
      console.error(err);
    } finally {
      setCheckingDrive(false);
    }
  };

  const handleConnectDrive = async () => {
    try {
      setDriveConnecting(true);
      const status = await invoke<{ connected: boolean; email: string | null }>(
        "start_google_oauth",
      );
      setDriveConnected(status.connected);
      setDriveEmail(status.email);
      playSound("success");
    } catch (err) {
      console.error(err);
      setError("Failed to connect to Google Drive");
      playSound("error");
    } finally {
      setDriveConnecting(false);
    }
  };

  const handleDisconnectDrive = async () => {
    try {
      await invoke("disconnect_google_drive");
      setDriveConnected(false);
      setDriveEmail(null);
      playSound("click");
    } catch (err) {
      console.error(err);
    }
  };

  const handleTriggerCloudBackup = async () => {
    try {
      setTriggeringBackup(true);
      setError(null);
      setSuccessMsg(null);
      await invoke("trigger_drive_backup");
      playSound("success");
      setSuccessMsg("Backup successfully uploaded to Google Drive");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      console.error(err);
      setError(String(err));
      playSound("error");
    } finally {
      setTriggeringBackup(false);
    }
  };

  const handleReset = async () => {
    if (code !== RESET_APP_CODE) {
      setError(t("settings.data_mgmt.error_code"));
      playSound("error");
      return;
    }

    try {
      setResetting(true);
      await invoke("reset_app_data");
      localStorage.clear();
      playSound("success");
      window.location.reload();
    } catch (err) {
      console.error("Failed to reset data:", err);
      setError(t("settings.data_mgmt.error_reset"));
      playSound("error");
      setResetting(false);
    }
  };

  const handleBackup = async () => {
    try {
      const filePath = await save({
        filters: [
          {
            name: "SQLite Database",
            extensions: ["db", "sqlite"],
          },
        ],
        defaultPath: `sine_shin_backup_${new Date().toISOString().split("T")[0]}.db`,
      });

      if (!filePath) return;

      setBackingUp(true);
      setSuccessMsg(null);
      setError(null);

      await invoke("backup_database", { destPath: filePath });

      playSound("success");
      setSuccessMsg(t("settings.data_mgmt.backup_success"));
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      console.error("Backup failed:", err);
      setError(t("settings.data_mgmt.backup_error"));
      playSound("error");
    } finally {
      setBackingUp(false);
    }
  };

  const handleRestore = async () => {
    try {
      const confirmed = await window.confirm(
        t(
          "settings.data_mgmt.restore_confirm",
          "Are you sure? This will overwrite your current data with the backup.",
        ),
      );
      if (!confirmed) return;

      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "SQLite Database",
            extensions: ["db", "sqlite"],
          },
        ],
      });

      if (!selected) return;

      setRestoring(true);
      setError(null);
      setSuccessMsg(null);

      await invoke("restore_database", { restorePath: selected });

      playSound("success");
      window.location.reload();
    } catch (err) {
      console.error("Restore failed:", err);
      setError(
        t("settings.data_mgmt.restore_error", "Failed to restore database"),
      );
      playSound("error");
      setRestoring(false);
    }
  };

  return (
    <motion.div
      key="data"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
    >
      <h2 className="text-lg font-semibold text-text-primary mb-1">
        {t("settings.data_mgmt.title")}
      </h2>
      <p className="text-xs text-text-muted mb-5">
        {t("settings.data_mgmt.subtitle")}
      </p>

      <SettingsDbStatus />

      <div className="space-y-6">
        <div className="p-4 rounded-xl border border-glass-border bg-glass-white">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
              <IconDownload size={20} strokeWidth={2} />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-text-primary mb-1">
                {t("settings.data_mgmt.backup_title")}
              </h3>
              <p className="text-xs text-text-muted mb-4">
                {t("settings.data_mgmt.backup_desc")}
              </p>

              <div className="flex items-center gap-3">
                <Button
                  onClick={handleBackup}
                  variant="primary"
                  className="px-4 py-2 text-xs font-semibold flex items-center gap-2"
                  loading={backingUp}
                  loadingText={t("settings.data_mgmt.backing_up")}
                >
                  {t("settings.data_mgmt.backup_btn")}
                </Button>

                <Button
                  onClick={handleRestore}
                  disabled={restoring || backingUp}
                  variant="ghost"
                  className="px-4 py-2 text-xs font-semibold flex items-center gap-2"
                  loading={restoring}
                  loadingText={t(
                    "settings.data_mgmt.restoring",
                    "Restoring...",
                  )}
                >
                  {t("settings.data_mgmt.restore_btn", "Restore")}
                </Button>

                {successMsg && (
                  <span className="text-xs text-green-500">{successMsg}</span>
                )}
                {error && <span className="text-xs text-red-500">{error}</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-glass-border bg-glass-white">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
              <IconCloud size={20} strokeWidth={2} />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-text-primary mb-1">
                Cloud Backup (Google Drive)
              </h3>
              <p className="text-xs text-text-muted mb-4">
                Securely back up your database to your Google Drive account.
              </p>

              {!checkingDrive && (
                <div className="mb-6 p-4 rounded-lg bg-glass-white-hover border border-glass-border">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {driveConnected ? "Connected" : "Not Connected"}
                      </p>
                      {driveEmail && (
                        <p className="text-xs text-text-muted mt-0.5">
                          {driveEmail}
                        </p>
                      )}
                    </div>
                    {driveConnected ? (
                      <Button
                        onClick={handleDisconnectDrive}
                        variant="ghost"
                        className="text-xs py-1.5 px-3"
                      >
                        Disconnect
                      </Button>
                    ) : (
                      <Button
                        onClick={handleConnectDrive}
                        variant="primary"
                        loading={driveConnecting}
                        className="text-xs py-1.5 px-3"
                      >
                        Connect to Drive
                      </Button>
                    )}
                  </div>

                  {driveConnected && (
                    <Button
                      onClick={handleTriggerCloudBackup}
                      variant="primary"
                      className="w-full py-2 text-xs flex justify-center mt-4"
                      loading={triggeringBackup}
                      loadingText={"Backing up to Drive..."}
                    >
                      Back up to Google Drive now
                    </Button>
                  )}
                </div>
              )}

              {driveConnected && (
                <div className="space-y-4">
                  <SettingsToggle
                    label={t("settings.auto_backup")}
                    description={t("settings.auto_backup_desc")}
                    checked={auto_backup}
                    onChange={setAutoBackup}
                  />

                  {auto_backup && (
                    <div className="pl-4 border-l-2 border-glass-border space-y-4">
                      <div>
                        <label className="block text-xs text-text-muted mb-1.5">
                          Backup Frequency
                        </label>
                        <Select
                          className="w-full md:w-48"
                          options={[
                            { value: "daily", label: "Daily" },
                            { value: "weekly", label: "Weekly" },
                            { value: "monthly", label: "Monthly" },
                          ]}
                          value={backup_frequency}
                          onChange={(val: string | number) =>
                            setBackupFrequency(val.toString())
                          }
                          placeholder="Select Frequency"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-text-muted mb-1.5">
                          Backup Time
                        </label>
                        <Input
                          type="time"
                          value={backup_time}
                          onChange={(e) => setBackupTime(e.target.value)}
                          className="w-full md:w-48 input-liquid"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-lg bg-red-500/10 text-red-500">
              <IconTrash size={20} strokeWidth={2} />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-500 mb-1">
                {t("settings.data_mgmt.danger_zone")}
              </h3>
              <p className="text-xs text-text-muted mb-4">
                {t("settings.data_mgmt.reset_warning")}
              </p>
              <button
                onClick={() => {
                  setShowConfirm(true);
                  playSound("click");
                }}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors shadow-lg shadow-red-500/20"
              >
                {t("settings.data_mgmt.reset_btn")}
              </button>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConfirm(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="relative w-full max-w-sm glass-panel p-6 shadow-2xl border border-glass-border"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mb-4">
                  <IconTriangleAlert size={24} strokeWidth={2} />
                </div>

                <h3 className="text-lg font-bold text-text-primary mb-2">
                  {t("settings.data_mgmt.modal_title")}
                </h3>
                <p className="text-sm text-text-muted mb-6">
                  {t("settings.data_mgmt.modal_message_part1")}
                  <span className="font-mono font-bold text-text-primary mx-1">
                    {RESET_APP_CODE}
                  </span>
                  {t("settings.data_mgmt.modal_message_part2")}
                </p>

                <div className="w-full mb-4">
                  <Input
                    type="text"
                    value={code}
                    onChange={(event) => {
                      setCode(event.target.value);
                      setError(null);
                    }}
                    placeholder={t("settings.data_mgmt.enter_code")}
                    className="input-liquid text-center tracking-widest font-mono"
                    autoFocus
                  />
                  {error && (
                    <p className="text-xs text-red-500 mt-2">{error}</p>
                  )}
                </div>

                <div className="flex gap-3 w-full">
                  <Button
                    onClick={() => {
                      setShowConfirm(false);
                      setCode("");
                      setError(null);
                    }}
                    disabled={resetting}
                    variant="ghost"
                    className="flex-1 py-2.5 text-sm"
                  >
                    {t("settings.data_mgmt.cancel")}
                  </Button>
                  <Button
                    onClick={handleReset}
                    variant="danger"
                    className="flex-1 py-2.5 text-sm flex items-center justify-center gap-2"
                    loading={resetting}
                    loadingText={t("settings.data_mgmt.resetting")}
                  >
                    {t("settings.data_mgmt.confirm_reset")}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
