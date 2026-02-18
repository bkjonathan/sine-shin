import { useEffect, useState } from "react";
import { Routes, Route, useNavigate, Navigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import AppLayout from "./components/AppLayout";
import OnboardingForm from "./components/OnboardingForm";
import Dashboard from "./components/Dashboard";
import Orders from "./components/Orders";
import Expenses from "./components/Expenses";
import AccountBook from "./components/AccountBook";
import Customers from "./components/Customers";
import CustomerDetail from "./components/CustomerDetail";
import OrderDetail from "./components/OrderDetail";
import Settings from "./components/Settings.tsx";
import Reports from "./components/Reports";
import { ThemeProvider } from "./context/ThemeContext";
import { SoundProvider } from "./context/SoundContext";
import { AppSettingsProvider } from "./context/AppSettingsContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import "./index.css";
import { useTranslation } from "react-i18next";

import Login from "./components/Login";

function AppRoutes() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [isOnboarded, setIsOnboarded] = useState(false);

  useEffect(() => {
    checkOnboarding();
    loadSettings();
  }, []);

  const { i18n } = useTranslation();

  const loadSettings = async () => {
    try {
      const settings = await invoke<{ language: string }>("get_app_settings");
      if (settings.language && settings.language !== i18n.language) {
        i18n.changeLanguage(settings.language);
      }
    } catch (err) {
      console.error("Failed to load app settings:", err);
    }
  };

  // Re-navigate when auth state changes (e.g. after login)
  useEffect(() => {
    if (isAppLoading || authLoading) return;
    if (isOnboarded && isAuthenticated) {
      if (
        window.location.pathname === "/" ||
        window.location.pathname === "/login"
      ) {
        navigate("/dashboard", { replace: true });
      }
    }
  }, [isAuthenticated, authLoading]);

  const checkOnboarding = async () => {
    try {
      if (window.__TAURI_INTERNALS__) {
        const result = await invoke<boolean>("check_is_onboarded");
        setIsOnboarded(result);

        if (!result) {
          navigate("/onboarding", { replace: true });
        } else if (!isAuthenticated) {
          navigate("/login", { replace: true });
        } else {
          if (window.location.pathname === "/") {
            navigate("/dashboard", { replace: true });
          }
        }
      } else {
        // Browser mode — use localStorage to remember onboarding
        const browserOnboarded =
          localStorage.getItem("browser_onboarded") === "true";
        setIsOnboarded(browserOnboarded);

        if (!browserOnboarded) {
          navigate("/onboarding", { replace: true });
        } else if (!isAuthenticated) {
          navigate("/login", { replace: true });
        } else {
          if (window.location.pathname === "/") {
            navigate("/dashboard", { replace: true });
          }
        }
      }
    } catch (err) {
      console.error("Failed to check onboarding status:", err);
      navigate("/onboarding", { replace: true });
    } finally {
      setIsAppLoading(false);
    }
  };

  if (isAppLoading || authLoading) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center">
        <div className="liquid-gradient">
          <div className="liquid-blob-1" />
          <div className="liquid-blob-2" />
          <div className="liquid-blob-3" />
        </div>
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-glass-border border-t-accent-blue rounded-full animate-spin" />
          <p className="text-text-muted text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Onboarding — Full screen, no layout shell */}
      <Route path="/onboarding" element={<OnboardingForm />} />

      {/* Login - Full screen */}
      <Route path="/login" element={<Login />} />

      {/* App shell with sidebar protection */}
      <Route
        element={
          isAuthenticated ? <AppLayout /> : <Navigate to="/login" replace />
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/account-book" element={<AccountBook />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/:id" element={<CustomerDetail />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
        <Route path="/settings" element={<Settings />} />
      </Route>

      {/* Fallback */}
      <Route
        path="*"
        element={
          <Navigate
            to={
              isOnboarded
                ? isAuthenticated
                  ? "/dashboard"
                  : "/login"
                : "/onboarding"
            }
            replace
          />
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <AppSettingsProvider>
      <ThemeProvider>
        <SoundProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </SoundProvider>
      </ThemeProvider>
    </AppSettingsProvider>
  );
}

export default App;
