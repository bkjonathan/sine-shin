import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  getAppSettings,
  reloadScheduler,
  updateAppSettings,
} from "../api/appApi";
import type { AppSettings } from "../types/settings";

interface AppSettingsContextType extends AppSettings {
  setLanguage: (language: string) => Promise<void>;
  setCurrency: (currency: string) => Promise<void>;
  setCurrencySymbol: (symbol: string) => Promise<void>;
  setExchangeCurrency: (currency: string) => Promise<void>;
  setExchangeCurrencySymbol: (symbol: string) => Promise<void>;
  setInvoicePrinterName: (name: string) => Promise<void>;
  setSilentInvoicePrint: (enabled: boolean) => Promise<void>;
  setAutoBackup: (enabled: boolean) => Promise<void>;
  setBackupFrequency: (frequency: string) => Promise<void>;
  setBackupTime: (time: string) => Promise<void>;
  setFontSize: (size: string) => Promise<void>;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  formatPrice: (amount: number) => string;
}

const AppSettingsContext = createContext<AppSettingsContextType | undefined>(
  undefined,
);

const DEFAULT_SETTINGS = {
  language: "en",
  sound_effect: true,
  theme: "dark",
  accent_color: "blue",
  currency: "USD",
  currency_symbol: "$",
  exchange_currency: "MMK",
  exchange_currency_symbol: "Ks",
  invoice_printer_name: "",
  silent_invoice_print: true,
  auto_backup: true,
  backup_frequency: "never",
  backup_time: "23:00",
  font_size: "normal",
  aws_access_key_id: "",
  aws_secret_access_key: "",
  aws_region: "",
  aws_bucket_name: "",
  imagekit_base_url: "",
  database_kind: "sqlite",
  postgresql_url: "",
} satisfies AppSettings;

export function AppSettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const settingsRef = useRef<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const fetchSettings = useCallback(async (): Promise<void> => {
    try {
      if (!window.__TAURI_INTERNALS__) {
        return;
      }

      const data = await getAppSettings();
      setSettings({ ...DEFAULT_SETTINGS, ...data });
    } catch (err) {
      console.error("Failed to fetch app settings:", err);
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const persistSettings = useCallback(async (nextSettings: AppSettings) => {
    await updateAppSettings(nextSettings);
    await reloadScheduler();
  }, []);

  const updateSettings = useCallback(
    async (newSettings: Partial<AppSettings>): Promise<void> => {
      if (!window.__TAURI_INTERNALS__) {
        setSettings((prev) => ({ ...prev, ...newSettings }));
        return;
      }

      const updatedSettings = { ...settingsRef.current, ...newSettings };
      setSettings(updatedSettings);

      try {
        await persistSettings(updatedSettings);
      } catch (err) {
        console.error("Failed to update settings:", err);
        await fetchSettings();
      }
    },
    [fetchSettings, persistSettings],
  );

  const setLanguage = useCallback(
    async (language: string): Promise<void> => {
      await updateSettings({ language });
    },
    [updateSettings],
  );

  const setCurrency = useCallback(
    async (currency: string): Promise<void> => {
      await updateSettings({ currency });
    },
    [updateSettings],
  );

  const setCurrencySymbol = useCallback(
    async (currency_symbol: string): Promise<void> => {
      await updateSettings({ currency_symbol });
    },
    [updateSettings],
  );

  const setExchangeCurrency = useCallback(
    async (exchange_currency: string): Promise<void> => {
      await updateSettings({ exchange_currency });
    },
    [updateSettings],
  );

  const setExchangeCurrencySymbol = useCallback(
    async (exchange_currency_symbol: string): Promise<void> => {
      await updateSettings({ exchange_currency_symbol });
    },
    [updateSettings],
  );

  const setInvoicePrinterName = useCallback(
    async (invoice_printer_name: string): Promise<void> => {
      await updateSettings({ invoice_printer_name });
    },
    [updateSettings],
  );

  const setSilentInvoicePrint = useCallback(
    async (silent_invoice_print: boolean): Promise<void> => {
      await updateSettings({ silent_invoice_print });
    },
    [updateSettings],
  );

  const setAutoBackup = useCallback(
    async (auto_backup: boolean): Promise<void> => {
      await updateSettings({ auto_backup });
    },
    [updateSettings],
  );

  const setBackupFrequency = useCallback(
    async (backup_frequency: string): Promise<void> => {
      await updateSettings({ backup_frequency });
    },
    [updateSettings],
  );

  const setBackupTime = useCallback(
    async (backup_time: string): Promise<void> => {
      await updateSettings({ backup_time });
    },
    [updateSettings],
  );

  const setFontSize = useCallback(
    async (font_size: string): Promise<void> => {
      await updateSettings({ font_size: font_size as AppSettings["font_size"] });
    },
    [updateSettings],
  );

  const formatPrice = useCallback(
    (amount: number): string => {
      const formattedNumber = new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(amount);

      return `${settings.currency_symbol} ${formattedNumber}`;
    },
    [settings.currency_symbol],
  );

  const value: AppSettingsContextType = {
    ...settings,
    setLanguage,
    setCurrency,
    setCurrencySymbol,
    setExchangeCurrency,
    setExchangeCurrencySymbol,
    setInvoicePrinterName,
    setSilentInvoicePrint,
    setAutoBackup,
    setBackupFrequency,
    setBackupTime,
    setFontSize,
    updateSettings,
    formatPrice,
  };

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
    </AppSettingsContext.Provider>
  );
}

/**
 * Provides strongly typed read/write access to persisted app settings.
 */
export function useAppSettings(): AppSettingsContextType {
  const context = useContext(AppSettingsContext);
  if (context === undefined) {
    throw new Error("useAppSettings must be used within a AppSettingsProvider");
  }

  return context;
}
