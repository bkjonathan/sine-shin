import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useTheme } from "../context/ThemeContext";
import { Button, Input } from "./ui";
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconHome,
  IconImage,
} from "./icons";

// ── Slide animation variants ──
const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
    scale: 0.95,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 300 : -300,
    opacity: 0,
    scale: 0.95,
  }),
};

const slideTransition = {
  x: { type: "spring" as const, stiffness: 300, damping: 30 },
  opacity: { duration: 0.25 },
  scale: { duration: 0.25 },
};

export default function OnboardingForm() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { theme, setTheme, accentColor, setAccentColor } = useTheme();
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const toggleLanguage = async () => {
    const newLang = i18n.language === "en" ? "mm" : "en";
    await i18n.changeLanguage(newLang);

    // Update backend settings if available
    if (window.__TAURI_INTERNALS__) {
      try {
        const currentSettings = await invoke<{
          language: string;
          sound_effect: boolean;
        }>("get_app_settings");
        await invoke("update_app_settings", {
          settings: { ...currentSettings, language: newLang },
        });
      } catch (err) {
        console.error("Failed to update language setting:", err);
      }
    }
  };

  // Form data
  const [shopName, setShopName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [logoPath, setLogoPath] = useState("");
  const [logoPreview, setLogoPreview] = useState("");

  // User data
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handlePickLogo = async () => {
    // Try Tauri native dialog first
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
        setLogoPath(selected);
        const assetUrl = convertFileSrc(selected);
        setLogoPreview(assetUrl);
        return;
      }
    } catch (err) {
      console.warn(
        "Tauri dialog unavailable, falling back to file input:",
        err,
      );
    }

    // Fallback: use a hidden HTML file input (works in browser dev mode)
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/gif,image/webp,image/svg+xml";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        setLogoPath(file.name);
        const reader = new FileReader();
        reader.onload = (e) => {
          setLogoPreview(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  const handleNext = () => {
    setError("");
    if (currentStep === 2 && !shopName.trim()) {
      setError(t("auth.onboarding.error_shop_name"));
      return;
    }
    if (currentStep === 4) {
      if (!username.trim() || !password.trim()) {
        setError(t("auth.onboarding.error_credentials"));
        return;
      }
      if (password !== confirmPassword) {
        setError(t("auth.onboarding.error_password_match"));
        return;
      }
    }

    setDirection(1);
    setCurrentStep((prev) => Math.min(prev + 1, 4));
  };

  const handleBack = () => {
    setError("");
    setDirection(-1);
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleRestore = async () => {
    try {
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

      setIsSubmitting(true);
      await invoke("restore_database", { restorePath: selected });

      // If restore successful, we should probably check if user exists or just let them login
      // Ideally, we redirect to login or dashboard.
      // For now, let's assume restored DB has users and redirect to dashboard
      // but maybe we shoud reload to ensure state is fresh.
      window.location.reload();
    } catch (err) {
      console.error("Failed to restore database:", err);
      setError(typeof err === "string" ? err : "Failed to restore database");
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    setError("");
    setIsSubmitting(true);
    try {
      // Check if Tauri is available
      if (window.__TAURI_INTERNALS__) {
        await invoke("save_shop_setup", {
          name: shopName.trim(),
          phone: phone.trim(),
          address: address.trim(),
          logoFilePath: logoPath,
        });

        await invoke("register_user", {
          name: username.trim(),
          password: password,
        });

        // Save theme preference
        const currentSettings = await invoke<{
          language: string;
          sound_effect: boolean;
          theme: string;
        }>("get_app_settings");

        await invoke("update_app_settings", {
          settings: { ...currentSettings, theme: theme },
        });
      } else {
        // Browser mode — mark onboarding as done
        localStorage.setItem("browser_onboarded", "true");
        localStorage.setItem(
          "browser_user",
          JSON.stringify({ name: username }),
        );
      }
      navigate("/dashboard", { replace: true });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : t("auth.onboarding.error_failed");
      setError(message);
      setIsSubmitting(false);
    }
  };

  return (
    <div
      data-tauri-drag-region
      className="w-full min-h-screen flex items-center justify-center overflow-hidden"
    >
      {/* ── Animated Mesh Gradient Background ── */}
      <div className="liquid-gradient">
        <div className="liquid-blob-1" />
        <div className="liquid-blob-2" />
        <div className="liquid-blob-3" />
      </div>

      {/* ── Language Switcher ── */}
      <div className="fixed top-6 right-6 z-50">
        <button
          onClick={toggleLanguage}
          className="
            flex items-center gap-2 px-3 py-1.5 rounded-full
            bg-[var(--color-glass-white)] hover:bg-[var(--color-glass-white-hover)] backdrop-blur-md
            border border-[var(--color-glass-border)] transition-all duration-300
            text-sm text-text-primary font-medium
            group
          "
        >
          <span
            className={`opacity-60 group-hover:opacity-100 ${i18n.language === "en" ? "text-accent-blue font-bold opacity-100" : ""}`}
          >
            EN
          </span>
          <div className="h-3 w-px bg-[var(--color-glass-border-light)]" />
          <span
            className={`opacity-60 group-hover:opacity-100 ${i18n.language === "mm" ? "text-accent-blue font-bold opacity-100" : ""}`}
          >
            MM
          </span>
        </button>
      </div>

      {/* ── Extra animated blobs for onboarding page ── */}
      <div
        className="fixed inset-0 pointer-events-none overflow-hidden"
        style={{ zIndex: 1 }}
      >
        <div
          className="absolute w-[350px] h-[350px] rounded-full opacity-20"
          style={{
            background:
              "radial-gradient(circle, var(--color-accent-cyan) 0%, transparent 70%)",
            filter: "blur(80px)",
            top: "20%",
            right: "15%",
            animation: "blob-drift-1 18s ease-in-out infinite reverse",
          }}
        />
      </div>

      {/* ── Step indicators (dots) ── */}
      <div className="fixed top-8 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3">
        {[0, 1, 2, 3, 4].map((step) => (
          <div key={step} className="relative flex items-center justify-center">
            <div
              className={`
                w-2.5 h-2.5 rounded-full transition-all duration-500
                ${
                  currentStep === step
                    ? "bg-text-primary scale-125 shadow-[0_0_12px_rgba(255,255,255,0.5)]"
                    : currentStep > step
                      ? "bg-text-primary/60"
                      : "bg-text-primary/20"
                }
              `}
            />
            {step < 4 && (
              <div
                className={`w-8 h-px ml-3 transition-all duration-500 ${
                  currentStep > step
                    ? "bg-text-primary/40"
                    : "bg-text-primary/10"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* ── Glass Card ── */}
      <div className="relative z-10 w-full max-w-[420px] mx-4">
        <div className="glass-panel p-8 overflow-hidden">
          {/* Error message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: "auto", marginBottom: 24 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-error text-sm"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Steps with AnimatePresence */}
          <AnimatePresence custom={direction} mode="wait">
            {/* Step 0: Welcome */}
            {currentStep === 0 && (
              <motion.div
                key="step-0"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={slideTransition}
                className="text-center py-8"
              >
                {/* App icon */}
                <div className="mx-auto w-20 h-20 rounded-[1.25rem] bg-linear-to-br from-accent-blue to-accent-purple flex items-center justify-center mb-6 shadow-[0_8px_30px_rgba(91,127,255,0.3)]">
                  <IconHome size={36} strokeWidth={1.8} stroke="white" />
                </div>

                <h1 className="text-3xl font-bold text-text-primary mb-3 tracking-tight">
                  {t("auth.onboarding.welcome_title")}
                </h1>
                <p className="text-text-secondary text-sm leading-relaxed mb-10 max-w-[280px] mx-auto">
                  {t("auth.onboarding.welcome_subtitle")}
                </p>

                <Button
                  variant="primary"
                  className="px-10 py-3.5 text-base"
                  onClick={handleNext}
                >
                  {t("auth.onboarding.get_started")}
                  <IconChevronRight size={16} strokeWidth={2} />
                </Button>

                <div className="mt-6">
                  <Button
                    variant="ghost"
                    className="text-sm text-text-muted hover:text-text-primary px-6 py-2"
                    onClick={handleRestore}
                  >
                    {t("auth.onboarding.restore_backup", "Restore from Backup")}
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step 0.5: Theme Selection */}
            {currentStep === 1 && (
              <motion.div
                key="step-theme"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={slideTransition}
                className="space-y-6"
              >
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold text-text-primary mb-1">
                    {t("settings.appearance")}
                  </h2>
                  <p className="text-sm text-text-muted">
                    {t("settings.appearance_desc")}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setTheme("light")}
                    className={`
                      relative p-4 rounded-xl border-2 transition-all duration-300
                      flex flex-col items-center gap-3
                      ${
                        theme === "light"
                          ? "bg-[var(--color-glass-white)] border-accent-blue shadow-[0_0_20px_rgba(91,127,255,0.15)]"
                          : "bg-[var(--color-glass-white)] border-[var(--color-glass-border)] hover:border-[var(--color-glass-border-light)] hover:bg-[var(--color-glass-white-hover)]"
                      }
                    `}
                  >
                    <div className="w-full aspect-video rounded-lg bg-[#f4f5fa] border border-gray-200 relative overflow-hidden">
                      <div className="absolute top-2 left-2 w-8 h-2 bg-white rounded-sm shadow-sm" />
                      <div className="absolute top-6 left-2 right-2 bottom-2 bg-white rounded-sm shadow-sm" />
                    </div>
                    <span
                      className={`text-sm font-medium ${theme === "light" ? "text-text-primary" : "text-text-secondary"}`}
                    >
                      {t("settings.light_mode")}
                    </span>
                    {theme === "light" && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-accent-blue rounded-full flex items-center justify-center">
                        <IconCheck size={12} strokeWidth={3} stroke="white" />
                      </div>
                    )}
                  </button>

                  <button
                    onClick={() => setTheme("dark")}
                    className={`
                      relative p-4 rounded-xl border-2 transition-all duration-300
                      flex flex-col items-center gap-3
                      ${
                        theme === "dark"
                          ? "bg-[var(--color-glass-white)] border-accent-blue shadow-[0_0_20px_rgba(91,127,255,0.15)]"
                          : "bg-[var(--color-glass-white)] border-[var(--color-glass-border)] hover:border-[var(--color-glass-border-light)] hover:bg-[var(--color-glass-white-hover)]"
                      }
                    `}
                  >
                    <div className="w-full aspect-video rounded-lg bg-[#0a0a1a] border border-white/10 relative overflow-hidden">
                      <div className="absolute top-2 left-2 w-8 h-2 bg-white/10 rounded-sm" />
                      <div className="absolute top-6 left-2 right-2 bottom-2 bg-white/5 rounded-sm" />
                    </div>
                    <span
                      className={`text-sm font-medium ${theme === "dark" ? "text-text-primary" : "text-text-secondary"}`}
                    >
                      {t("settings.dark_mode")}
                    </span>
                    {theme === "dark" && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-accent-blue rounded-full flex items-center justify-center">
                        <IconCheck size={12} strokeWidth={3} stroke="white" />
                      </div>
                    )}
                  </button>
                </div>

                <div className="mt-6">
                  <h3 className="text-sm font-medium text-text-primary mb-3">
                    {t("settings.accent_color")}
                  </h3>
                  <div className="flex items-center justify-center gap-4">
                    {(["blue", "purple", "pink", "cyan", "green"] as const).map(
                      (color) => (
                        <button
                          key={color}
                          onClick={() => setAccentColor(color)}
                          className={`
                          w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300
                          ${
                            accentColor === color
                              ? "scale-110 ring-2 ring-offset-2 ring-offset-glass-bg ring-text-primary shadow-lg"
                              : "hover:scale-110 hover:shadow-md opacity-80 hover:opacity-100"
                          }
                        `}
                          style={{
                            background: `var(--color-accent-${color === "blue" ? "primary" : color === "purple" ? "purple" : color === "pink" ? "pink" : color === "cyan" ? "cyan" : "green"})`,
                            backgroundColor:
                              color === "blue"
                                ? "#5b7fff"
                                : color === "purple"
                                  ? "#a855f7"
                                  : color === "pink"
                                    ? "#ec4899"
                                    : color === "cyan"
                                      ? "#06b6d4"
                                      : "#10b981",
                          }}
                        >
                          {accentColor === color && (
                            <IconCheck size={16} strokeWidth={3} stroke="white" />
                          )}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 1: Details */}
            {currentStep === 2 && (
              <motion.div
                key="step-1"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={slideTransition}
                className="space-y-6"
              >
                <div className="text-center mb-2">
                  <h2 className="text-xl font-bold text-text-primary mb-1">
                    {t("auth.onboarding.step1_title")}
                  </h2>
                  <p className="text-sm text-text-muted">
                    {t("auth.onboarding.step1_subtitle")}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    {t("auth.onboarding.shop_name")}{" "}
                    <span className="text-error">*</span>
                  </label>
                  <Input
                    type="text"
                    className="input-liquid"
                    placeholder={t("auth.onboarding.enter_shop_name")}
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    {t("auth.onboarding.phone_number")}
                  </label>
                  <Input
                    type="tel"
                    className="input-liquid"
                    placeholder={t("auth.onboarding.enter_phone")}
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
              </motion.div>
            )}

            {/* Step 2: Logo */}
            {currentStep === 3 && (
              <motion.div
                key="step-2"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={slideTransition}
                className="space-y-6"
              >
                <div className="text-center mb-2">
                  <h2 className="text-xl font-bold text-text-primary mb-1">
                    {t("auth.onboarding.step2_title")}
                  </h2>
                  <p className="text-sm text-text-muted">
                    {t("auth.onboarding.step2_subtitle")}
                  </p>
                </div>

                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={handlePickLogo}
                    className="
                      w-40 h-40 rounded-full
                      bg-[var(--color-glass-white)] backdrop-blur-lg
                      border-2 border-dashed border-[var(--color-glass-border)]
                      flex flex-col items-center justify-center gap-2
                      cursor-pointer transition-all duration-300
                      hover:border-accent-blue hover:bg-[var(--color-glass-white-hover)]
                      hover:shadow-[0_0_30px_rgba(91,127,255,0.15)]
                      group overflow-hidden
                    "
                  >
                    {logoPreview ? (
                      <img
                        src={logoPreview}
                        alt={t("auth.onboarding.logo_preview")}
                        className="w-full h-full object-cover rounded-full"
                      />
                    ) : (
                      <>
                        <IconImage
                          size={32}
                          strokeWidth={1.5}
                          className="text-text-muted group-hover:text-accent-blue transition-colors"
                        />
                        <span className="text-xs text-text-muted group-hover:text-accent-blue transition-colors">
                          {t("auth.onboarding.choose_image")}
                        </span>
                      </>
                    )}
                  </button>
                </div>
                {logoPath && (
                  <p className="text-center text-xs text-text-muted truncate max-w-[300px] mx-auto">
                    {logoPath.split("/").pop()}
                  </p>
                )}
              </motion.div>
            )}

            {/* Step 3: User Account */}
            {currentStep === 4 && (
              <motion.div
                key="step-3"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={slideTransition}
                className="space-y-6"
              >
                <div className="text-center mb-2">
                  <h2 className="text-xl font-bold text-text-primary mb-1">
                    {t("auth.onboarding.step3_title")}
                  </h2>
                  <p className="text-sm text-text-muted">
                    {t("auth.onboarding.step3_subtitle")}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    {t("auth.login.username")}{" "}
                    <span className="text-error">*</span>
                  </label>
                  <Input
                    type="text"
                    className="input-liquid"
                    placeholder={t("auth.login.enter_username")}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    {t("auth.login.password")}{" "}
                    <span className="text-error">*</span>
                  </label>
                  <Input
                    type="password"
                    className="input-liquid"
                    placeholder={t("auth.login.enter_password")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    {t("auth.onboarding.confirm_password")}{" "}
                    <span className="text-error">*</span>
                  </label>
                  <Input
                    type="password"
                    className="input-liquid"
                    placeholder={t("auth.onboarding.enter_confirm_password")}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation Buttons */}
          {currentStep > 0 && (
            <div className="flex items-center justify-between mt-8">
              <Button
                variant="ghost"
                onClick={handleBack}
              >
                <IconChevronLeft size={16} strokeWidth={2} />
                {t("auth.onboarding.back")}
              </Button>

              {currentStep < 4 ? (
                <Button
                  variant="primary"
                  onClick={handleNext}
                >
                  {t("auth.onboarding.next")}
                  <IconChevronRight size={16} strokeWidth={2} />
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={handleSubmit}
                  loading={isSubmitting}
                  loadingText={t("auth.onboarding.saving")}
                >
                  <>
                    {t("auth.onboarding.complete_setup")}
                    <IconCheck size={16} strokeWidth={2} />
                  </>
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-text-primary/25 mt-6">
          {t("auth.onboarding.footer_note")}
        </p>
      </div>
    </div>
  );
}
