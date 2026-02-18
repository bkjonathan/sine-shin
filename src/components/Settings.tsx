import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { motion, AnimatePresence } from "framer-motion";
import { Select } from "./ui/Select";
import { useTheme } from "../context/ThemeContext";
import { useSound } from "../context/SoundContext";
import { useAppSettings } from "../context/AppSettingsContext";
import { RESET_APP_CODE } from "../cheapcode";
import {
  IconDownload,
  IconHardDrive,
  IconImage,
  IconRefresh,
  IconSettings,
  IconSun,
  IconTrash,
  IconTriangleAlert,
  IconUserRound,
} from "./icons";

// ── Settings Categories ──
// Categories moved inside component for translation

// ── Toggle Component ──
function ToggleSetting({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-glass-border last:border-b-0">
      <div className="flex-1 mr-4">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        <p className="text-xs text-text-muted mt-0.5">{description}</p>
      </div>
      <input
        type="checkbox"
        className="toggle-ios"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
}

// ── Animation Variants ──
const fadeVariants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 },
  },
};

// ── Account Settings Component ──
// Helper to get MIME type from file extension
function getMimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
  };
  return mimeMap[ext] || "image/png";
}

// Helper to load a file path as a blob URL for previewing a newly-picked file
async function loadPickedFilePreview(filePath: string): Promise<string> {
  const data = await readFile(filePath);
  const mimeType = getMimeType(filePath);
  const blob = new Blob([data], { type: mimeType });
  return URL.createObjectURL(blob);
}

