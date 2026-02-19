import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useTheme } from "../context/ThemeContext";
import OnboardingLanguageSwitcher from "../components/pages/onboarding/OnboardingLanguageSwitcher";
import OnboardingStepIndicators from "../components/pages/onboarding/OnboardingStepIndicators";
import OnboardingStepWelcome from "../components/pages/onboarding/OnboardingStepWelcome";
import OnboardingStepTheme from "../components/pages/onboarding/OnboardingStepTheme";
import OnboardingStepDetails from "../components/pages/onboarding/OnboardingStepDetails";
import OnboardingStepLogo from "../components/pages/onboarding/OnboardingStepLogo";
import OnboardingStepAccount from "../components/pages/onboarding/OnboardingStepAccount";
import OnboardingStepActions from "../components/pages/onboarding/OnboardingStepActions";
import {
  slideTransition,
  slideVariants,
} from "../components/pages/onboarding/animations";
import { OnboardingAppSettings, OnboardingStep } from "../types/onboarding";

const LAST_STEP: OnboardingStep = 4;

export default function OnboardingForm() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { theme, setTheme, accentColor, setAccentColor } = useTheme();

  const [currentStep, setCurrentStep] = useState<OnboardingStep>(0);
  const [direction, setDirection] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [shopName, setShopName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [logoPath, setLogoPath] = useState("");
  const [logoPreview, setLogoPreview] = useState("");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const goToStep = (step: number) => {
    const bounded = Math.max(0, Math.min(LAST_STEP, step)) as OnboardingStep;
    setCurrentStep(bounded);
  };

  const toggleLanguage = async () => {
    const newLang = i18n.language === "en" ? "mm" : "en";
    await i18n.changeLanguage(newLang);

    if (!window.__TAURI_INTERNALS__) return;

    try {
      const currentSettings = await invoke<OnboardingAppSettings>("get_app_settings");
      await invoke("update_app_settings", {
        settings: { ...currentSettings, language: newLang },
      });
    } catch (err) {
      console.error("Failed to update language setting:", err);
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
        setLogoPath(selected);
        setLogoPreview(convertFileSrc(selected));
        return;
      }
    } catch (err) {
      console.warn("Tauri dialog unavailable, falling back to file input:", err);
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/gif,image/webp,image/svg+xml";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;

      setLogoPath(file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        setLogoPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
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
    goToStep(currentStep + 1);
  };

  const handleBack = () => {
    setError("");
    setDirection(-1);
    goToStep(currentStep - 1);
  };

  const handleRestore = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "SQLite Database", extensions: ["db", "sqlite"] }],
      });

      if (!selected) return;

      setIsSubmitting(true);
      await invoke("restore_database", { restorePath: selected });
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
      if (window.__TAURI_INTERNALS__) {
        await invoke("save_shop_setup", {
          name: shopName.trim(),
          phone: phone.trim(),
          address: address.trim(),
          logoFilePath: logoPath,
        });

        await invoke("register_user", {
          name: username.trim(),
          password,
        });

        const currentSettings = await invoke<OnboardingAppSettings>("get_app_settings");
        await invoke("update_app_settings", {
          settings: { ...currentSettings, theme },
        });
      } else {
        localStorage.setItem("browser_onboarded", "true");
        localStorage.setItem("browser_user", JSON.stringify({ name: username }));
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

  const renderCurrentStep = () => {
    if (currentStep === 0) {
      return <OnboardingStepWelcome onNext={handleNext} onRestore={handleRestore} />;
    }

    if (currentStep === 1) {
      return (
        <OnboardingStepTheme
          theme={theme}
          accentColor={accentColor}
          setTheme={setTheme}
          setAccentColor={setAccentColor}
        />
      );
    }

    if (currentStep === 2) {
      return (
        <OnboardingStepDetails
          shopName={shopName}
          phone={phone}
          address={address}
          onShopNameChange={setShopName}
          onPhoneChange={setPhone}
          onAddressChange={setAddress}
        />
      );
    }

    if (currentStep === 3) {
      return (
        <OnboardingStepLogo
          logoPath={logoPath}
          logoPreview={logoPreview}
          onPickLogo={handlePickLogo}
        />
      );
    }

    return (
      <OnboardingStepAccount
        username={username}
        password={password}
        confirmPassword={confirmPassword}
        onUsernameChange={setUsername}
        onPasswordChange={setPassword}
        onConfirmPasswordChange={setConfirmPassword}
      />
    );
  };

  return (
    <div
      data-tauri-drag-region
      className="w-full min-h-screen flex items-center justify-center overflow-hidden"
    >
      <div className="liquid-gradient">
        <div className="liquid-blob-1" />
        <div className="liquid-blob-2" />
        <div className="liquid-blob-3" />
      </div>

      <OnboardingLanguageSwitcher
        language={i18n.language}
        onToggle={toggleLanguage}
      />

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

      <OnboardingStepIndicators currentStep={currentStep} />

      <div className="relative z-10 w-full max-w-[420px] mx-4">
        <div className="glass-panel p-8 overflow-hidden">
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

          <AnimatePresence custom={direction} mode="wait">
            <motion.div
              key={`step-${currentStep}`}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={slideTransition}
            >
              {renderCurrentStep()}
            </motion.div>
          </AnimatePresence>

          <OnboardingStepActions
            currentStep={currentStep}
            isSubmitting={isSubmitting}
            onBack={handleBack}
            onNext={handleNext}
            onSubmit={handleSubmit}
          />
        </div>

        <p className="text-center text-xs text-text-primary/25 mt-6">
          {t("auth.onboarding.footer_note")}
        </p>
      </div>
    </div>
  );
}
