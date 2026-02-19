import { useTranslation } from "react-i18next";
import { formatDate } from "../../../utils/date";
import { Button } from "../../ui";
import { EnrichedOrder } from "../../../types/report";

interface ReportTopOrdersTableProps {
  orders: EnrichedOrder[];
  formatPrice: (amount: number) => string;
  onViewOrder: (orderId: number) => void;
}

export default function ReportTopOrdersTable({
  orders,
  formatPrice,
  onViewOrder,
}: ReportTopOrdersTableProps) {
  const { t } = useTranslation();

  return (
    <div className="glass-panel p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            {t("reports.top_orders_title")}
          </h2>
          <p className="text-sm text-text-muted mt-1">{t("reports.top_orders_hint")}</p>
        </div>
      </div>

      <div className="overflow-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="text-xs uppercase tracking-wider text-text-muted border-b border-glass-border">
            <tr>
              <th className="text-left py-3 px-3">{t("orders.search_key_order_id")}</th>
              <th className="text-left py-3 px-3">{t("orders.customer")}</th>
              <th className="text-left py-3 px-3">{t("customers.form.platform")}</th>
              <th className="text-left py-3 px-3">{t("customers.form.city")}</th>
              <th className="text-right py-3 px-3">{t("reports.total_revenue")}</th>
              <th className="text-right py-3 px-3">{t("reports.total_profit")}</th>
              <th className="text-right py-3 px-3">{t("orders.date")}</th>
              <th className="text-right py-3 px-3">{t("account_book.action")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-glass-border">
            {orders.map((order) => (
              <tr key={order.id} className="hover:bg-glass-white/40 transition-colors">
                <td className="py-3 px-3 text-text-primary font-medium">
                  {order.order_id || order.id}
                </td>
                <td className="py-3 px-3 text-text-secondary">{order.customerLabel}</td>
                <td className="py-3 px-3 text-text-secondary">{order.platform}</td>
                <td className="py-3 px-3 text-text-secondary">{order.city}</td>
                <td className="py-3 px-3 text-right text-text-primary">
                  {formatPrice(order.revenue)}
                </td>
                <td className="py-3 px-3 text-right text-emerald-400 font-semibold">
                  {formatPrice(order.profit)}
                </td>
                <td className="py-3 px-3 text-right text-text-secondary">
                  {formatDate(order.timelineDate)}
                </td>
                <td className="py-3 px-3 text-right">
                  <Button
                    type="button"
                    onClick={() => onViewOrder(order.id)}
                    variant="ghost"
                    className="px-3 py-1.5 text-xs"
                  >
                    {t("reports.view_order")}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
