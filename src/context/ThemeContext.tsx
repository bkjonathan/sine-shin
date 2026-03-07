import React, { createContext, useContext, useEffect, useState } from "react";

import { getAppSettings, updateAppSettings } from "../api/appApi";
import type {
  AccentColor,
  AppSettings,
  FontSize,
  ThemeMode,
} from "../types/settings";

interface ThemeSettings {
  theme: ThemeMode;
  accentColor: AccentColor;
  animations: boolean;
  compactMode: boolean;
  fontSize: FontSize;
}

interface ThemeContextType extends ThemeSettings {
  setTheme: (theme: ThemeMode) => void;
  setAccentColor: (color: AccentColor) => void;
  setAnimations: (enabled: boolean) => void;
  setCompactMode: (enabled: boolean) => void;
  setFontSize: (size: FontSize) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = "sine_shin_theme_settings";

const DEFAULT_SETTINGS: ThemeSettings = {
  theme: "dark",
  accentColor: "blue",
  animations: true,
  compactMode: false,
  fontSize: "normal",
};

const ACCENT_COLOR_MAP: Record<AccentColor, { primary: string; secondary: string }> = {
  blue: { primary: "#5b7fff", secondary: "#4c66cc" },
  purple: { primary: "#a855f7", secondary: "#9333ea" },
  pink: { primary: "#ec4899", secondary: "#db2777" },
  cyan: { primary: "#06b6d4", secondary: "#0891b2" },
  green: { primary: "#10b981", secondary: "#059669" },
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<ThemeSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        if (window.__TAURI_INTERNALS__) {
          const appSettings = await getAppSettings();
          setSettings((prev) => ({
            ...prev,
            theme: appSettings.theme,
            accentColor: appSettings.accent_color,
            fontSize: appSettings.font_size,
          }));
        } else {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored) {
            const parsed = JSON.parse(stored) as Partial<ThemeSettings>;
            setSettings({ ...DEFAULT_SETTINGS, ...parsed });
          }
        }
      } catch (err) {
        console.error("Failed to load theme settings:", err);
      } finally {
        setIsLoaded(true);
      }
    };

    void loadSettings();
  }, []);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    applyTheme(settings);
  }, [isLoaded, settings]);

  const applyTheme = (themeSettings: ThemeSettings): void => {
    const root = document.documentElement;
    root.setAttribute("data-theme", themeSettings.theme);

    const colors = ACCENT_COLOR_MAP[themeSettings.accentColor];
    root.style.setProperty("--color-accent-primary", colors.primary);
    root.style.setProperty("--color-accent-secondary", colors.secondary);

    if (!themeSettings.animations) {
      root.style.setProperty("--transition-speed", "0s");
      root.classList.add("disable-animations");
    } else {
      root.style.removeProperty("--transition-speed");
      root.classList.remove("disable-animations");
    }

    if (themeSettings.compactMode) {
      root.classList.add("compact-mode");
    } else {
      root.classList.remove("compact-mode");
    }

    root.classList.remove(
      "font-size-small",
      "font-size-large",
      "font-size-extra-large",
    );

    if (themeSettings.fontSize === "small") {
      root.classList.add("font-size-small");
    } else if (themeSettings.fontSize === "large") {
      root.classList.add("font-size-large");
    } else if (themeSettings.fontSize === "extra-large") {
      root.classList.add("font-size-extra-large");
    }
  };

  const syncThemeSettings = async (
    theme: ThemeMode,
    accentColor: AccentColor,
    fontSize: FontSize,
  ): Promise<void> => {
    if (!window.__TAURI_INTERNALS__) {
      return;
    }

    try {
      const currentSettings = await getAppSettings();
      const nextSettings: AppSettings = {
        ...currentSettings,
        theme,
        accent_color: accentColor,
        font_size: fontSize,
      };

      await updateAppSettings(nextSettings);
    } catch (err) {
      console.error("Failed to sync theme to backend:", err);
    }
  };

  const updateSetting = <K extends keyof ThemeSettings>(
    key: K,
    value: ThemeSettings[K],
  ) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "theme" || key === "accentColor" || key === "fontSize") {
        void syncThemeSettings(next.theme, next.accentColor, next.fontSize);
      }
      return next;
    });
  };

  const value: ThemeContextType = {
    ...settings,
    setTheme: (theme) => updateSetting("theme", theme),
    setAccentColor: (color) => updateSetting("accentColor", color),
    setAnimations: (enabled) => updateSetting("animations", enabled),
    setCompactMode: (enabled) => updateSetting("compactMode", enabled),
    setFontSize: (size) => updateSetting("fontSize", size),
    toggleTheme: () =>
      updateSetting("theme", settings.theme === "dark" ? "light" : "dark"),
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/**
 * Exposes theme preferences and visual toggles for the desktop UI shell.
 */
export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
}
