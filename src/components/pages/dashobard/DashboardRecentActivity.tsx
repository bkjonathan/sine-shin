import { useTranslation } from "react-i18next";
import { DashboardOrder } from "../../../types/dashboard";

interface DashboardRecentActivityProps {
  orders: DashboardOrder[];
  formatPrice: (value: number) => string;
  onViewAll: () => void;
  onSelectOrder: (id: number) => void;
}

function getInitials(name: string | null): string {
  if (!name) return "?";

  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function calculateServiceFee(order: DashboardOrder): number {
  const fee = order.service_fee || 0;
  const totalPrice = order.total_price || 0;

  if (order.service_fee_type === "percent") {
    return totalPrice * (fee / 100);
  }

  return fee;
}

export default function DashboardRecentActivity({
  orders,
  formatPrice,
  onViewAll,
  onSelectOrder,
}: DashboardRecentActivityProps) {
  const { t } = useTranslation();

  return (
    <div className="glass-panel p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-text-primary">
          {t("dashboard.recent_activity")}
        </h2>
        <button
          onClick={onViewAll}
          className="text-xs font-medium text-accent-blue hover:text-accent-purple transition-colors"
        >
          {t("dashboard.view_all")}
        </button>
      </div>

      <div className="space-y-1">
        {orders.map((order) => (
          <div
            key={order.id}
            onClick={() => onSelectOrder(order.id)}
            className="flex items-center justify-between p-3 rounded-xl transition-colors duration-200 hover:bg-white/4 cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-accent-blue/10 flex items-center justify-center text-sm font-bold text-accent-blue">
                {getInitials(order.customer_name)}
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary group-hover:text-accent-blue transition-colors">
                  {order.customer_name || t("common.na")}
                </p>
                <p className="text-xs text-text-muted">{order.order_id}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-end mr-2">
                <span className="text-xs text-text-secondary">
                  {t("dashboard.service_fee")}
                </span>
                <span className="text-sm font-medium text-text-primary">
                  {formatPrice(calculateServiceFee(order))}
                </span>
              </div>

              <div className="flex flex-col items-end mr-2">
                <span className="text-xs text-text-secondary">
                  {t("dashboard.price")}
                </span>
                <span className="text-sm font-semibold text-text-primary">
                  {formatPrice(order.total_price || 0)}
                </span>
              </div>

              <div className="flex flex-col items-end w-24">
                <span className="text-xs text-text-secondary">
                  {t("dashboard.order_date")}
                </span>
                <span className="text-sm font-medium text-text-primary text-right">
                  {order.created_at
                    ? new Date(order.created_at).toLocaleDateString()
                    : ""}
                </span>
              </div>
            </div>
          </div>
        ))}

        {orders.length === 0 && (
          <div className="text-center py-8 text-text-muted text-sm">
            {t("dashboard.no_recent_orders")}
          </div>
        )}
      </div>
    </div>
  );
}
