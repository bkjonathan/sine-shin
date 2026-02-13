import { useEffect, useState } from "react";
import { Routes, Route, useNavigate, Navigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import AppLayout from "./components/AppLayout";
import OnboardingForm from "./components/OnboardingForm";
import Dashboard from "./components/Dashboard";
import Settings from "./components/Settings";
import { ThemeProvider } from "./context/ThemeContext";
import "./index.css";

function App() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isOnboarded, setIsOnboarded] = useState(false);

  useEffect(() => {
    checkOnboarding();
  }, []);

  const checkOnboarding = async () => {
    try {
      if (window.__TAURI_INTERNALS__) {
        const result = await invoke<boolean>("check_is_onboarded");
        setIsOnboarded(result);
        if (result) {
          navigate("/dashboard", { replace: true });
        } else {
          navigate("/onboarding", { replace: true });
        }
      } else {
        // Browser mode — use localStorage to remember onboarding
        const browserOnboarded =
          localStorage.getItem("browser_onboarded") === "true";
        setIsOnboarded(browserOnboarded);
        if (browserOnboarded) {
          navigate("/dashboard", { replace: true });
        } else {
          navigate("/onboarding", { replace: true });
        }
      }
    } catch (err) {
      console.error("Failed to check onboarding status:", err);
      navigate("/onboarding", { replace: true });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center bg-[var(--color-liquid-bg)]">
        <div className="liquid-gradient">
          <div className="liquid-blob-3" />
        </div>
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-[var(--color-glass-border)] border-t-[var(--color-accent-blue)] rounded-full animate-spin" />
          <p className="text-[var(--color-text-muted)] text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <Routes>
        {/* Onboarding — Full screen, no layout shell */}
        <Route path="/onboarding" element={<OnboardingForm />} />

        {/* App shell with sidebar */}
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route
            path="/orders"
            element={
              <PlaceholderPage
                title="Orders"
                description="Order management coming soon"
              />
            }
          />
          <Route
            path="/customers"
            element={
              <PlaceholderPage
                title="Customers"
                description="Customer management coming soon"
              />
            }
          />
          <Route path="/settings" element={<Settings />} />
        </Route>

        {/* Fallback */}
        <Route
          path="*"
          element={
            <Navigate to={isOnboarded ? "/dashboard" : "/onboarding"} replace />
          }
        />
      </Routes>
    </ThemeProvider>
  );
}

// Placeholder for pages not yet built
function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px]">
      <div className="glass-panel p-12 text-center">
        <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">
          {title}
        </h2>
        <p className="text-[var(--color-text-secondary)]">{description}</p>
      </div>
    </div>
  );
}

export default App;
