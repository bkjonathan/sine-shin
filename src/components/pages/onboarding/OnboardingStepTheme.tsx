import { useTranslation } from "react-i18next";
import { IconCheck } from "../../icons";
import {
  OnboardingAccentColor,
  OnboardingTheme,
} from "../../../types/onboarding";

interface OnboardingStepThemeProps {
  theme: OnboardingTheme;
  accentColor: OnboardingAccentColor;
  setTheme: (theme: OnboardingTheme) => void;
  setAccentColor: (color: OnboardingAccentColor) => void;
}

const accentColors: OnboardingAccentColor[] = [
  "blue",
  "purple",
  "pink",
  "cyan",
  "green",
];

function getAccentColorVar(color: OnboardingAccentColor): string {
  if (color === "blue") return "var(--color-accent-primary)";
  if (color === "purple") return "var(--color-accent-purple)";
  if (color === "pink") return "var(--color-accent-pink)";
  if (color === "cyan") return "var(--color-accent-cyan)";
  return "var(--color-accent-green)";
}

function getAccentColorFallback(color: OnboardingAccentColor): string {
  if (color === "blue") return "#5b7fff";
  if (color === "purple") return "#a855f7";
  if (color === "pink") return "#ec4899";
  if (color === "cyan") return "#06b6d4";
  return "#10b981";
}

export default function OnboardingStepTheme({
  theme,
  accentColor,
  setTheme,
  setAccentColor,
}: OnboardingStepThemeProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-text-primary mb-1">
          {t("settings.appearance")}
        </h2>
        <p className="text-sm text-text-muted">
          {t("settings.appearance_desc")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => setTheme("light")}
          className={`
            relative p-4 rounded-xl border-2 transition-all duration-300
            flex flex-col items-center gap-3
            ${
              theme === "light"
                ? "bg-glass-white border-accent-blue shadow-[0_0_20px_rgba(91,127,255,0.15)]"
                : "bg-glass-white border-glass-border hover:border-glass-border-light hover:bg-glass-white-hover"
            }
          `}
        >
          <div className="w-full aspect-video rounded-lg bg-[#f4f5fa] border border-gray-200 relative overflow-hidden">
            <div className="absolute top-2 left-2 w-8 h-2 bg-white rounded-sm shadow-sm" />
            <div className="absolute top-6 left-2 right-2 bottom-2 bg-white rounded-sm shadow-sm" />
          </div>
          <span
            className={`text-sm font-medium ${theme === "light" ? "text-text-primary" : "text-text-secondary"}`}
          >
            {t("settings.light_mode")}
          </span>
          {theme === "light" && (
            <div className="absolute top-2 right-2 w-5 h-5 bg-accent-blue rounded-full flex items-center justify-center">
              <IconCheck size={12} strokeWidth={3} stroke="white" />
            </div>
          )}
        </button>

        <button
          onClick={() => setTheme("dark")}
          className={`
            relative p-4 rounded-xl border-2 transition-all duration-300
            flex flex-col items-center gap-3
            ${
              theme === "dark"
                ? "bg-glass-white border-accent-blue shadow-[0_0_20px_rgba(91,127,255,0.15)]"
                : "bg-glass-white border-glass-border hover:border-glass-border-light hover:bg-glass-white-hover"
            }
          `}
        >
          <div className="w-full aspect-video rounded-lg bg-[#0a0a1a] border border-white/10 relative overflow-hidden">
            <div className="absolute top-2 left-2 w-8 h-2 bg-white/10 rounded-sm" />
            <div className="absolute top-6 left-2 right-2 bottom-2 bg-white/5 rounded-sm" />
          </div>
          <span
            className={`text-sm font-medium ${theme === "dark" ? "text-text-primary" : "text-text-secondary"}`}
          >
            {t("settings.dark_mode")}
          </span>
          {theme === "dark" && (
            <div className="absolute top-2 right-2 w-5 h-5 bg-accent-blue rounded-full flex items-center justify-center">
              <IconCheck size={12} strokeWidth={3} stroke="white" />
            </div>
          )}
        </button>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-medium text-text-primary mb-3">
          {t("settings.accent_color")}
        </h3>
        <div className="flex items-center justify-center gap-4">
          {accentColors.map((color) => (
            <button
              key={color}
              onClick={() => setAccentColor(color)}
              className={`
                w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300
                ${
                  accentColor === color
                    ? "scale-110 ring-2 ring-offset-2 ring-offset-glass-bg ring-text-primary shadow-lg"
                    : "hover:scale-110 hover:shadow-md opacity-80 hover:opacity-100"
                }
              `}
              style={{
                background: getAccentColorVar(color),
                backgroundColor: getAccentColorFallback(color),
              }}
            >
              {accentColor === color && (
                <IconCheck size={16} strokeWidth={3} stroke="white" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
