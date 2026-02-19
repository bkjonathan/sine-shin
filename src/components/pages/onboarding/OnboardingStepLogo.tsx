import { useTranslation } from "react-i18next";
import { IconImage } from "../../icons";

interface OnboardingStepLogoProps {
  logoPath: string;
  logoPreview: string;
  onPickLogo: () => void;
}

export default function OnboardingStepLogo({
  logoPath,
  logoPreview,
  onPickLogo,
}: OnboardingStepLogoProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
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
          onClick={onPickLogo}
          className="
            w-40 h-40 rounded-full
            bg-glass-white backdrop-blur-lg
            border-2 border-dashed border-glass-border
            flex flex-col items-center justify-center gap-2
            cursor-pointer transition-all duration-300
            hover:border-accent-blue hover:bg-glass-white-hover
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
    </div>
  );
}
