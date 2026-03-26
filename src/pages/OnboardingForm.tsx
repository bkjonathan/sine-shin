import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { loginUser, registerUser } from "../api/authApi";
import {
  configureDatabase,
  restoreDatabase,
  saveShopSetup,
  testPostgresqlConnection,
  updateAppLanguage,
  updateOnboardingTheme,
} from "../api/onboardingApi";
import {
  onboardingSlideTransition,
  onboardingSlideVariants,
} from "../constants/animations";
import { useTheme } from "../context/ThemeContext";
import OnboardingLanguageSwitcher from "../components/pages/onboarding/OnboardingLanguageSwitcher";
import OnboardingStepIndicators from "../components/pages/onboarding/OnboardingStepIndicators";
import OnboardingStepWelcome from "../components/pages/onboarding/OnboardingStepWelcome";
import OnboardingStepTheme from "../components/pages/onboarding/OnboardingStepTheme";
import OnboardingStepDetails from "../components/pages/onboarding/OnboardingStepDetails";
import OnboardingStepLogo from "../components/pages/onboarding/OnboardingStepLogo";
import OnboardingStepAccount from "../components/pages/onboarding/OnboardingStepAccount";
import OnboardingStepActions from "../components/pages/onboarding/OnboardingStepActions";
import { useAuth } from "../context/AuthContext";
import { OnboardingStep } from "../types/onboarding";
import type { DatabaseKind } from "../types/settings";

const LAST_STEP: OnboardingStep = 4;
const USERNAME_REGEX = /^[A-Za-z0-9_.-]+$/;

interface OnboardingFormProps {
  onComplete?: () => void;
}

