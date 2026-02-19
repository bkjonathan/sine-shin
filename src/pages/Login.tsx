import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import { IconLogIn } from "../components/icons";
import { Button, Input } from "../components/ui";

interface LoginUserResponse {
  name: string;
  role: string;
}

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      if (window.__TAURI_INTERNALS__) {
        const user = await invoke<LoginUserResponse>("login_user", {
          name,
          password,
        });
        await login({ name: user.name, role: user.role });
        navigate("/dashboard", { replace: true });
      } else {
        // Browser mock
        if (name === "admin" && password === "admin") {
          await login({ name, role: "admin" });
          navigate("/dashboard", { replace: true });
        } else {
          throw new Error("Invalid credentials (try admin/admin in browser)");
        }
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : t("auth.login.error_failed");
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      data-tauri-drag-region
      className="w-full min-h-screen flex items-center justify-center overflow-hidden"
    >
      {/* ── Animated Mesh Gradient Background ── */}
      <div className="liquid-gradient">
        <div className="liquid-blob-1" />
        <div className="liquid-blob-2" />
        <div className="liquid-blob-3" />
      </div>

      <div className="relative z-10 w-full max-w-[400px] mx-4">
        <div className="glass-panel p-8">
          <div className="text-center mb-8">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-linear-to-br from-accent-blue to-accent-purple flex items-center justify-center mb-4 shadow-[0_8px_30px_rgba(91,127,255,0.3)]">
              <IconLogIn size={28} strokeWidth={2} stroke="white" />
            </div>
            <h1 className="text-2xl font-bold text-text-primary mb-2">
              {t("auth.login.welcome")}
            </h1>
            <p className="text-sm text-text-secondary">
              {t("auth.login.subtitle")}
            </p>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: "auto", marginBottom: 24 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-error text-sm mb-6 text-center"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleLogin} className="space-y-5">
            <Input
              label={t("auth.login.username")}
              type="text"
              placeholder={t("auth.login.enter_username")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              label={t("auth.login.password")}
              type="password"
              placeholder={t("auth.login.enter_password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <Button
              type="submit"
              variant="primary"
              fullWidth
              size="lg"
              className="mt-4"
              loading={isSubmitting}
              loadingText={t("auth.login.signing_in")}
            >
              {t("auth.login.sign_in")}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
