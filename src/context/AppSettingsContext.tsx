import React, { createContext, useContext, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface AppSettings {
  language: string;
  sound_effect: boolean;
  theme: string;
  accent_color: string;
  currency: string;
  currency_symbol: string;
  exchange_currency: string;
  exchange_currency_symbol: string;
  invoice_printer_name: string;
  silent_invoice_print: boolean;
}

interface AppSettingsContextType extends AppSettings {
  setLanguage: (language: string) => void;
  setCurrency: (currency: string) => void;
  setCurrencySymbol: (symbol: string) => void;
  setExchangeCurrency: (currency: string) => void;
  setExchangeCurrencySymbol: (symbol: string) => void;
  setInvoicePrinterName: (name: string) => void;
  setSilentInvoicePrint: (enabled: boolean) => void;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  formatPrice: (amount: number) => string;
}

const AppSettingsContext = createContext<AppSettingsContextType | undefined>(
  undefined,
);

const DEFAULT_SETTINGS: AppSettings = {
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
};

export function AppSettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      if (window.__TAURI_INTERNALS__) {
        const data = await invoke<AppSettings>("get_app_settings");
        // Ensure defaults if backend returns missing fields (though Rust struct has defaults)
        setSettings({ ...DEFAULT_SETTINGS, ...data });
      }
    } catch (err) {
      console.error("Failed to fetch app settings:", err);
    }
  };

  const updateSettings = async (newSettings: Partial<AppSettings>) => {
    try {
      if (window.__TAURI_INTERNALS__) {
        // Optimistic update
        const updated = { ...settings, ...newSettings };
        setSettings(updated);

        await invoke("update_app_settings", { settings: updated });
      }
    } catch (err) {
      console.error("Failed to update settings:", err);
      // Revert or fetch on error? strict adherence might imply revert, but for now log error
      fetchSettings();
    }
  };

  const setLanguage = (language: string) => updateSettings({ language });
  const setCurrency = (currency: string) => updateSettings({ currency });
  const setCurrencySymbol = (symbol: string) =>
    updateSettings({ currency_symbol: symbol });
  const setExchangeCurrency = (currency: string) =>
    updateSettings({ exchange_currency: currency });
  const setExchangeCurrencySymbol = (symbol: string) =>
    updateSettings({ exchange_currency_symbol: symbol });
  const setInvoicePrinterName = (name: string) =>
    updateSettings({ invoice_printer_name: name });
  const setSilentInvoicePrint = (enabled: boolean) =>
    updateSettings({ silent_invoice_print: enabled });

  const formatPrice = (amount: number) => {
    // If currency symbol is provided, use custom formatting
    // Otherwise fall back to Intl
    // For now simple implementations:
    // e.g. "$ 1,000.00" or "1,000 Ks" depending on locale preferences
    // But since we have a custom symbol, we can just prepend/append it.
    // Let's stick to a standard format: Symbol + Amount (formatted)

    // Check if we want symbol suffix or prefix? Usually prefix for $, suffix for Ks potentially?
    // For simplicity, let's look at the symbol. if it's "Ks", maybe suffix.
    // Actually standard Intl might be safer if we map currency code to locale.
    // But user wants custom symbol.

    const formattedNumber = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);

    return `${settings.currency_symbol} ${formattedNumber}`;
  };

  const value = {
    ...settings,
    setLanguage,
    setCurrency,
    setCurrencySymbol,
    setExchangeCurrency,
    setExchangeCurrencySymbol,
    setInvoicePrinterName,
    setSilentInvoicePrint,
    updateSettings,
    formatPrice,
  };

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  const context = useContext(AppSettingsContext);
  if (context === undefined) {
    throw new Error("useAppSettings must be used within a AppSettingsProvider");
  }
  return context;
}
