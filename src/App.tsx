import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { checkIsOnboarded, getAppLanguageSetting } from "./api/appApi";
import { AppSettingsProvider } from "./context/AppSettingsContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SoundProvider } from "./context/SoundContext";
import { ThemeProvider } from "./context/ThemeContext";

import "./index.css";

const AppLayout = lazy(() => import("./pages/AppLayout"));
const Login = lazy(() => import("./pages/Login"));
const OnboardingForm = lazy(() => import("./pages/OnboardingForm"));

function AppLoadingScreen() {
  const { t } = useTranslation();

  return (
    <div className="w-full min-h-screen flex items-center justify-center">
      <div className="liquid-gradient">
        <div className="liquid-blob-1" />
        <div className="liquid-blob-2" />
        <div className="liquid-blob-3" />
      </div>
      <div className="relative z-10 flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-glass-border border-t-accent-blue rounded-full animate-spin" />
        <p className="text-text-muted text-sm">
          {t("common.loading", "Loading...")}
        </p>
      </div>
    </div>
  );
}

function AppRoutes() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { i18n } = useTranslation();
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [isOnboarded, setIsOnboarded] = useState(false);

  const loadLanguageSetting = useCallback(async () => {
    try {
      const settings = await getAppLanguageSetting();
      if (settings.language && settings.language !== i18n.language) {
        await i18n.changeLanguage(settings.language);
      }
    } catch {
      // no-op: language fallback remains current UI language
    }
  }, [i18n]);

  const resolveOnboardingState = useCallback(async () => {
    try {
      if (window.__TAURI_INTERNALS__) {
        setIsOnboarded(await checkIsOnboarded());
      } else {
        setIsOnboarded(localStorage.getItem("browser_onboarded") === "true");
      }
    } finally {
      setIsAppLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.all([resolveOnboardingState(), loadLanguageSetting()]);
  }, [loadLanguageSetting, resolveOnboardingState]);

  useEffect(() => {
    if (isAppLoading || authLoading) {
      return;
    }

    const { pathname } = location;

    if (!isOnboarded) {
      if (pathname !== "/onboarding") {
        navigate("/onboarding", { replace: true });
      }
      return;
    }

    if (!isAuthenticated) {
      if (pathname !== "/login") {
        navigate("/login", { replace: true });
      }
      return;
    }

    if (pathname === "/" || pathname === "/login" || pathname === "/onboarding") {
      navigate("/dashboard", { replace: true });
    }
  }, [
    authLoading,
    isAppLoading,
    isAuthenticated,
    isOnboarded,
    location,
    navigate,
  ]);

  if (isAppLoading || authLoading) {
    return <AppLoadingScreen />;
  }

  return (
    <Suspense fallback={<AppLoadingScreen />}>
      <Routes>
        <Route path="/onboarding" element={<OnboardingForm />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="*"
          element={isAuthenticated ? <AppLayout /> : <Navigate to="/login" replace />}
        />
      </Routes>
    </Suspense>
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
