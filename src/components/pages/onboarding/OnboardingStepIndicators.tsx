import { OnboardingStep } from "../../../types/onboarding";

interface OnboardingStepIndicatorsProps {
  currentStep: OnboardingStep;
}

const steps: OnboardingStep[] = [0, 1, 2, 3, 4];

export default function OnboardingStepIndicators({
  currentStep,
}: OnboardingStepIndicatorsProps) {
  return (
    <div className="fixed top-8 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3">
      {steps.map((step) => (
        <div key={step} className="relative flex items-center justify-center">
          <div
            className={`
              w-2.5 h-2.5 rounded-full transition-all duration-500
              ${
                currentStep === step
                  ? "bg-text-primary scale-125 shadow-[0_0_12px_rgba(255,255,255,0.5)]"
                  : currentStep > step
                    ? "bg-text-primary/60"
                    : "bg-text-primary/20"
              }
            `}
          />
          {step < 4 && (
            <div
              className={`w-8 h-px ml-3 transition-all duration-500 ${
                currentStep > step ? "bg-text-primary/40" : "bg-text-primary/10"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
