import { useTranslation } from "react-i18next";
import { Input } from "../../ui";

interface OnboardingStepDetailsProps {
  shopName: string;
  phone: string;
  address: string;
  onShopNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onAddressChange: (value: string) => void;
}

export default function OnboardingStepDetails({
  shopName,
  phone,
  address,
  onShopNameChange,
  onPhoneChange,
  onAddressChange,
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
          className="input-liquid min-h-[80px] py-2"
          placeholder={t("settings.account.address_placeholder")}
          value={address}
          onChange={(e) => onAddressChange(e.target.value)}
        />
      </div>
    </div>
  );
}
