import { useState, useEffect } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { motion } from "framer-motion";
import { useTheme } from "../context/ThemeContext";

// ── Settings Categories ──
const categories = [
  {
    id: "general",
    label: "General",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
  {
    id: "account",
    label: "Account",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    ),
  },
];

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
    <div className="flex items-center justify-between py-4 border-b border-[var(--color-glass-border)] last:border-b-0">
      <div className="flex-1 mr-4">
        <p className="text-sm font-medium text-[var(--color-text-primary)]">
          {label}
        </p>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          {description}
        </p>
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

  // Logo state
  const [newLogoPath, setNewLogoPath] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

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
      }>("get_shop_settings");
      setShopName(settings.shop_name);
      setPhone(settings.phone || "");
      setAddress(settings.address || "");

      if (settings.logo_path) {
        // Use convertFileSrc (Tauri's asset protocol) for reliable display
        const assetUrl = convertFileSrc(settings.logo_path);
        setPreviewSrc(assetUrl);
      } else {
        setPreviewSrc(null);
      }
    } catch (err) {
      console.error("Failed to fetch settings:", err);
      setMessage({ type: "error", text: "Failed to load settings" });
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
      });
      setMessage({ type: "success", text: "Settings saved successfully" });

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
      setMessage({ type: "error", text: "Failed to save settings" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="w-6 h-6 border-2 border-[var(--color-glass-border)] border-t-[var(--color-accent-blue)] rounded-full animate-spin" />
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
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Account Settings
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
      <p className="text-xs text-[var(--color-text-muted)] mb-5">
        Manage your account information
      </p>

      <div className="space-y-5">
        {/* Logo Section */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-[var(--color-text-secondary)]">
            Shop Logo
          </label>
          {/* Debug Info */}
          <div className="text-[10px] p-2 bg-black/20 rounded font-mono text-[var(--color-text-muted)] break-all hidden">
            Raw: {newLogoPath || "none"} <br />
            Preview: {previewSrc || "none"}
          </div>

          <div className="flex items-center gap-4">
            <div className="relative group w-20 h-20 rounded-full bg-[var(--color-glass-white)] border border-[var(--color-glass-border)] overflow-hidden flex items-center justify-center shrink-0">
              {previewSrc ? (
                <img
                  src={previewSrc}
                  alt="Shop Logo"
                  className="w-full h-full object-cover"
                />
              ) : (
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-[var(--color-text-muted)]"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              )}
            </div>
            <button
              onClick={handlePickLogo}
              className="btn-liquid btn-liquid-ghost text-xs px-3 py-1.5"
            >
              Change Logo
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
            Shop Name
          </label>
          <input
            type="text"
            className="input-liquid"
            placeholder="Your shop name"
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
            Phone Number
          </label>
          <input
            type="tel"
            className="input-liquid"
            placeholder="Your phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
            Address
          </label>
          <textarea
            className="input-liquid min-h-[80px] py-2"
            placeholder="Your shop address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
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
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default function Settings() {
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
  const [soundEffects, setSoundEffects] = useState(false);
  const [autoBackup, setAutoBackup] = useState(true);

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
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
          Settings
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Manage your preferences
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
                onClick={() => setActiveCategory(cat.id)}
                className={`
                  w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium
                  transition-all duration-200 text-left
                  ${
                    activeCategory === cat.id
                      ? "bg-[var(--color-glass-white-hover)] text-[var(--color-text-primary)] shadow-[0_0_12px_rgba(0,0,0,0.1)] border border-[var(--color-glass-border)]"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-glass-white)] hover:text-[var(--color-text-primary)] border border-transparent"
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
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">
                General Settings
              </h2>
              <p className="text-xs text-[var(--color-text-muted)] mb-5">
                Configure basic shop preferences
              </p>

              <ToggleSetting
                label="Push Notifications"
                description="Receive notifications for important events"
                checked={notifications}
                onChange={setNotifications}
              />
              <ToggleSetting
                label="Order Alerts"
                description="Get notified when a new order comes in"
                checked={orderAlerts}
                onChange={setOrderAlerts}
              />
              <ToggleSetting
                label="Sound Effects"
                description="Play sounds for notifications and actions"
                checked={soundEffects}
                onChange={setSoundEffects}
              />
              <ToggleSetting
                label="Auto Backup"
                description="Automatically backup your data daily"
                checked={autoBackup}
                onChange={setAutoBackup}
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
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">
                Appearance
              </h2>
              <p className="text-xs text-[var(--color-text-muted)] mb-5">
                Customize how the app looks and feels
              </p>

              <ToggleSetting
                label="Dark Mode"
                description="Use dark color scheme throughout the app"
                checked={theme === "dark"}
                onChange={() => toggleTheme()}
              />
              <ToggleSetting
                label="Smooth Animations"
                description="Enable page transitions and micro-interactions"
                checked={animations}
                onChange={setAnimations}
              />
              <ToggleSetting
                label="Compact Mode"
                description="Reduce spacing to show more content"
                checked={compactMode}
                onChange={setCompactMode}
              />

              {/* Theme preview */}
              <div className="mt-6 pt-4 border-t border-[var(--color-glass-border)]">
                <p className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
                  Accent Color
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
                      onClick={() => setAccentColor(themeItem.id as any)}
                      className={`
                        w-8 h-8 rounded-full ${themeItem.color}
                        ring-2 ring-transparent
                        transition-all duration-200 hover:scale-110
                        ${accentColor === themeItem.id ? "ring-[var(--color-text-primary)] scale-110" : ""}
                      `}
                      title={themeItem.name}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
