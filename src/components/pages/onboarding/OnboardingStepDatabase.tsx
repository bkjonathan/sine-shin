import { useState } from "react";
import { useTranslation } from "react-i18next";

interface OnboardingStepDatabaseProps {
  databaseType: "sqlite" | "postgresql";
  postgresUrl: string;
  onDatabaseTypeChange: (type: "sqlite" | "postgresql") => void;
  onPostgresUrlChange: (url: string) => void;
  isTesting: boolean;
  testResult: { success: boolean; message: string } | null;
  onTestConnection: () => void;
}

export default function OnboardingStepDatabase({
  databaseType,
  postgresUrl,
  onDatabaseTypeChange,
  onPostgresUrlChange,
  isTesting,
  testResult,
  onTestConnection,
}: OnboardingStepDatabaseProps) {
  const { t } = useTranslation();
  const [showUrl, setShowUrl] = useState(false);

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold text-text-primary">
          {t("auth.onboarding.database.title", "Database Setup")}
        </h2>
        <p className="text-sm text-text-primary/60">
          {t(
            "auth.onboarding.database.subtitle",
            "Choose where your data will be stored",
          )}
        </p>
      </div>

      <div className="space-y-3">
        {/* SQLite option */}
        <button
          type="button"
          onClick={() => onDatabaseTypeChange("sqlite")}
          className={`w-full p-4 rounded-xl border text-left transition-all duration-200 ${
            databaseType === "sqlite"
              ? "border-accent bg-accent/10"
              : "border-white/10 hover:border-white/20 bg-white/5"
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                databaseType === "sqlite"
                  ? "border-accent"
                  : "border-white/30"
              }`}
            >
              {databaseType === "sqlite" && (
                <div className="w-2 h-2 rounded-full bg-accent" />
              )}
            </div>
            <div>
              <div className="font-medium text-text-primary text-sm">
                {t("auth.onboarding.database.sqlite_title", "Local (SQLite)")}
              </div>
              <div className="text-xs text-text-primary/50 mt-0.5">
                {t(
                  "auth.onboarding.database.sqlite_desc",
                  "Store data locally on this device. Best for single-user setups.",
                )}
              </div>
            </div>
          </div>
        </button>

        {/* PostgreSQL option */}
        <button
          type="button"
          onClick={() => onDatabaseTypeChange("postgresql")}
          className={`w-full p-4 rounded-xl border text-left transition-all duration-200 ${
            databaseType === "postgresql"
              ? "border-accent bg-accent/10"
              : "border-white/10 hover:border-white/20 bg-white/5"
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                databaseType === "postgresql"
                  ? "border-accent"
                  : "border-white/30"
              }`}
            >
              {databaseType === "postgresql" && (
                <div className="w-2 h-2 rounded-full bg-accent" />
              )}
            </div>
            <div>
              <div className="font-medium text-text-primary text-sm">
                {t(
                  "auth.onboarding.database.postgres_title",
                  "Remote (PostgreSQL)",
                )}
              </div>
              <div className="text-xs text-text-primary/50 mt-0.5">
                {t(
                  "auth.onboarding.database.postgres_desc",
                  "Connect to a PostgreSQL database. Ideal for shared or cloud setups.",
                )}
              </div>
            </div>
          </div>
        </button>
      </div>

      {/* PostgreSQL URL input */}
      {databaseType === "postgresql" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-primary/70 uppercase tracking-wide">
              {t(
                "auth.onboarding.database.postgres_url_label",
                "PostgreSQL Connection URL",
              )}
            </label>
            <div className="relative">
              <input
                type={showUrl ? "text" : "password"}
                value={postgresUrl}
                onChange={(e) => onPostgresUrlChange(e.target.value)}
                placeholder="postgresql://user:password@host:5432/dbname"
                className="w-full input-field pr-10 font-mono text-xs"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setShowUrl(!showUrl)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-primary/40 hover:text-text-primary/70 transition-colors"
              >
                {showUrl ? (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-xs text-text-primary/40">
              {t(
                "auth.onboarding.database.postgres_url_hint",
                "Format: postgresql://username:password@host:port/database",
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={onTestConnection}
            disabled={isTesting || !postgresUrl.trim()}
            className="w-full py-2 px-4 rounded-lg border border-white/10 text-sm text-text-primary/70 hover:text-text-primary hover:border-white/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isTesting ? (
              <>
                <svg
                  className="animate-spin w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                {t("auth.onboarding.database.testing", "Testing...")}
              </>
            ) : (
              t("auth.onboarding.database.test_connection", "Test Connection")
            )}
          </button>

          {testResult && (
            <div
              className={`p-3 rounded-lg text-xs ${
                testResult.success
                  ? "bg-green-500/10 border border-green-500/20 text-green-400"
                  : "bg-red-500/10 border border-red-500/20 text-red-400"
              }`}
            >
              {testResult.success
                ? t(
                    "auth.onboarding.database.test_success",
                    "Connection successful",
                  )
                : testResult.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
