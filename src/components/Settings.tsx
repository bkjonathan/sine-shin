import { useState } from "react";
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

          {activeCategory === "account" && (
            <motion.div
              key="account"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
            >
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">
                Account Settings
              </h2>
              <p className="text-xs text-[var(--color-text-muted)] mb-5">
                Manage your account information
              </p>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                    Shop Name
                  </label>
                  <input
                    type="text"
                    className="input-liquid"
                    placeholder="Your shop name"
                    defaultValue="Sine Shin"
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
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    className="input-liquid"
                    placeholder="your@email.com"
                  />
                </div>
                <div className="pt-2">
                  <button className="btn-liquid btn-liquid-primary text-sm px-6 py-2.5">
                    Save Changes
                  </button>
                </div>
              </div>
            </motion.div>
          )}

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
