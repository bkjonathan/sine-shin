import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";
type AccentColor = "blue" | "purple" | "pink" | "cyan" | "green";

interface ThemeSettings {
  theme: Theme;
  accentColor: AccentColor;
  animations: boolean;
  compactMode: boolean;
}

interface ThemeContextType extends ThemeSettings {
  setTheme: (theme: Theme) => void;
  setAccentColor: (color: AccentColor) => void;
  setAnimations: (enabled: boolean) => void;
  setCompactMode: (enabled: boolean) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = "sine_shin_theme_settings";

const DEFAULT_SETTINGS: ThemeSettings = {
  theme: "dark",
  accentColor: "blue",
  animations: true,
  compactMode: false,
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<ThemeSettings>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored
      ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
      : DEFAULT_SETTINGS;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    applyTheme(settings);
  }, [settings]);

  const applyTheme = (s: ThemeSettings) => {
    const root = document.documentElement;

    // 1. Set theme attribute for CSS selectors
    root.setAttribute("data-theme", s.theme);

    // 2. Set accent color CSS variables
    // These mappings correspond to Tailwind colors or hex codes
    const accents: Record<AccentColor, { primary: string; secondary: string }> =
      {
        blue: { primary: "#5b7fff", secondary: "#4c66cc" },
        purple: { primary: "#a855f7", secondary: "#9333ea" },
        pink: { primary: "#ec4899", secondary: "#db2777" },
        cyan: { primary: "#06b6d4", secondary: "#0891b2" },
        green: { primary: "#10b981", secondary: "#059669" },
      };

    const colors = accents[s.accentColor];
    root.style.setProperty("--color-accent-primary", colors.primary);
    root.style.setProperty("--color-accent-secondary", colors.secondary);

    // Also set specific semantic variables if needed,
    // or we can just rely on generic --color-accent-primary in CSS.
    // Let's update the specific ones used in existing CSS if we want to override them directly,
    // but the plan is to refactor CSS to use generic variables.

    // 3. Handle animations
    if (!s.animations) {
      root.style.setProperty("--transition-speed", "0s");
      root.classList.add("disable-animations");
    } else {
      root.style.removeProperty("--transition-speed");
      root.classList.remove("disable-animations");
    }

    // 4. Handle compact mode
    if (s.compactMode) {
      root.classList.add("compact-mode");
    } else {
      root.classList.remove("compact-mode");
    }
  };

  const updateSetting = <K extends keyof ThemeSettings>(
    key: K,
    value: ThemeSettings[K],
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const value: ThemeContextType = {
    ...settings,
    setTheme: (theme) => updateSetting("theme", theme),
    setAccentColor: (color) => updateSetting("accentColor", color),
    setAnimations: (enabled) => updateSetting("animations", enabled),
    setCompactMode: (enabled) => updateSetting("compactMode", enabled),
    toggleTheme: () =>
      updateSetting("theme", settings.theme === "dark" ? "light" : "dark"),
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
