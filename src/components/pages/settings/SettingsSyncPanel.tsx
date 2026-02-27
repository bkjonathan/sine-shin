import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Button, Input } from "../../ui";
import { useSound } from "../../../context/SoundContext";
import {
  IconCircleCheck,
  IconClipboardCopy,
  IconCloudUpload,
  IconDatabase,
  IconEye,
  IconEyeOff,
  IconPlay,
  IconRefresh,
  IconRefreshCcw,
  IconRotateCcw,
  IconShield,
  IconTriangleAlert,
  IconX,
} from "../../icons";
import SettingsToggle from "./SettingsToggle";
import {
  getSyncConfig,
  saveSyncConfig,
  testSyncConnection,
  triggerSyncNow,
  getSyncQueueStats,
  getSyncSessions,
  getSyncQueueItems,
  retryFailedItems,
  clearSyncedItems,
  setMasterPassword,
  migrateToNewDatabase,
  getMigrationSql,
  triggerFullSync,
  type SyncStats,
  type SyncSession,
  type SyncQueueItem,
} from "../../../api/syncApi";

// ─── Stat Badge ───
function StatBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    yellow: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    blue: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    green: "bg-green-500/10 text-green-500 border-green-500/20",
    red: "bg-red-500/10 text-red-500 border-red-500/20",
  };
  return (
    <div
      className={`flex flex-col items-center px-4 py-3 rounded-xl border ${colorMap[color] || colorMap.blue}`}
    >
      <span className="text-2xl font-bold">{value}</span>
      <span className="text-xs mt-0.5 opacity-80">{label}</span>
    </div>
  );
}

// ─── Password Input Field ───
function PasswordField({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className={`relative ${className}`}>
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="input-liquid w-full pr-10"
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
      >
        {show ? <IconEyeOff size={16} /> : <IconEye size={16} />}
      </button>
    </div>
  );
}