export default function OnboardingForm({ onComplete }: OnboardingFormProps) {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { theme, setTheme, accentColor, setAccentColor } = useTheme();
  const { login } = useAuth();

  const [currentStep, setCurrentStep] = useState<OnboardingStep>(0);
  const [direction, setDirection] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [shopName, setShopName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [databaseKind, setDatabaseKind] = useState<DatabaseKind>("sqlite");
  const [postgresqlUrl, setPostgresqlUrl] = useState("");
  const [isTestingPostgresql, setIsTestingPostgresql] = useState(false);
  const [postgresqlConnectionOk, setPostgresqlConnectionOk] = useState<boolean | null>(null);
  const [postgresqlConnectionMessage, setPostgresqlConnectionMessage] = useState("");
  const [testedPostgresqlUrl, setTestedPostgresqlUrl] = useState("");
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
      await updateAppLanguage(newLang);
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

      if (typeof selected === "string") {
        setError("");
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

      if (window.__TAURI_INTERNALS__) {
        setError(
          t(
            "auth.onboarding.error_logo_picker_unavailable",
            "Could not access the selected file path. Please choose the logo again.",
          ),
        );
        setLogoPath("");
      } else {
        setError("");
        setLogoPath(file.name);
      }
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
    const trimmedPostgresqlUrl = postgresqlUrl.trim();

    if (currentStep === 2 && !shopName.trim()) {
      setError(t("auth.onboarding.error_shop_name"));
      return;
    }

    if (currentStep === 2 && databaseKind === "postgresql" && !trimmedPostgresqlUrl) {
      setError(
        t(
          "auth.onboarding.error_postgresql_url",
          "PostgreSQL URL is required when PostgreSQL is selected.",
        ),
      );
      return;
    }

    if (
      currentStep === 2 &&
      databaseKind === "postgresql" &&
      (!postgresqlConnectionOk || testedPostgresqlUrl !== trimmedPostgresqlUrl)
    ) {
      setError(
        t(
          "auth.onboarding.error_postgresql_not_tested",
          "Test the PostgreSQL connection successfully before continuing.",
        ),
      );
      return;
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

      if (!selected || typeof selected !== "string") return;

      setIsSubmitting(true);
      await restoreDatabase(selected);
      window.location.reload();
    } catch (err) {
      console.error("Failed to restore database:", err);
      setError(typeof err === "string" ? err : "Failed to restore database");
      setIsSubmitting(false);
    }
  };

  const handlePostgresqlUrlChange = (value: string) => {
    setPostgresqlUrl(value);
    setPostgresqlConnectionOk(null);
    setPostgresqlConnectionMessage("");
    setTestedPostgresqlUrl("");
  };

  const handleDatabaseKindChange = (value: DatabaseKind) => {
    setDatabaseKind(value);
    setError("");
    if (value !== "postgresql") {
      setPostgresqlConnectionOk(null);
      setPostgresqlConnectionMessage("");
      setTestedPostgresqlUrl("");
    }
  };

  const handleTestPostgresql = async () => {
    const trimmedUrl = postgresqlUrl.trim();
    if (!trimmedUrl) {
      setPostgresqlConnectionOk(false);
      setPostgresqlConnectionMessage(
        t(
          "auth.onboarding.error_postgresql_url",
          "PostgreSQL URL is required when PostgreSQL is selected.",
        ),
      );
      return;
    }

    try {
      setIsTestingPostgresql(true);
      setError("");
      const result = await testPostgresqlConnection(trimmedUrl);
      setPostgresqlConnectionOk(result.connected);
      setPostgresqlConnectionMessage(result.message);
      setTestedPostgresqlUrl(trimmedUrl);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : t(
                "auth.onboarding.database_failed",
                "PostgreSQL connection failed",
              );
      setPostgresqlConnectionOk(false);
      setPostgresqlConnectionMessage(message);
      setTestedPostgresqlUrl("");
    } finally {
      setIsTestingPostgresql(false);
    }
  };

  const handleSubmit = async () => {
    setError("");

    const normalizedUsername = username.trim();
    let validationError: string | null = null;

    if (!normalizedUsername || !password.trim()) {
      validationError = t("auth.onboarding.error_credentials");
    } else if (
      normalizedUsername.length < 3 ||
      normalizedUsername.length > 30 ||
      !USERNAME_REGEX.test(normalizedUsername)
    ) {
      validationError = t(
        "auth.onboarding.error_username_rules",
        "Username must be 3-30 characters and use only letters, numbers, ., _, or -",
      );
    } else if (
      password.length < 8 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/\d/.test(password)
    ) {
      validationError = t(
        "auth.onboarding.error_password_rules",
        "Password must be at least 8 characters and include uppercase, lowercase, and a number",
      );
    } else if (password !== confirmPassword) {
      validationError = t("auth.onboarding.error_password_match");
    }

    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);

    try {
      if (window.__TAURI_INTERNALS__) {
        await configureDatabase(
          databaseKind,
          databaseKind === "postgresql" ? postgresqlUrl : undefined,
        );

        await saveShopSetup({
          name: shopName.trim(),
          phone: phone.trim(),
          address: address.trim(),
          logoFilePath: logoPath,
        });

        await registerUser({
          name: normalizedUsername,
          password,
        });

        await updateOnboardingTheme(theme);

        const user = await loginUser(normalizedUsername, password);
        await login({ name: user.name, role: user.role });
      } else {
        localStorage.setItem("browser_onboarded", "true");
        await login({ name: normalizedUsername, role: "admin" });
      }

      onComplete?.();
      navigate("/dashboard", { replace: true });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : typeof err === "object" &&
                err !== null &&
                "message" in err &&
                typeof err.message === "string"
              ? err.message
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
          databaseKind={databaseKind}
          postgresqlUrl={postgresqlUrl}
          isTestingPostgresql={isTestingPostgresql}
          postgresqlConnectionOk={postgresqlConnectionOk}
          postgresqlConnectionMessage={postgresqlConnectionMessage}
          onShopNameChange={setShopName}
          onPhoneChange={setPhone}
          onAddressChange={setAddress}
          onDatabaseKindChange={handleDatabaseKindChange}
          onPostgresqlUrlChange={handlePostgresqlUrlChange}
          onTestPostgresqlConnection={handleTestPostgresql}
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

      <div
        className={`relative z-10 w-full mx-4 ${
          currentStep === 2 ? "max-w-[860px]" : "max-w-[420px]"
        }`}
      >
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
              variants={onboardingSlideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={onboardingSlideTransition}
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
