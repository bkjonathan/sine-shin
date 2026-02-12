import { useEffect, useState } from "react";
import { Routes, Route, useNavigate, Navigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import OnboardingForm from "./components/OnboardingForm";
import Dashboard from "./components/Dashboard";
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
      const result = await invoke<boolean>("check_is_onboarded");
      setIsOnboarded(result);
      if (result) {
        navigate("/dashboard", { replace: true });
      } else {
        navigate("/onboarding", { replace: true });
      }
    } catch (err) {
      console.error("Failed to check onboarding status:", err);
      // Default to onboarding if check fails
      navigate("/onboarding", { replace: true });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-[var(--color-border)] border-t-[var(--color-accent)] rounded-full animate-spin" />
          <p className="text-[var(--color-text-muted)] text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/onboarding" element={<OnboardingForm />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route
        path="*"
        element={
          <Navigate to={isOnboarded ? "/dashboard" : "/onboarding"} replace />
        }
      />
    </Routes>
  );
}

export default App;
