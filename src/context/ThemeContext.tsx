import React, { createContext, useContext, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type Theme = "light" | "dark";
type AccentColor = "blue" | "purple" | "pink" | "cyan" | "green";

interface ThemeSettings {
  theme: Theme;
  accentColor: AccentColor;
  animations: boolean;
  compactMode: boolean;
  fontSize: string;
}

interface ThemeContextType extends ThemeSettings {
  setTheme: (theme: Theme) => void;
  setAccentColor: (color: AccentColor) => void;
  setAnimations: (enabled: boolean) => void;
  setCompactMode: (enabled: boolean) => void;
  setFontSize: (size: string) => void;
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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<ThemeSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings from backend on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        if (window.__TAURI_INTERNALS__) {
          const appSettings = await invoke<{
            language: string;
            sound_effect: boolean;
            theme: string;
            accent_color: string;
            font_size: string;
          }>("get_app_settings");

          // We only store theme in backend for now, other visual prefs still in local storage or could be moved too.
          // For now, let's prioritize the backend "theme" field if it exists.
          if (appSettings.theme) {
            const validTheme = appSettings.theme === "light" ? "light" : "dark";
            setSettings((prev) => ({
              ...prev,
              theme: validTheme,
              accentColor: (appSettings.accent_color as AccentColor) || "blue",
              fontSize: appSettings.font_size || "normal",
            }));
          }
        } else {
          // Fallback for browser mode
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored) {
            setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
          }
        }
      } catch (err) {
        console.error("Failed to load theme settings:", err);
      } finally {
        setIsLoaded(true);
      }
    };
    loadSettings();
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      applyTheme(settings);
    }
  }, [settings, isLoaded]);

  const applyTheme = (s: ThemeSettings) => {
    const root = document.documentElement;
    root.setAttribute("data-theme", s.theme);

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

    if (!s.animations) {
      root.style.setProperty("--transition-speed", "0s");
      root.classList.add("disable-animations");
    } else {
      root.style.removeProperty("--transition-speed");
      root.classList.remove("disable-animations");
    }

    if (s.compactMode) {
      root.classList.add("compact-mode");
    } else {
      root.classList.remove("compact-mode");
    }

    // Font size
    root.classList.remove(
      "font-size-small",
      "font-size-large",
      "font-size-extra-large",
    );
    if (s.fontSize === "small") {
      root.classList.add("font-size-small");
    } else if (s.fontSize === "large") {
      root.classList.add("font-size-large");
    } else if (s.fontSize === "extra-large") {
      root.classList.add("font-size-extra-large");
    }
  };

  const updateBackend = async (
    newTheme: Theme,
    newAccent: AccentColor,
    newFontSize?: string,
  ) => {
    if (window.__TAURI_INTERNALS__) {
      try {
        const currentSettings = await invoke<{
          language: string;
          sound_effect: boolean;
          theme: String;
          accent_color: String;
          font_size: String;
        }>("get_app_settings");

        await invoke("update_app_settings", {
          settings: {
            ...currentSettings,
            theme: newTheme,
            accent_color: newAccent,
            font_size: newFontSize ?? currentSettings.font_size ?? "normal",
          },
        });
      } catch (err) {
        console.error("Failed to sync theme to backend:", err);
      }
    }
  };

  const updateSetting = <K extends keyof ThemeSettings>(
    key: K,
    value: ThemeSettings[K],
  ) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "theme") {
        updateBackend(value as Theme, next.accentColor, next.fontSize);
      } else if (key === "accentColor") {
        updateBackend(next.theme, value as AccentColor, next.fontSize);
      } else if (key === "fontSize") {
        updateBackend(next.theme, next.accentColor, value as string);
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

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
