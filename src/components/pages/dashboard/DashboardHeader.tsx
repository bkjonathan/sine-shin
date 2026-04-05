import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { LogOut, RefreshCw } from "lucide-react";

interface DashboardHeaderProps {
  logoSrc: string;
  shopName: string | null;
  onLogout: () => void;
  onReload: () => void;
  loading: boolean;
}

function getGreetingKey(hour: number): string {
  if (hour < 12) return "dashboard.good_morning";
  if (hour < 17) return "dashboard.good_afternoon";
  return "dashboard.good_evening";
}

export default function DashboardHeader({
  logoSrc,
  shopName,
  onLogout,
  onReload,
  loading,
}: DashboardHeaderProps) {
  const { t } = useTranslation();

  const greetingKey = useMemo(() => getGreetingKey(new Date().getHours()), []);

  return (
    <div className="flex items-center justify-between mb-5">
      {/* Left: logo + greeting */}
      <div className="flex items-center gap-3.5">
        {logoSrc && (
          <div className="w-11 h-11 rounded-xl overflow-hidden bg-glass-white border border-glass-border p-1 flex items-center justify-center shrink-0 shadow-sm">
            <img
              src={logoSrc}
              alt="Shop logo"
              className="w-full h-full object-contain rounded-lg"
            />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight leading-tight">
            {t(greetingKey)},{" "}
            <span className="bg-linear-to-r from-accent-blue to-accent-purple bg-clip-text text-transparent">
              {shopName ?? t("dashboard.welcome")}
            </span>
          </h1>
          <p className="text-[11px] text-text-muted mt-0.5">
            {new Date().toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onReload}
          disabled={loading}
          title={t("common.reload_data")}
          className="w-9 h-9 rounded-xl bg-glass-white border border-glass-border flex items-center justify-center text-text-muted hover:text-accent-blue hover:border-accent-blue/30 hover:bg-accent-blue/5 transition-all duration-200 disabled:opacity-40"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
        <button
          onClick={onLogout}
          title={t("app.logout")}
          className="w-9 h-9 rounded-xl bg-glass-white border border-glass-border flex items-center justify-center text-text-muted hover:text-error hover:border-error/30 hover:bg-error/5 transition-all duration-200"
        >
          <LogOut size={15} />
        </button>
      </div>
    </div>
  );
}
