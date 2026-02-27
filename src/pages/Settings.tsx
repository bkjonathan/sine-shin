import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Input, Select } from "../components/ui";
import { useTheme } from "../context/ThemeContext";
import { useSound } from "../context/SoundContext";
import { useAppSettings } from "../context/AppSettingsContext";
import {
  IconHardDrive,
  IconSettings,
  IconSun,
  IconUserRound,
} from "../components/icons";
import SettingsToggle from "../components/pages/settings/SettingsToggle";
import SettingsAccountPanel from "../components/pages/settings/SettingsAccountPanel";
import SettingsDataPanel from "../components/pages/settings/SettingsDataPanel";

const fadeVariants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 },
  },
};

export default function Settings() {
  const { t, i18n } = useTranslation();
  const [activeCategory, setActiveCategory] = useState("general");

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

  const [notifications, setNotifications] = useState(true);
  const [orderAlerts, setOrderAlerts] = useState(true);

  const { soundEnabled, toggleSound, playSound } = useSound();

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

  const categories = [
    {
      id: "general",
      label: t("settings.general"),
      icon: <IconSettings size={18} strokeWidth={1.8} />,
    },
    {
      id: "account",
      label: t("settings.account.title"),
      icon: <IconUserRound size={18} strokeWidth={1.8} />,
    },
    {
      id: "appearance",
      label: t("settings.appearance"),
      icon: <IconSun size={18} strokeWidth={1.8} />,
    },
    {
      id: "data",
      label: t("settings.data"),
      icon: <IconHardDrive size={18} strokeWidth={1.8} />,
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
        <div className="glass-panel p-3 h-fit">
          <nav className="space-y-1">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => {
                  setActiveCategory(category.id);
                  playSound("click");
                }}
                className={`
                  w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium
                  transition-all duration-200 text-left
                  ${
                    activeCategory === category.id
                      ? "bg-glass-white-hover text-text-primary shadow-[0_0_12px_rgba(0,0,0,0.1)] border border-glass-border"
                      : "text-text-secondary hover:bg-glass-white hover:text-text-primary border border-transparent"
                  }
                `}
              >
                {category.icon}
                {category.label}
              </button>
            ))}
          </nav>
        </div>

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
                    onChange={(value) => {
                      const nextLanguage = value.toString();
                      i18n.changeLanguage(nextLanguage);
                      setLanguage(nextLanguage);
                    }}
                    placeholder="Select Language"
                  />
                </div>
              </div>

              <div className="py-4 border-b border-glass-border">
                <p className="text-sm font-medium text-text-primary mb-3">
                  {t("settings.currency_settings")}
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-text-muted mb-1.5">
                      {t("settings.currency_code")}
                    </label>
                    <Input
                      type="text"
                      className="input-liquid w-full uppercase"
                      placeholder={t("settings.currency_code_placeholder")}
                      value={currency}
                      onChange={(event) =>
                        setCurrency(event.target.value.toUpperCase())
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-muted mb-1.5">
                      {t("settings.currency_symbol")}
                    </label>
                    <Input
                      type="text"
                      className="input-liquid w-full"
                      placeholder={t("settings.currency_symbol_placeholder")}
                      value={currency_symbol}
                      onChange={(event) =>
                        setCurrencySymbol(event.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-muted mb-1.5">
                      {t("settings.exchange_currency_code")}
                    </label>
                    <Input
                      type="text"
                      className="input-liquid w-full uppercase"
                      placeholder={t(
                        "settings.exchange_currency_code_placeholder",
                      )}
                      value={exchange_currency}
                      onChange={(event) =>
                        setExchangeCurrency(event.target.value.toUpperCase())
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-muted mb-1.5">
                      {t("settings.exchange_currency_symbol")}
                    </label>
                    <Input
                      type="text"
                      className="input-liquid w-full"
                      placeholder={t(
                        "settings.exchange_currency_symbol_placeholder",
                      )}
                      value={exchange_currency_symbol}
                      onChange={(event) =>
                        setExchangeCurrencySymbol(event.target.value)
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
                  <Input
                    type="text"
                    className="input-liquid w-full"
                    placeholder={t(
                      "settings.invoice_print.printer_name_placeholder",
                    )}
                    value={invoice_printer_name}
                    onChange={(event) =>
                      setInvoicePrinterName(event.target.value)
                    }
                  />
                  <p className="text-xs text-text-muted mt-1.5">
                    {t("settings.invoice_print.printer_help")}
                  </p>
                </div>
              </div>

              <SettingsToggle
                label={t("settings.push_notifications")}
                description={t("settings.push_notifications_desc")}
                checked={notifications}
                onChange={setNotifications}
              />
              <SettingsToggle
                label={t("settings.order_alerts")}
                description={t("settings.order_alerts_desc")}
                checked={orderAlerts}
                onChange={setOrderAlerts}
              />
              <SettingsToggle
                label={t("settings.sound_effects")}
                description={t("settings.sound_effects_desc")}
                checked={soundEnabled}
                onChange={() => {
                  toggleSound();
                  if (!soundEnabled) {
                    playSound("switch");
                  }
                }}
              />
              <SettingsToggle
                label={t("settings.invoice_print.silent_label")}
                description={t("settings.invoice_print.silent_desc")}
                checked={silent_invoice_print}
                onChange={setSilentInvoicePrint}
              />
            </motion.div>
          )}

          {activeCategory === "account" && <SettingsAccountPanel />}

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

              <SettingsToggle
                label={t("settings.dark_mode")}
                description={t("settings.dark_mode_desc")}
                checked={theme === "dark"}
                onChange={() => {
                  toggleTheme();
                  playSound("switch");
                }}
              />
              <SettingsToggle
                label={t("settings.smooth_animations")}
                description={t("settings.smooth_animations_desc")}
                checked={animations}
                onChange={setAnimations}
              />
              <SettingsToggle
                label={t("settings.compact_mode")}
                description={t("settings.compact_mode_desc")}
                checked={compactMode}
                onChange={setCompactMode}
              />

              <div className="mt-6 pt-4 border-t border-glass-border">
                <p className="text-sm font-medium text-text-primary mb-3">
                  {t("settings.accent_color")}
                </p>
                <div className="flex items-center gap-3">
                  {[
                    { id: "blue", color: "bg-[#5b7fff]" },
                    { id: "purple", color: "bg-[#a855f7]" },
                    { id: "pink", color: "bg-[#ec4899]" },
                    { id: "cyan", color: "bg-[#06b6d4]" },
                    { id: "green", color: "bg-[#10b981]" },
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

          {activeCategory === "data" && <SettingsDataPanel />}
        </div>
      </motion.div>
    </motion.div>
  );
}
