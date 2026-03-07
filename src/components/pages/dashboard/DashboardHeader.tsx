import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { LogOut } from "lucide-react";

interface DashboardHeaderProps {
  logoSrc: string;
  shopName: string | null;
  onLogout: () => void;
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
}: DashboardHeaderProps) {
  const { t } = useTranslation();

  const greetingKey = useMemo(() => getGreetingKey(new Date().getHours()), []);

  return (
    <div className="mb-5 flex items-center justify-between">
      <div className="flex items-center gap-3.5">
        {logoSrc && (
          <div className="w-10 h-10 rounded-xl overflow-hidden bg-glass-white border border-glass-border p-1 flex items-center justify-center shrink-0">
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
        </div>
      </div>

      <button
        onClick={onLogout}
        className="w-9 h-9 rounded-xl bg-glass-white border border-glass-border flex items-center justify-center text-text-muted hover:text-error hover:border-error/30 hover:bg-error/5 transition-all duration-200"
        title={t("app.logout")}
      >
        <LogOut size={16} />
      </button>
    </div>
  );
}
