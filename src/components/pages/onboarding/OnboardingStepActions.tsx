import { useTranslation } from "react-i18next";
import { Button } from "../../ui";
import { IconCheck, IconChevronLeft, IconChevronRight } from "../../icons";
import { OnboardingStep } from "../../../types/onboarding";

interface OnboardingStepActionsProps {
  currentStep: OnboardingStep;
  isSubmitting: boolean;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
}

export default function OnboardingStepActions({
  currentStep,
  isSubmitting,
  onBack,
  onNext,
  onSubmit,
}: OnboardingStepActionsProps) {
  const { t } = useTranslation();

  if (currentStep === 0) return null;

  return (
    <div className="flex items-center justify-between mt-8">
      <Button variant="ghost" onClick={onBack}>
        <IconChevronLeft size={16} strokeWidth={2} />
        {t("auth.onboarding.back")}
      </Button>

      {currentStep < 4 ? (
        <Button variant="primary" onClick={onNext}>
          {t("auth.onboarding.next")}
          <IconChevronRight size={16} strokeWidth={2} />
        </Button>
      ) : (
        <Button
          variant="primary"
          onClick={onSubmit}
          loading={isSubmitting}
          loadingText={t("auth.onboarding.saving")}
        >
          <>
            {t("auth.onboarding.complete_setup")}
            <IconCheck size={16} strokeWidth={2} />
          </>
        </Button>
      )}
    </div>
  );
}
