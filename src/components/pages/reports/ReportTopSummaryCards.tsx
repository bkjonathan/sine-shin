import { Building2, Globe, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BreakdownRow, CustomerPerformance } from "../../../types/report";

interface ReportTopSummaryCardsProps {
  topCity?: BreakdownRow;
  topPlatform?: BreakdownRow;
  topCustomer?: CustomerPerformance;
  formatPrice: (amount: number) => string;
}

export default function ReportTopSummaryCards({
  topCity,
  topPlatform,
  topCustomer,
  formatPrice,
}: ReportTopSummaryCardsProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="glass-panel p-5">
        <div className="flex items-center gap-2 mb-2">
          <MapPin size={16} className="text-accent-cyan" />
          <p className="text-sm text-text-muted uppercase tracking-wider">
            {t("reports.top_city")}
          </p>
        </div>
        <p className="text-xl font-bold text-text-primary">{topCity?.name || t("common.na")}</p>
        <p className="text-sm text-text-secondary mt-1">
          {topCity
            ? t("reports.orders_and_profit", {
                orders: topCity.orders.toLocaleString(),
                profit: formatPrice(topCity.profit),
              })
            : t("reports.chart_no_data")}
        </p>
      </div>

      <div className="glass-panel p-5">
        <div className="flex items-center gap-2 mb-2">
          <Globe size={16} className="text-accent-blue" />
          <p className="text-sm text-text-muted uppercase tracking-wider">
            {t("reports.top_platform")}
          </p>
        </div>
        <p className="text-xl font-bold text-text-primary">
          {topPlatform?.name || t("common.na")}
        </p>
        <p className="text-sm text-text-secondary mt-1">
          {topPlatform
            ? t("reports.orders_and_profit", {
                orders: topPlatform.orders.toLocaleString(),
                profit: formatPrice(topPlatform.profit),
              })
            : t("reports.chart_no_data")}
        </p>
      </div>

      <div className="glass-panel p-5">
        <div className="flex items-center gap-2 mb-2">
          <Building2 size={16} className="text-emerald-400" />
          <p className="text-sm text-text-muted uppercase tracking-wider">
            {t("reports.top_customer")}
          </p>
        </div>
        <p className="text-xl font-bold text-text-primary truncate">
          {topCustomer?.name || t("common.na")}
        </p>
        <p className="text-sm text-text-secondary mt-1">
          {topCustomer
            ? t("reports.orders_and_profit", {
                orders: topCustomer.orders.toLocaleString(),
                profit: formatPrice(topCustomer.profit),
              })
            : t("reports.chart_no_data")}
        </p>
      </div>
    </div>
  );
}
