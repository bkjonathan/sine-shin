import { useTranslation } from "react-i18next";
import { CustomerPerformance } from "../../../types/report";

interface ReportTopCustomersTableProps {
  customers: CustomerPerformance[];
  formatPrice: (amount: number) => string;
}

export default function ReportTopCustomersTable({
  customers,
  formatPrice,
}: ReportTopCustomersTableProps) {
  const { t } = useTranslation();

  return (
    <div className="glass-panel p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            {t("reports.top_customers_title")}
          </h2>
          <p className="text-sm text-text-muted mt-1">{t("reports.top_customers_hint")}</p>
        </div>
      </div>

      <div className="overflow-auto">
        <table className="w-full min-w-[840px] text-sm">
          <thead className="text-xs uppercase tracking-wider text-text-muted border-b border-glass-border">
            <tr>
              <th className="text-left py-3 px-3">{t("customers.name")}</th>
              <th className="text-left py-3 px-3">{t("customers.form.city")}</th>
              <th className="text-left py-3 px-3">{t("customers.form.platform")}</th>
              <th className="text-right py-3 px-3">{t("reports.total_orders")}</th>
              <th className="text-right py-3 px-3">{t("reports.total_revenue")}</th>
              <th className="text-right py-3 px-3">{t("reports.total_profit")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-glass-border">
            {customers.slice(0, 12).map((customer) => (
              <tr key={customer.key} className="hover:bg-glass-white/40 transition-colors">
                <td className="py-3 px-3 text-text-primary font-medium">{customer.name}</td>
                <td className="py-3 px-3 text-text-secondary">{customer.city}</td>
                <td className="py-3 px-3 text-text-secondary">{customer.platform}</td>
                <td className="py-3 px-3 text-right text-text-primary">
                  {customer.orders.toLocaleString()}
                </td>
                <td className="py-3 px-3 text-right text-text-primary">
                  {formatPrice(customer.revenue)}
                </td>
                <td className="py-3 px-3 text-right text-emerald-400 font-semibold">
                  {formatPrice(customer.profit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
