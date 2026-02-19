interface OnboardingLanguageSwitcherProps {
  language: string;
  onToggle: () => void;
}

export default function OnboardingLanguageSwitcher({
  language,
  onToggle,
}: OnboardingLanguageSwitcherProps) {
  return (
    <div className="fixed top-6 right-6 z-50">
      <button
        onClick={onToggle}
        className="
          flex items-center gap-2 px-3 py-1.5 rounded-full
          bg-glass-white hover:bg-glass-white-hover backdrop-blur-md
          border border-glass-border transition-all duration-300
          text-sm text-text-primary font-medium
          group
        "
      >
        <span
          className={`opacity-60 group-hover:opacity-100 ${language === "en" ? "text-accent-blue font-bold opacity-100" : ""}`}
        >
          EN
        </span>
        <div className="h-3 w-px bg-glass-border-light" />
        <span
          className={`opacity-60 group-hover:opacity-100 ${language === "mm" ? "text-accent-blue font-bold opacity-100" : ""}`}
        >
          MM
        </span>
      </button>
    </div>
  );
}
