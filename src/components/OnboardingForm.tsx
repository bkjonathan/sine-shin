import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Form data
  const [shopName, setShopName] = useState("");
  const [phone, setPhone] = useState("");
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
    if (currentStep === 1 && !shopName.trim()) {
      setError(t("auth.onboarding.error_shop_name"));
      return;
    }
    if (currentStep === 3) {
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
    setCurrentStep((prev) => Math.min(prev + 1, 3));
  };

  const handleBack = () => {
    setError("");
    setDirection(-1);
    setCurrentStep((prev) => Math.max(prev - 1, 0));
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
          address: "",
          logoFilePath: logoPath,
        });

        await invoke("register_user", {
          name: username.trim(),
          password: password,
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
    <div className="w-full min-h-screen flex items-center justify-center overflow-hidden bg-[var(--color-liquid-bg)]">
      {/* ── Animated Mesh Gradient Background ── */}
      <div className="liquid-gradient">
        <div className="liquid-blob-3" />
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
        {[0, 1, 2, 3].map((step) => (
          <div key={step} className="relative flex items-center justify-center">
            <div
              className={`
                w-2.5 h-2.5 rounded-full transition-all duration-500
                ${
                  currentStep === step
                    ? "bg-white scale-125 shadow-[0_0_12px_rgba(255,255,255,0.5)]"
                    : currentStep > step
                      ? "bg-white/60"
                      : "bg-white/20"
                }
              `}
            />
            {step < 3 && (
              <div
                className={`w-8 h-px ml-3 transition-all duration-500 ${
                  currentStep > step ? "bg-white/40" : "bg-white/10"
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
                className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-[var(--color-error)] text-sm"
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
                <div className="mx-auto w-20 h-20 rounded-[1.25rem] bg-gradient-to-br from-[var(--color-accent-blue)] to-[var(--color-accent-purple)] flex items-center justify-center mb-6 shadow-[0_8px_30px_rgba(91,127,255,0.3)]">
                  <svg
                    width="36"
                    height="36"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                </div>

                <h1 className="text-3xl font-bold text-white mb-3 tracking-tight">
                  {t("auth.onboarding.welcome_title")}
                </h1>
                <p className="text-[var(--color-text-secondary)] text-sm leading-relaxed mb-10 max-w-[280px] mx-auto">
                  {t("auth.onboarding.welcome_subtitle")}
                </p>

                <button
                  className="btn-liquid btn-liquid-primary px-10 py-3.5 text-base"
                  onClick={handleNext}
                >
                  {t("auth.onboarding.get_started")}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 4L10 8L6 12" />
                  </svg>
                </button>
              </motion.div>
            )}

            {/* Step 1: Details */}
            {currentStep === 1 && (
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
                  <h2 className="text-xl font-bold text-white mb-1">
                    {t("auth.onboarding.step1_title")}
                  </h2>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {t("auth.onboarding.step1_subtitle")}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                    {t("auth.onboarding.shop_name")}{" "}
                    <span className="text-[var(--color-error)]">*</span>
                  </label>
                  <input
                    type="text"
                    className="input-liquid"
                    placeholder={t("auth.onboarding.enter_shop_name")}
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                    {t("auth.onboarding.phone_number")}
                  </label>
                  <input
                    type="tel"
                    className="input-liquid"
                    placeholder={t("auth.onboarding.enter_phone")}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </motion.div>
            )}

            {/* Step 2: Logo */}
            {currentStep === 2 && (
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
                  <h2 className="text-xl font-bold text-white mb-1">
                    {t("auth.onboarding.step2_title")}
                  </h2>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {t("auth.onboarding.step2_subtitle")}
                  </p>
                </div>

                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={handlePickLogo}
                    className="
                      w-40 h-40 rounded-full
                      bg-white/5 backdrop-blur-lg
                      border-2 border-dashed border-white/15
                      flex flex-col items-center justify-center gap-2
                      cursor-pointer transition-all duration-300
                      hover:border-[var(--color-accent-blue)] hover:bg-white/8
                      hover:shadow-[0_0_30px_rgba(91,127,255,0.15)]
                      group overflow-hidden
                    "
                  >
                    {logoPreview ? (
                      <img
                        src={logoPreview}
                        alt="Logo preview"
                        className="w-full h-full object-cover rounded-full"
                      />
                    ) : (
                      <>
                        <svg
                          width="32"
                          height="32"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-[var(--color-text-muted)] group-hover:text-[var(--color-accent-blue)] transition-colors"
                        >
                          <rect
                            x="3"
                            y="3"
                            width="18"
                            height="18"
                            rx="2"
                            ry="2"
                          />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                        <span className="text-xs text-[var(--color-text-muted)] group-hover:text-[var(--color-accent-blue)] transition-colors">
                          {t("auth.onboarding.choose_image")}
                        </span>
                      </>
                    )}
                  </button>
                </div>
                {logoPath && (
                  <p className="text-center text-xs text-[var(--color-text-muted)] truncate max-w-[300px] mx-auto">
                    {logoPath.split("/").pop()}
                  </p>
                )}
              </motion.div>
            )}

            {/* Step 3: User Account */}
            {currentStep === 3 && (
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
                  <h2 className="text-xl font-bold text-white mb-1">
                    {t("auth.onboarding.step3_title")}
                  </h2>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {t("auth.onboarding.step3_subtitle")}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                    {t("auth.login.username")}{" "}
                    <span className="text-[var(--color-error)]">*</span>
                  </label>
                  <input
                    type="text"
                    className="input-liquid"
                    placeholder={t("auth.login.enter_username")}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                    {t("auth.login.password")}{" "}
                    <span className="text-[var(--color-error)]">*</span>
                  </label>
                  <input
                    type="password"
                    className="input-liquid"
                    placeholder={t("auth.login.enter_password")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                    {t("auth.onboarding.confirm_password")}{" "}
                    <span className="text-[var(--color-error)]">*</span>
                  </label>
                  <input
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
              <button
                className="btn-liquid btn-liquid-ghost"
                onClick={handleBack}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10 12L6 8L10 4" />
                </svg>
                {t("auth.onboarding.back")}
              </button>

              {currentStep < 3 ? (
                <button
                  className="btn-liquid btn-liquid-primary"
                  onClick={handleNext}
                >
                  {t("auth.onboarding.next")}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 4L10 8L6 12" />
                  </svg>
                </button>
              ) : (
                <button
                  className="btn-liquid btn-liquid-primary"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {t("auth.onboarding.saving")}
                    </>
                  ) : (
                    <>
                      {t("auth.onboarding.complete_setup")}
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 8L6.5 11.5L13 4.5" />
                      </svg>
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-white/25 mt-6">
          {t("auth.onboarding.footer_note")}
        </p>
      </div>
    </div>
  );
}
