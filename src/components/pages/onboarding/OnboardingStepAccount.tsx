import { useTranslation } from "react-i18next";
import { Input } from "../../ui";

interface OnboardingStepAccountProps {
  username: string;
  password: string;
  confirmPassword: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
}

export default function OnboardingStepAccount({
  username,
  password,
  confirmPassword,
  onUsernameChange,
  onPasswordChange,
  onConfirmPasswordChange,
}: OnboardingStepAccountProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="text-center mb-2">
        <h2 className="text-xl font-bold text-text-primary mb-1">
          {t("auth.onboarding.step3_title")}
        </h2>
        <p className="text-sm text-text-muted">{t("auth.onboarding.step3_subtitle")}</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          {t("auth.login.username")} <span className="text-error">*</span>
        </label>
        <Input
          type="text"
          className="input-liquid"
          placeholder={t("auth.login.enter_username")}
          value={username}
          onChange={(e) => onUsernameChange(e.target.value)}
          minLength={3}
          maxLength={30}
          autoComplete="username"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          {t("auth.login.password")} <span className="text-error">*</span>
        </label>
        <Input
          type="password"
          className="input-liquid"
          placeholder={t("auth.login.enter_password")}
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          minLength={8}
          autoComplete="new-password"
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
          onChange={(e) => onConfirmPasswordChange(e.target.value)}
          minLength={8}
          autoComplete="new-password"
        />
      </div>
    </div>
  );
}