function AccountSettings() {
  const [shopName, setShopName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [customerIdPrefix, setCustomerIdPrefix] = useState("SSC-");

  const { playSound } = useSound();

  // Logo state
  const [newLogoPath, setNewLogoPath] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const settings = await invoke<{
        shop_name: string;
        phone: string | null;
        address: string | null;
        logo_path: string | null;
        customer_id_prefix: string | null;
      }>("get_shop_settings");
      setShopName(settings.shop_name);
      setPhone(settings.phone || "");
      setAddress(settings.address || "");
      setCustomerIdPrefix(settings.customer_id_prefix || "SSC-");

      if (settings.logo_path) {
        // Use convertFileSrc (Tauri's asset protocol) for reliable display
        const assetUrl = convertFileSrc(settings.logo_path);
        setPreviewSrc(assetUrl);
      } else {
        setPreviewSrc(null);
      }
    } catch (err) {
      console.error("Failed to fetch settings:", err);
      setMessage({ type: "error", text: t("settings.error_load") });
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handlePickLogo = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Images",
            extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"],
          },
        ],
      });
      if (selected) {
        setNewLogoPath(selected);
        try {
          // Use readFile + Blob URL for previewing the picked file before save
          const blobUrl = await loadPickedFilePreview(selected);
          // Revoke old blob URL if one exists
          if (previewSrc && previewSrc.startsWith("blob:")) {
            URL.revokeObjectURL(previewSrc);
          }
          setPreviewSrc(blobUrl);
        } catch (logoErr) {
          console.error("Failed to preview selected logo:", logoErr);
          // Fallback: use convertFileSrc for the picked file
          setPreviewSrc(convertFileSrc(selected));
        }
      }
    } catch (err) {
      console.error("Failed to pick logo:", err);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage(null);
      await invoke("update_shop_settings", {
        shopName,
        phone,
        address,
        logoPath: newLogoPath,
        customerIdPrefix,
      });
      setMessage({
        type: "success",
        text: t("settings.account.success_message"),
      });
      playSound("success");

      // After save, clear the newLogoPath
      setNewLogoPath(null);

      // Revoke old blob URL to prevent memory leaks
      if (previewSrc && previewSrc.startsWith("blob:")) {
        URL.revokeObjectURL(previewSrc);
      }

      // Re-fetch to get the internal logo path stored by the backend
      // This will use convertFileSrc for a reliable display
      await fetchSettings(false);

      // Clear success message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error("Failed to save settings:", err);
      setMessage({ type: "error", text: t("settings.account.error_message") });
      playSound("error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="w-6 h-6 border-2 border-glass-border border-t-accent-blue rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div
      key="account"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-text-primary">
          {t("settings.account.title")}
        </h2>
        {message && (
          <motion.span
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className={`text-xs px-2 py-1 rounded-md ${
              message.type === "success"
                ? "bg-green-500/10 text-green-500 border border-green-500/20"
                : "bg-red-500/10 text-red-500 border border-red-500/20"
            }`}
          >
            {message.text}
          </motion.span>
        )}
      </div>
      <p className="text-xs text-text-muted mb-5">
        {t("settings.account.subtitle")}
      </p>

      <div className="space-y-5">
        {/* Logo Section */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-text-secondary">
            {t("settings.account.shop_logo")}
          </label>
          {/* Debug Info */}
          <div className="text-[10px] p-2 bg-black/20 rounded font-mono text-text-muted break-all hidden">
            Raw: {newLogoPath || "none"} <br />
            Preview: {previewSrc || "none"}
          </div>

          <div className="flex items-center gap-4">
            <div className="relative group w-20 h-20 rounded-full bg-glass-white border border-glass-border overflow-hidden flex items-center justify-center shrink-0">
              {previewSrc ? (
                <img
                  src={previewSrc}
                  alt="Shop Logo"
                  className="w-full h-full object-cover"
                />
              ) : (
                <IconImage size={24} strokeWidth={1.5} className="text-text-muted" />
              )}
            </div>
            <button
              onClick={handlePickLogo}
              className="btn-liquid btn-liquid-ghost text-xs px-3 py-1.5"
            >
              {t("settings.account.change_logo")}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            {t("settings.account.shop_name")}
          </label>
          <input
            type="text"
            className="input-liquid"
            placeholder={t("settings.account.shop_name_placeholder")}
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            {t("settings.account.phone_number")}
          </label>
          <input
            type="tel"
            className="input-liquid"
            placeholder={t("settings.account.phone_placeholder")}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            {t("settings.account.address")}
          </label>
          <textarea
            className="input-liquid min-h-[80px] py-2"
            placeholder={t("settings.account.address_placeholder")}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            {t("settings.account.customer_id_prefix")}
          </label>
          <input
            type="text"
            className="input-liquid font-mono uppercase"
            placeholder="SSC-"
            value={customerIdPrefix}
            onChange={(e) => setCustomerIdPrefix(e.target.value.toUpperCase())}
          />
          <p className="text-xs text-text-muted mt-1">
            {t("settings.account.customer_id_desc")}
          </p>
        </div>
        <div className="pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-liquid btn-liquid-primary text-sm px-6 py-2.5 disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && (
              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {saving
              ? t("settings.account.saving")
              : t("settings.account.save_changes")}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── DbStatus Component ──
function DbStatus() {
  const [status, setStatus] = useState<{
    total_tables: number;
    tables: Array<{ name: string; row_count: number }>;
    size_bytes: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();

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

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (loading) return null;

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
        <button
          onClick={fetchStatus}
          className="p-1.5 hover:bg-glass-white-hover rounded-lg text-text-secondary transition-colors"
          title={t("settings.data_mgmt.refresh_status")}
        >
          <IconRefresh size={14} strokeWidth={2} />
        </button>
      </div>

      <div className="space-y-2">
        {status?.tables.map((table) => (
          <div
            key={table.name}
            className="flex items-center justify-between text-xs py-2 border-b border-glass-border last:border-0 last:pb-0"
          >
            <span className="font-mono text-text-secondary">{table.name}</span>
            <span className="font-medium text-text-primary bg-glass-white-hover px-2 py-0.5 rounded-md">
              {table.row_count} {t("settings.data_mgmt.rows")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Data Settings Component ──
function DataSettings() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const { playSound } = useSound();
  const { t } = useTranslation();

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
      // Force reload to trigger onboarding check
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

      <DbStatus />

      <div className="space-y-6">
        {/* Backup Section */}
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
                <button
                  onClick={handleBackup}
                  disabled={backingUp}
                  className="px-4 py-2 btn-liquid btn-liquid-primary text-xs font-semibold flex items-center gap-2"
                >
                  {backingUp ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {t("settings.data_mgmt.backing_up")}
                    </>
                  ) : (
                    t("settings.data_mgmt.backup_btn")
                  )}
                </button>

                <button
                  onClick={handleRestore}
                  disabled={restoring || backingUp}
                  className="px-4 py-2 btn-liquid btn-liquid-ghost text-xs font-semibold flex items-center gap-2"
                >
                  {restoring ? (
                    <>
                      <div className="w-3 h-3 border-2 border-text-secondary/30 border-t-text-secondary rounded-full animate-spin" />
                      {t("settings.data_mgmt.restoring", "Restoring...")}
                    </>
                  ) : (
                    t("settings.data_mgmt.restore_btn", "Restore")
                  )}
                </button>

                {successMsg && (
                  <span className="text-xs text-green-500">{successMsg}</span>
                )}
                {error && <span className="text-xs text-red-500">{error}</span>}
              </div>
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

      {/* Confirmation Modal */}
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
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
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
                  <button
                    onClick={() => {
                      setShowConfirm(false);
                      setCode("");
                      setError(null);
                    }}
                    disabled={resetting}
                    className="flex-1 btn-liquid btn-liquid-ghost py-2.5 text-sm"
                  >
                    {t("settings.data_mgmt.cancel")}
                  </button>
                  <button
                    onClick={handleReset}
                    disabled={resetting}
                    className="flex-1 btn-liquid bg-red-500 hover:bg-red-600 text-white py-2.5 text-sm flex items-center justify-center gap-2"
                  >
                    {resetting && (
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                    {resetting
                      ? t("settings.data_mgmt.resetting")
                      : t("settings.data_mgmt.confirm_reset")}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function Settings() {
  const { t, i18n } = useTranslation();
  const [activeCategory, setActiveCategory] = useState("general");

  // Global Theme Context
  const {
    theme,
    toggleTheme,
    accentColor,
    setAccentColor,
    animations,
    setAnimations,
    compactMode,
    setCompactMode,
  } = useTheme();

  // Local state for non-theme settings
  const [notifications, setNotifications] = useState(true);
  const [orderAlerts, setOrderAlerts] = useState(true);
  const [autoBackup, setAutoBackup] = useState(true);

  // Sound Context
  const { soundEnabled, toggleSound, playSound } = useSound();

  // App Settings
  const {
    language,
    setLanguage,
    currency,
    setCurrency,
    currency_symbol,
    setCurrencySymbol,
    exchange_currency,
    setExchangeCurrency,
    exchange_currency_symbol,
    setExchangeCurrencySymbol,
    invoice_printer_name,
    setInvoicePrinterName,
    silent_invoice_print,
    setSilentInvoicePrint,
  } = useAppSettings();

  // ── Settings Categories ──
  const categories = [
    {
      id: "general",
      label: t("settings.general"),
      icon: (
        <IconSettings size={18} strokeWidth={1.8} />
      ),
    },
    {
      id: "account",
      label: t("settings.account.title"),
      icon: (
        <IconUserRound size={18} strokeWidth={1.8} />
      ),
    },
    {
      id: "appearance",
      label: t("settings.appearance"),
      icon: (
        <IconSun size={18} strokeWidth={1.8} />
      ),
    },
    {
      id: "data",
      label: t("settings.data"),
      icon: (
        <IconHardDrive size={18} strokeWidth={1.8} />
      ),
    },
  ];

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: { opacity: 0 },
        show: {
          opacity: 1,
          transition: { staggerChildren: 0.06 },
        },
      }}
      className="max-w-4xl mx-auto"
    >
      <motion.div variants={fadeVariants} className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">
          {t("settings.title")}
        </h1>
        <p className="text-sm text-text-muted mt-1">
          {t("settings.manage_preferences")}
        </p>
      </motion.div>

      <motion.div
        variants={fadeVariants}
        className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4"
      >
        {/* ── Categories (Left) ── */}
        <div className="glass-panel p-3 h-fit">
          <nav className="space-y-1">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  setActiveCategory(cat.id);
                  playSound("click");
                }}
                className={`
                  w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium
                  transition-all duration-200 text-left
                  ${
                    activeCategory === cat.id
                      ? "bg-glass-white-hover text-text-primary shadow-[0_0_12px_rgba(0,0,0,0.1)] border border-glass-border"
                      : "text-text-secondary hover:bg-glass-white hover:text-text-primary border border-transparent"
                  }
                `}
              >
                {cat.icon}
                {cat.label}
              </button>
            ))}
          </nav>
        </div>

        {/* ── Options Panel (Right) ── */}
        <div className="glass-panel p-6">
          {activeCategory === "general" && (
            <motion.div
              key="general"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
            >
              <h2 className="text-lg font-semibold text-text-primary mb-1">
                {t("settings.general")}
              </h2>
              <p className="text-xs text-text-muted mb-5">
                {t("settings.general_desc")}
              </p>

              {/* Language Switcher */}
              <div className="flex items-center justify-between py-4 border-b border-glass-border">
                <div className="flex-1 mr-4">
                  <p className="text-sm font-medium text-text-primary">
                    {t("settings.language")}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {t("settings.language_label")}
                  </p>
                </div>
                <div className="w-40">
                  <Select
                    className="w-full"
                    options={[
                      { value: "en", label: "English" },
                      { value: "mm", label: "မြန်မာ" },
                    ]}
                    value={language}
                    onChange={(val) => {
                      const nextLang = val.toString();
                      i18n.changeLanguage(nextLang);
                      setLanguage(nextLang);
                    }}
                    placeholder="Select Language"
                  />
                </div>
              </div>

              {/* Currency Settings */}
              <div className="py-4 border-b border-glass-border">
                <p className="text-sm font-medium text-text-primary mb-3">
                  {t("settings.currency_settings")}
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-text-muted mb-1.5">
                      {t("settings.currency_code")}
                    </label>
                    <input
                      type="text"
                      className="input-liquid w-full uppercase"
                      placeholder={t("settings.currency_code_placeholder")}
                      value={currency}
                      onChange={(e) =>
                        setCurrency(e.target.value.toUpperCase())
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-muted mb-1.5">
                      {t("settings.currency_symbol")}
                    </label>
                    <input
                      type="text"
                      className="input-liquid w-full"
                      placeholder={t("settings.currency_symbol_placeholder")}
                      value={currency_symbol}
                      onChange={(e) => setCurrencySymbol(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-muted mb-1.5">
                      {t("settings.exchange_currency_code")}
                    </label>
                    <input
                      type="text"
                      className="input-liquid w-full uppercase"
                      placeholder={t(
                        "settings.exchange_currency_code_placeholder",
                      )}
                      value={exchange_currency}
                      onChange={(e) =>
                        setExchangeCurrency(e.target.value.toUpperCase())
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-muted mb-1.5">
                      {t("settings.exchange_currency_symbol")}
                    </label>
                    <input
                      type="text"
                      className="input-liquid w-full"
                      placeholder={t(
                        "settings.exchange_currency_symbol_placeholder",
                      )}
                      value={exchange_currency_symbol}
                      onChange={(e) =>
                        setExchangeCurrencySymbol(e.target.value)
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="py-4 border-b border-glass-border">
                <p className="text-sm font-medium text-text-primary mb-3">
                  {t("settings.invoice_print.title")}
                </p>
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">
                    {t("settings.invoice_print.printer_name")}
                  </label>
                  <input
                    type="text"
                    className="input-liquid w-full"
                    placeholder={t(
                      "settings.invoice_print.printer_name_placeholder",
                    )}
                    value={invoice_printer_name}
                    onChange={(e) => setInvoicePrinterName(e.target.value)}
                  />
                  <p className="text-xs text-text-muted mt-1.5">
                    {t("settings.invoice_print.printer_help")}
                  </p>
                </div>
              </div>

              <ToggleSetting
                label={t("settings.push_notifications")}
                description={t("settings.push_notifications_desc")}
                checked={notifications}
                onChange={setNotifications}
              />
              <ToggleSetting
                label={t("settings.order_alerts")}
                description={t("settings.order_alerts_desc")}
                checked={orderAlerts}
                onChange={setOrderAlerts}
              />
              <ToggleSetting
                label={t("settings.sound_effects")}
                description={t("settings.sound_effects_desc")}
                checked={soundEnabled}
                onChange={() => {
                  toggleSound();
                  if (!soundEnabled) playSound("switch"); // Play sound when turning on
                }}
              />
              <ToggleSetting
                label={t("settings.auto_backup")}
                description={t("settings.auto_backup_desc")}
                checked={autoBackup}
                onChange={setAutoBackup}
              />
              <ToggleSetting
                label={t("settings.invoice_print.silent_label")}
                description={t("settings.invoice_print.silent_desc")}
                checked={silent_invoice_print}
                onChange={setSilentInvoicePrint}
              />
            </motion.div>
          )}

          {activeCategory === "account" && <AccountSettings />}

          {activeCategory === "appearance" && (
            <motion.div
              key="appearance"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
            >
              <h2 className="text-lg font-semibold text-text-primary mb-1">
                {t("settings.appearance")}
              </h2>
              <p className="text-xs text-text-muted mb-5">
                {t("settings.appearance_desc")}
              </p>

              <ToggleSetting
                label={t("settings.dark_mode")}
                description={t("settings.dark_mode_desc")}
                checked={theme === "dark"}
                onChange={() => {
                  toggleTheme();
                  playSound("switch");
                }}
              />
              <ToggleSetting
                label={t("settings.smooth_animations")}
                description={t("settings.smooth_animations_desc")}
                checked={animations}
                onChange={setAnimations}
              />
              <ToggleSetting
                label={t("settings.compact_mode")}
                description={t("settings.compact_mode_desc")}
                checked={compactMode}
                onChange={setCompactMode}
              />

              {/* Theme preview */}
              <div className="mt-6 pt-4 border-t border-glass-border">
                <p className="text-sm font-medium text-text-primary mb-3">
                  {t("settings.accent_color")}
                </p>
                <div className="flex items-center gap-3">
                  {[
                    { id: "blue", color: "bg-[#5b7fff]", name: "Blue" },
                    { id: "purple", color: "bg-[#a855f7]", name: "Purple" },
                    { id: "pink", color: "bg-[#ec4899]", name: "Pink" },
                    { id: "cyan", color: "bg-[#06b6d4]", name: "Cyan" },
                    { id: "green", color: "bg-[#10b981]", name: "Green" },
                  ].map((themeItem) => (
                    <button
                      key={themeItem.id}
                      onClick={() => {
                        setAccentColor(themeItem.id as any);
                        playSound("click");
                      }}
                      className={`
                        w-8 h-8 rounded-full ${themeItem.color}
                        ring-2 ring-transparent
                        transition-all duration-200 hover:scale-110
                        ${accentColor === themeItem.id ? "ring-text-primary scale-110" : ""}
                      `}
                      title={t(`settings.colors.${themeItem.id}`)}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeCategory === "data" && <DataSettings />}
        </div>
      </motion.div>
    </motion.div>
  );
}
