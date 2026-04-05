import { useTranslation } from "react-i18next";
import { Button, Input, Select } from "../../ui";
import type { DatabaseKind } from "../../../types/settings";

interface OnboardingStepDetailsProps {
  shopName: string;
  phone: string;
  address: string;
  databaseKind: DatabaseKind;
  postgresqlUrl: string;
  isTestingPostgresql: boolean;
  postgresqlConnectionOk: boolean | null;
  postgresqlConnectionMessage: string;
  /** True when the connected PostgreSQL database already has shop + user data. */
  postgresqlAlreadyOnboarded?: boolean | null;
  onShopNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onAddressChange: (value: string) => void;
  onDatabaseKindChange: (value: DatabaseKind) => void;
  onPostgresqlUrlChange: (value: string) => void;
  onTestPostgresqlConnection: () => void;
  /** Called when the user chooses to use an already-configured PostgreSQL database. */
  onConnectExistingPostgresql?: () => void;
}

export default function OnboardingStepDetails({
  shopName,
  phone,
  address,
  databaseKind,
  postgresqlUrl,
  isTestingPostgresql,
  postgresqlConnectionOk,
  postgresqlConnectionMessage,
  postgresqlAlreadyOnboarded,
  onShopNameChange,
  onPhoneChange,
  onAddressChange,
  onDatabaseKindChange,
  onPostgresqlUrlChange,
  onTestPostgresqlConnection,
  onConnectExistingPostgresql,
}: OnboardingStepDetailsProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="text-center mb-2">
        <h2 className="text-xl font-bold text-text-primary mb-1">
          {t("auth.onboarding.step1_title")}
        </h2>
        <p className="text-sm text-text-muted">{t("auth.onboarding.step1_subtitle")}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-[1.02fr_minmax(0,1fr)] md:items-start">
        <div className="rounded-2xl border border-glass-border bg-glass-white p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              {t("auth.onboarding.database_title", "Database")}
            </h3>
            <p className="text-xs text-text-muted mt-1 leading-relaxed">
              {t(
                "auth.onboarding.database_subtitle",
                "Choose where the app stores its main data. SQLite-only maintenance tools will be disabled when PostgreSQL is active.",
              )}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              {t("auth.onboarding.database_type", "Database Type")}
            </label>
            <Select
              className="w-full"
              value={databaseKind}
              onChange={(value) => onDatabaseKindChange(value.toString() as DatabaseKind)}
              options={[
                {
                  value: "sqlite",
                  label: t("auth.onboarding.database_sqlite", "SQLite"),
                },
                {
                  value: "postgresql",
                  label: t("auth.onboarding.database_postgresql", "PostgreSQL"),
                },
              ]}
              placeholder={t("auth.onboarding.database_type", "Database Type")}
            />
          </div>

          {databaseKind === "postgresql" && (
            <>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  {t("auth.onboarding.database_url", "PostgreSQL URL")}{" "}
                  <span className="text-error">*</span>
                </label>
                <Input
                  type="text"
                  className="input-liquid"
                  placeholder="postgresql://user:password@host:5432/database"
                  value={postgresqlUrl}
                  onChange={(e) => onPostgresqlUrlChange(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  className="px-4 py-2 text-xs font-semibold"
                  onClick={onTestPostgresqlConnection}
                  loading={isTestingPostgresql}
                  loadingText={t(
                    "auth.onboarding.database_testing",
                    "Testing...",
                  )}
                  disabled={!postgresqlUrl.trim()}
                >
                  {t(
                    "auth.onboarding.database_test_connection",
                    "Test Connection",
                  )}
                </Button>

                {postgresqlConnectionOk !== null && (
                  <span
                    className={`text-xs font-medium ${
                      postgresqlConnectionOk ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {postgresqlConnectionOk
                      ? t("auth.onboarding.database_connected", "Connected")
                      : t("auth.onboarding.database_failed", "Connection failed")}
                  </span>
                )}
              </div>

              {postgresqlConnectionMessage && (
                <div
                  className={`rounded-xl border px-3 py-2 text-xs leading-relaxed ${
                    postgresqlConnectionOk
                      ? "border-green-500/20 bg-green-500/10 text-green-300"
                      : "border-red-500/20 bg-red-500/10 text-red-300"
                  }`}
                >
                  {postgresqlConnectionMessage}
                </div>
              )}

              {postgresqlAlreadyOnboarded === true && (
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-3 space-y-2">
                  <p className="text-xs text-blue-300 leading-relaxed">
                    {t(
                      "auth.onboarding.database_already_onboarded",
                      "This database already has shop and user data. You can connect to it directly — no need to set up again.",
                    )}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full px-4 py-2 text-xs font-semibold border border-blue-500/30 text-blue-300 hover:bg-blue-500/10"
                    onClick={onConnectExistingPostgresql}
                  >
                    {t(
                      "auth.onboarding.database_connect_existing",
                      "Connect to Existing Database",
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              {t("auth.onboarding.shop_name")} <span className="text-error">*</span>
            </label>
            <Input
              type="text"
              className="input-liquid"
              placeholder={t("auth.onboarding.enter_shop_name")}
              value={shopName}
              onChange={(e) => onShopNameChange(e.target.value)}
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
              onChange={(e) => onPhoneChange(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              {t("settings.account.address")}
            </label>
            <textarea
              className="input-liquid min-h-[120px] py-2"
              placeholder={t("settings.account.address_placeholder")}
              value={address}
              onChange={(e) => onAddressChange(e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
