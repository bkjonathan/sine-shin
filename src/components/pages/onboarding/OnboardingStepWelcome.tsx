import { useTranslation } from "react-i18next";
import { Button } from "../../ui";
import { IconChevronRight, IconHome } from "../../icons";

interface OnboardingStepWelcomeProps {
  onNext: () => void;
  onRestore: () => void;
}

export default function OnboardingStepWelcome({
  onNext,
  onRestore,
}: OnboardingStepWelcomeProps) {
  const { t } = useTranslation();

  return (
    <div className="text-center py-8">
      <div className="mx-auto w-20 h-20 rounded-[1.25rem] bg-linear-to-br from-accent-blue to-accent-purple flex items-center justify-center mb-6 shadow-[0_8px_30px_rgba(91,127,255,0.3)]">
        <IconHome size={36} strokeWidth={1.8} stroke="white" />
      </div>

      <h1 className="text-3xl font-bold text-text-primary mb-3 tracking-tight">
        {t("auth.onboarding.welcome_title")}
      </h1>
      <p className="text-text-secondary text-sm leading-relaxed mb-10 max-w-[280px] mx-auto">
        {t("auth.onboarding.welcome_subtitle")}
      </p>

      <Button variant="primary" className="px-10 py-3.5 text-base" onClick={onNext}>
        {t("auth.onboarding.get_started")}
        <IconChevronRight size={16} strokeWidth={2} />
      </Button>

      <div className="mt-6">
        <Button
          variant="ghost"
          className="text-sm text-text-muted hover:text-text-primary px-6 py-2"
          onClick={onRestore}
        >
          {t("auth.onboarding.restore_backup", "Restore from Backup")}
        </Button>
      </div>
    </div>
  );
}
