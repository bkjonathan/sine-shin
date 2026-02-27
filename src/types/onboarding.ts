export type OnboardingStep = 0 | 1 | 2 | 3 | 4 | 5;

export type OnboardingTheme = "light" | "dark";
export type OnboardingAccentColor =
  | "blue"
  | "purple"
  | "pink"
  | "cyan"
  | "green";

export interface OnboardingAppSettings {
  language: string;
  sound_effect: boolean;
  theme?: string;
  accent_color?: string;
}
