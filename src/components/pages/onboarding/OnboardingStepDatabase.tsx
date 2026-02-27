import { useTranslation } from "react-i18next";
import { Database, Server, Check } from "lucide-react";
import { Input } from "../../ui";

interface OnboardingStepDatabaseProps {
  dbType: string;
  pgUrl: string;
  onDbTypeChange: (value: string) => void;
  onPgUrlChange: (value: string) => void;
}

export default function OnboardingStepDatabase({
  dbType,
  pgUrl,
  onDbTypeChange,
  onPgUrlChange,
}: OnboardingStepDatabaseProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold text-text-primary mb-1">
          {t("auth.onboarding.database_title", "Database Setup")}
        </h2>
        <p className="text-sm text-text-muted">
          {t(
            "auth.onboarding.database_subtitle",
            "Choose where your application data is stored.",
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <button
          onClick={() => onDbTypeChange("sqlite")}
          className={`
            relative p-4 rounded-xl border flex flex-col items-center justify-center gap-3 transition-all duration-300
            ${
              dbType === "sqlite"
                ? "bg-accent-blue/10 border-accent-blue/50 text-accent-blue"
                : "bg-background-tertiary/30 border-white/5 text-text-secondary hover:border-white/10 hover:bg-background-tertiary/50"
            }
          `}
        >
          {dbType === "sqlite" && (
            <div className="absolute top-2 right-2">
              <Check size={16} className="text-accent-blue" />
            </div>
          )}
          <div
            className={`p-3 rounded-full ${
              dbType === "sqlite" ? "bg-accent-blue/20" : "bg-white/5"
            }`}
          >
            <Database size={24} />
          </div>
          <div className="text-center">
            <h3 className="font-semibold text-sm mb-1">
              {t("settings.database.sqlite_title", "Local Database")}
            </h3>
            <p className="text-[10px] text-text-muted leading-tight">
              {t(
                "settings.database.sqlite_desc",
                "Stores data on this device. No setup required.",
              )}
            </p>
          </div>
        </button>

        <button
          onClick={() => onDbTypeChange("postgres")}
          className={`
            relative p-4 rounded-xl border flex flex-col items-center justify-center gap-3 transition-all duration-300
            ${
              dbType === "postgres"
                ? "bg-accent-purple/10 border-accent-purple/50 text-accent-purple"
                : "bg-background-tertiary/30 border-white/5 text-text-secondary hover:border-white/10 hover:bg-background-tertiary/50"
            }
          `}
        >
          {dbType === "postgres" && (
            <div className="absolute top-2 right-2">
              <Check size={16} className="text-accent-purple" />
            </div>
          )}
          <div
            className={`p-3 rounded-full ${
              dbType === "postgres" ? "bg-accent-purple/20" : "bg-white/5"
            }`}
          >
            <Server size={24} />
          </div>
          <div className="text-center">
            <h3 className="font-semibold text-sm mb-1">PostgreSQL</h3>
            <p className="text-[10px] text-text-muted leading-tight">
              {t(
                "settings.database.postgres_desc",
                "Connect to an external PostgreSQL database.",
              )}
            </p>
          </div>
        </button>
      </div>

      {dbType === "postgres" && (
        <div className="animate-in fade-in slide-in-from-top-4 duration-300">
          <label className="block text-sm font-medium text-text-secondary mb-2">
            {t("settings.database.pg_url", "Connection URL")}{" "}
            <span className="text-error">*</span>
          </label>
          <Input
            type="text"
            className="input-liquid"
            placeholder="postgresql://user:password@host:port/dbname"
            value={pgUrl}
            onChange={(e) => onPgUrlChange(e.target.value)}
            autoFocus
          />
          <p className="text-[11px] text-text-muted mt-2">
            {t(
              "settings.database.pg_url_hint",
              "Example: postgresql://postgres:postgres@localhost/shop",
            )}
          </p>
        </div>
      )}
    </div>
  );
}