export default function SettingsSyncPanel() {
  const { t } = useTranslation();
  const { playSound } = useSound();

  // ─── Config state ───
  const [url, setUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [serviceKey, setServiceKey] = useState("");
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [fullSyncing, setFullSyncing] = useState(false);

  // ─── Stats & data ───
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [sessions, setSessions] = useState<SyncSession[]>([]);
  const [queueItems, setQueueItems] = useState<SyncQueueItem[]>([]);
  const [queueFilter, setQueueFilter] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [clearing, setClearing] = useState(false);

  // ─── Security ───
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  // ─── Migration ───
  const [migPw, setMigPw] = useState("");
  const [migUrl, setMigUrl] = useState("");
  const [migAnonKey, setMigAnonKey] = useState("");
  const [migServiceKey, setMigServiceKey] = useState("");
  const [migrating, setMigrating] = useState(false);

  // ─── Auto-migration ───
  const [needsMigration, setNeedsMigration] = useState(false);
  const [copyingSql, setCopyingSql] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);

  // ─── Feedback ───
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setError(null);
    playSound("success");
    setTimeout(() => setSuccess(null), 3000);
  };
  const showError = (msg: string) => {
    setError(msg);
    setSuccess(null);
    playSound("error");
  };

  useEffect(() => {
    loadConfig();
    loadStats();
    loadSessions();
  }, []);

  const loadConfig = async () => {
    try {
      const config = await getSyncConfig();
      if (config) {
        setUrl(config.supabase_url);
        setAnonKey(config.supabase_anon_key);
        setServiceKey(config.supabase_service_key);
        setSyncEnabled(config.sync_enabled);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setConfigLoaded(true);
    }
  };

  const loadStats = async () => {
    try {
      setStats(await getSyncQueueStats());
    } catch (err) {
      console.error(err);
    }
  };

  const loadSessions = async () => {
    try {
      setSessions(await getSyncSessions(10));
    } catch (err) {
      console.error(err);
    }
  };

  const loadQueueItems = async (status: string | null) => {
    try {
      setQueueFilter(status);
      setQueueItems(await getSyncQueueItems(status, 50));
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveConfig = async () => {
    try {
      setSaving(true);
      await saveSyncConfig(url, anonKey, serviceKey);
      showSuccess(t("settings.sync.config_saved"));
    } catch (err) {
      showError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      setNeedsMigration(false);
      setSqlCopied(false);
      const result = await testSyncConnection();
      if (result.connected && result.tables_exist) {
        showSuccess(t("settings.sync.connection_ok"));
        setNeedsMigration(false);
      } else if (result.connected && !result.tables_exist) {
        setNeedsMigration(true);
        showError(t("settings.sync.tables_missing"));
      } else {
        showError(t("settings.sync.connection_fail"));
      }
    } catch (err) {
      showError(String(err));
    } finally {
      setTesting(false);
    }
  };

  const handleCopyMigrationSql = async () => {
    try {
      setCopyingSql(true);
      const sql = await getMigrationSql();
      const { writeText } =
        await import("@tauri-apps/plugin-clipboard-manager");
      await writeText(sql);
      setSqlCopied(true);
      showSuccess(t("settings.sync.sql_copied"));
    } catch (err) {
      showError(String(err));
    } finally {
      setCopyingSql(false);
    }
  };

  const handleSyncNow = async () => {
    try {
      setSyncing(true);
      const msg = await triggerSyncNow();
      showSuccess(msg);
      loadStats();
      loadSessions();
    } catch (err) {
      showError(String(err));
    } finally {
      setSyncing(false);
    }
  };

  const handleFullSync = async () => {
    try {
      setFullSyncing(true);
      const msg = await triggerFullSync();
      showSuccess(msg);
      loadStats();
      loadSessions();
    } catch (err) {
      showError(String(err));
    } finally {
      setFullSyncing(false);
    }
  };

  const handleRetryFailed = async () => {
    try {
      setRetrying(true);
      const count = await retryFailedItems();
      showSuccess(t("settings.sync.retried_count", { count }));
      loadStats();
      loadQueueItems(queueFilter);
    } catch (err) {
      showError(String(err));
    } finally {
      setRetrying(false);
    }
  };

  const handleClearSynced = async () => {
    try {
      setClearing(true);
      const count = await clearSyncedItems(7);
      showSuccess(t("settings.sync.cleared_count", { count }));
      loadStats();
      loadQueueItems(queueFilter);
    } catch (err) {
      showError(String(err));
    } finally {
      setClearing(false);
    }
  };

  const handleSetPassword = async () => {
    try {
      setPwSaving(true);
      await setMasterPassword(currentPw, newPw);
      showSuccess(t("settings.sync.password_saved"));
      setCurrentPw("");
      setNewPw("");
    } catch (err) {
      showError(String(err));
    } finally {
      setPwSaving(false);
    }
  };

  const handleMigrate = async () => {
    try {
      setMigrating(true);
      const msg = await migrateToNewDatabase(
        migPw,
        migUrl,
        migAnonKey,
        migServiceKey,
      );
      showSuccess(msg);
      setMigPw("");
      setMigUrl("");
      setMigAnonKey("");
      setMigServiceKey("");
      loadConfig();
    } catch (err) {
      showError(String(err));
    } finally {
      setMigrating(false);
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "completed":
      case "synced":
        return "text-green-500";
      case "running":
      case "syncing":
      case "pending":
        return "text-yellow-500";
      case "failed":
        return "text-red-500";
      default:
        return "text-text-muted";
    }
  };

  if (!configLoaded) return null;

  return (
    <motion.div
      key="sync"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
    >
      <h2 className="text-lg font-semibold text-text-primary mb-1">
        {t("settings.sync.title")}
      </h2>
      <p className="text-xs text-text-muted mb-5">
        {t("settings.sync.subtitle")}
      </p>

      {/* Feedback bar */}
      {(error || success) && (
        <div
          className={`mb-4 px-4 py-2.5 rounded-lg text-xs font-medium flex items-center gap-2 ${
            error
              ? "bg-red-500/10 text-red-500 border border-red-500/20"
              : "bg-green-500/10 text-green-500 border border-green-500/20"
          }`}
        >
          {error ? (
            <IconTriangleAlert size={14} />
          ) : (
            <IconCircleCheck size={14} />
          )}
          {error || success}
        </div>
      )}

      <div className="space-y-6">
        {/* ── 1. Supabase Config ── */}
        <div className="p-4 rounded-xl border border-glass-border bg-glass-white">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
              <IconDatabase size={20} strokeWidth={2} />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-text-primary mb-1">
                {t("settings.sync.config_title")}
              </h3>
              <p className="text-xs text-text-muted mb-4">
                {t("settings.sync.config_desc")}
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">
                    {t("settings.sync.supabase_url")}
                  </label>
                  <Input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://xxx.supabase.co"
                    className="input-liquid w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">
                    {t("settings.sync.anon_key")}
                  </label>
                  <PasswordField
                    value={anonKey}
                    onChange={(e) => setAnonKey(e.target.value)}
                    placeholder={t("settings.sync.anon_key_placeholder")}
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">
                    {t("settings.sync.service_key")}
                  </label>
                  <PasswordField
                    value={serviceKey}
                    onChange={(e) => setServiceKey(e.target.value)}
                    placeholder={t("settings.sync.service_key_placeholder")}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 mt-4">
                <Button
                  onClick={handleSaveConfig}
                  variant="primary"
                  className="px-4 py-2 text-xs font-semibold"
                  loading={saving}
                  loadingText={t("settings.sync.saving")}
                >
                  {t("settings.sync.save_config")}
                </Button>
                <Button
                  onClick={handleTestConnection}
                  variant="ghost"
                  className="px-4 py-2 text-xs font-semibold flex items-center gap-1.5"
                  loading={testing}
                  loadingText={t("settings.sync.testing")}
                  disabled={!url}
                >
                  <IconRefreshCcw size={13} />
                  {t("settings.sync.test_connection")}
                </Button>
              </div>

              {/* Migration needed alert */}
              {needsMigration && (
                <div className="mt-4 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                  <div className="flex items-start gap-2">
                    <IconTriangleAlert
                      size={16}
                      className="text-amber-500 mt-0.5 shrink-0"
                    />
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1">
                        {t("settings.sync.migration_needed_title")}
                      </p>
                      <p className="text-xs text-text-muted mb-3">
                        {t("settings.sync.migration_needed_desc")}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={handleCopyMigrationSql}
                          variant="primary"
                          className="px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5"
                          loading={copyingSql}
                          loadingText={t("settings.sync.copying")}
                        >
                          <IconClipboardCopy size={13} />
                          {sqlCopied
                            ? t("settings.sync.sql_copied_btn")
                            : t("settings.sync.copy_migration_sql")}
                        </Button>
                        {sqlCopied && (
                          <span className="text-xs text-green-500 flex items-center gap-1">
                            <IconCircleCheck size={12} />
                            {t("settings.sync.paste_instruction")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── 2. Sync Controls ── */}
        <div className="p-4 rounded-xl border border-glass-border bg-glass-white">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-lg bg-green-500/10 text-green-500">
              <IconCloudUpload size={20} strokeWidth={2} />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-text-primary mb-1">
                {t("settings.sync.controls_title")}
              </h3>
              <p className="text-xs text-text-muted mb-4">
                {t("settings.sync.controls_desc")}
              </p>

              <SettingsToggle
                label={t("settings.sync.enable_sync")}
                description={t("settings.sync.enable_sync_desc")}
                checked={syncEnabled}
                onChange={(v) => setSyncEnabled(v)}
              />

              <Button
                onClick={handleSyncNow}
                variant="primary"
                className="mt-4 px-4 py-2 text-xs font-semibold flex items-center gap-1.5"
                loading={syncing}
                loadingText={t("settings.sync.syncing")}
                disabled={!url}
              >
                <IconPlay size={13} />
                {t("settings.sync.sync_now")}
              </Button>
              <Button
                onClick={handleFullSync}
                variant="ghost"
                className="mt-2 px-4 py-2 text-xs font-semibold flex items-center gap-1.5"
                loading={fullSyncing}
                loadingText={t("settings.sync.full_syncing")}
                disabled={!url}
              >
                <IconCloudUpload size={13} />
                {t("settings.sync.full_sync")}
              </Button>
            </div>
          </div>
        </div>

        {/* ── 3. Queue Stats ── */}
        {stats && (
          <div className="p-4 rounded-xl border border-glass-border bg-glass-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-text-primary">
                {t("settings.sync.queue_stats")}
              </h3>
              <button
                onClick={loadStats}
                className="p-1.5 hover:bg-glass-white-hover rounded-lg text-text-secondary transition-colors"
              >
                <IconRefresh size={14} strokeWidth={2} />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <StatBadge
                label={t("settings.sync.stat_pending")}
                value={stats.pending}
                color="yellow"
              />
              <StatBadge
                label={t("settings.sync.stat_syncing")}
                value={stats.syncing}
                color="blue"
              />
              <StatBadge
                label={t("settings.sync.stat_synced")}
                value={stats.synced}
                color="green"
              />
              <StatBadge
                label={t("settings.sync.stat_failed")}
                value={stats.failed}
                color="red"
              />
            </div>

            <div className="flex items-center gap-3 mt-4">
              <Button
                onClick={handleRetryFailed}
                variant="ghost"
                className="px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5"
                loading={retrying}
                loadingText={t("settings.sync.retrying")}
                disabled={!stats.failed}
              >
                <IconRotateCcw size={13} />
                {t("settings.sync.retry_failed")}
              </Button>
              <Button
                onClick={handleClearSynced}
                variant="ghost"
                className="px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5"
                loading={clearing}
                loadingText={t("settings.sync.clearing")}
                disabled={!stats.synced}
              >
                <IconX size={13} />
                {t("settings.sync.clear_synced")}
              </Button>
            </div>
          </div>
        )}

        {/* ── 4. Recent Sessions ── */}
        {sessions.length > 0 && (
          <div className="p-4 rounded-xl border border-glass-border bg-glass-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-text-primary">
                {t("settings.sync.recent_sessions")}
              </h3>
              <button
                onClick={loadSessions}
                className="p-1.5 hover:bg-glass-white-hover rounded-lg text-text-secondary transition-colors"
              >
                <IconRefresh size={14} strokeWidth={2} />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-glass-border text-text-muted">
                    <th className="text-left py-2 pr-3 font-medium">
                      {t("settings.sync.session_started")}
                    </th>
                    <th className="text-left py-2 pr-3 font-medium">
                      {t("settings.sync.session_finished")}
                    </th>
                    <th className="text-center py-2 pr-3 font-medium">
                      {t("settings.sync.session_queued")}
                    </th>
                    <th className="text-center py-2 pr-3 font-medium">
                      {t("settings.sync.session_synced")}
                    </th>
                    <th className="text-center py-2 pr-3 font-medium">
                      {t("settings.sync.session_failed")}
                    </th>
                    <th className="text-left py-2 font-medium">
                      {t("settings.sync.session_status")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-glass-border last:border-0"
                    >
                      <td className="py-2 pr-3 text-text-secondary">
                        {s.started_at
                          ? new Date(s.started_at).toLocaleString()
                          : "—"}
                      </td>
                      <td className="py-2 pr-3 text-text-secondary">
                        {s.finished_at
                          ? new Date(s.finished_at).toLocaleString()
                          : "—"}
                      </td>
                      <td className="py-2 pr-3 text-center text-text-primary font-medium">
                        {s.total_queued}
                      </td>
                      <td className="py-2 pr-3 text-center text-green-500 font-medium">
                        {s.total_synced}
                      </td>
                      <td className="py-2 pr-3 text-center text-red-500 font-medium">
                        {s.total_failed}
                      </td>
                      <td className="py-2">
                        <span
                          className={`font-semibold capitalize ${statusColor(s.status)}`}
                        >
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── 5. Queue Items Viewer ── */}
        <div className="p-4 rounded-xl border border-glass-border bg-glass-white">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-primary">
              {t("settings.sync.queue_items")}
            </h3>
          </div>

          <div className="flex items-center gap-2 mb-3">
            {[null, "pending", "syncing", "synced", "failed"].map(
              (filterVal) => (
                <button
                  key={filterVal ?? "all"}
                  onClick={() => loadQueueItems(filterVal)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    queueFilter === filterVal
                      ? "bg-accent-blue/10 text-accent-blue border border-accent-blue/30"
                      : "bg-glass-white-hover text-text-secondary border border-transparent hover:border-glass-border"
                  }`}
                >
                  {filterVal
                    ? t(`settings.sync.stat_${filterVal}`)
                    : t("common.all")}
                </button>
              ),
            )}
          </div>

          {queueItems.length > 0 ? (
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-glass-white">
                  <tr className="border-b border-glass-border text-text-muted">
                    <th className="text-left py-2 pr-2 font-medium">ID</th>
                    <th className="text-left py-2 pr-2 font-medium">
                      {t("settings.sync.queue_table")}
                    </th>
                    <th className="text-left py-2 pr-2 font-medium">
                      {t("settings.sync.queue_op")}
                    </th>
                    <th className="text-center py-2 pr-2 font-medium">
                      {t("settings.sync.queue_record_id")}
                    </th>
                    <th className="text-left py-2 pr-2 font-medium">
                      {t("settings.sync.session_status")}
                    </th>
                    <th className="text-center py-2 pr-2 font-medium">
                      {t("settings.sync.queue_retries")}
                    </th>
                    <th className="text-left py-2 font-medium">
                      {t("settings.sync.queue_created")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {queueItems.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-glass-border last:border-0"
                    >
                      <td className="py-2 pr-2 font-mono text-text-muted">
                        {item.id}
                      </td>
                      <td className="py-2 pr-2 text-text-secondary">
                        {item.table_name}
                      </td>
                      <td className="py-2 pr-2">
                        <span className="px-1.5 py-0.5 rounded bg-glass-white-hover text-text-primary font-medium">
                          {item.operation}
                        </span>
                      </td>
                      <td className="py-2 pr-2 text-center text-text-secondary">
                        {item.record_id}
                      </td>
                      <td className="py-2 pr-2">
                        <span
                          className={`font-semibold capitalize ${statusColor(item.status)}`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="py-2 pr-2 text-center text-text-muted">
                        {item.retry_count}
                      </td>
                      <td className="py-2 text-text-muted">
                        {item.created_at
                          ? new Date(item.created_at).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-text-muted py-4 text-center">
              {t("settings.sync.no_queue_items")}
            </p>
          )}
        </div>

        {/* ── 6. Security ── */}
        <div className="p-4 rounded-xl border border-glass-border bg-glass-white">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
              <IconShield size={20} strokeWidth={2} />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-text-primary mb-1">
                {t("settings.sync.security_title")}
              </h3>
              <p className="text-xs text-text-muted mb-4">
                {t("settings.sync.security_desc")}
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">
                    {t("settings.sync.current_password")}
                  </label>
                  <PasswordField
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    placeholder={t(
                      "settings.sync.current_password_placeholder",
                    )}
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">
                    {t("settings.sync.new_password")}
                  </label>
                  <PasswordField
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder={t("settings.sync.new_password_placeholder")}
                  />
                </div>
              </div>

              <Button
                onClick={handleSetPassword}
                variant="primary"
                className="mt-4 px-4 py-2 text-xs font-semibold"
                loading={pwSaving}
                loadingText={t("settings.sync.saving")}
                disabled={!currentPw || !newPw}
              >
                {t("settings.sync.set_password")}
              </Button>
            </div>
          </div>
        </div>

        {/* ── 7. Database Migration ── */}
        <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
              <IconDatabase size={20} strokeWidth={2} />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-400 mb-1">
                {t("settings.sync.migrate_title")}
              </h3>
              <p className="text-xs text-text-muted mb-4">
                {t("settings.sync.migrate_desc")}
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">
                    {t("settings.sync.current_password")}
                  </label>
                  <PasswordField
                    value={migPw}
                    onChange={(e) => setMigPw(e.target.value)}
                    placeholder={t(
                      "settings.sync.current_password_placeholder",
                    )}
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">
                    {t("settings.sync.new_supabase_url")}
                  </label>
                  <Input
                    type="text"
                    value={migUrl}
                    onChange={(e) => setMigUrl(e.target.value)}
                    placeholder="https://new-project.supabase.co"
                    className="input-liquid w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">
                    {t("settings.sync.anon_key")}
                  </label>
                  <PasswordField
                    value={migAnonKey}
                    onChange={(e) => setMigAnonKey(e.target.value)}
                    placeholder={t("settings.sync.anon_key_placeholder")}
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">
                    {t("settings.sync.service_key")}
                  </label>
                  <PasswordField
                    value={migServiceKey}
                    onChange={(e) => setMigServiceKey(e.target.value)}
                    placeholder={t("settings.sync.service_key_placeholder")}
                  />
                </div>
              </div>

              <Button
                onClick={handleMigrate}
                variant="primary"
                className="mt-4 px-4 py-2 text-xs font-semibold flex items-center gap-1.5"
                loading={migrating}
                loadingText={t("settings.sync.migrating")}
                disabled={!migPw || !migUrl || !migAnonKey || !migServiceKey}
              >
                <IconCloudUpload size={13} />
                {t("settings.sync.migrate_btn")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
