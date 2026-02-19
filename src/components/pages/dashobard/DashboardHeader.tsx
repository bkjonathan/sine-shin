import { useTranslation } from "react-i18next";
import { Button } from "../../../components/ui";

interface DashboardHeaderProps {
  logoSrc: string;
  shopName: string | null;
  onLogout: () => void;
}

export default function DashboardHeader({
  logoSrc,
  shopName,
  onLogout,
}: DashboardHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="mb-8 flex items-center justify-between">
      <div className="flex items-center gap-4">
        {logoSrc && (
          <div className="w-12 h-12 rounded-2xl overflow-hidden glass-panel p-1.5 flex items-center justify-center">
            <img
              src={logoSrc}
              alt="Shop logo"
              className="w-full h-full object-contain rounded-xl"
            />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            {shopName
              ? t("dashboard.welcome_back", { name: shopName })
              : t("dashboard.welcome")}
          </h1>
          <p className="text-sm text-text-muted">{t("dashboard.happening_today")}</p>
        </div>
      </div>

      <Button onClick={onLogout} variant="ghost" className="text-sm px-4 py-2">
        {t("app.logout")}
      </Button>
    </div>
  );
}
