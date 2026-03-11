import { useTranslation } from "react-i18next";
import { DashboardOrder } from "../../../types/dashboard";
import { ChevronRight } from "lucide-react";

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

const AVATAR_COLORS = [
  "from-blue-500 to-cyan-500",
  "from-violet-500 to-purple-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-sky-500 to-indigo-500",
];

function getAvatarColor(name: string | null): string {
  if (!name) return AVATAR_COLORS[0];
  const hash = name
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export default function DashboardRecentActivity({
  orders,
  formatPrice,
  onViewAll,
  onSelectOrder,
}: DashboardRecentActivityProps) {
  const { t } = useTranslation();

  return (
    <div className="glass-panel p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-text-primary">
          {t("dashboard.recent_activity")}
        </h2>
        <button
          onClick={onViewAll}
          className="flex items-center gap-0.5 text-[11px] font-medium text-accent-blue hover:text-accent-purple transition-colors"
        >
          {t("dashboard.view_all")}
          <ChevronRight size={12} />
        </button>
      </div>

      <div className="space-y-0.5">
        {orders.map((order) => (
          <div
            key={order.id}
            onClick={() => onSelectOrder(order.id)}
            className="
              flex items-center gap-3 p-2.5 -mx-1 rounded-xl
              transition-all duration-200
              hover:bg-white/4 cursor-pointer group
              border-l-2 border-transparent hover:border-accent-blue
            "
          >
            {/* Avatar */}
            <div
              className={`w-8 h-8 rounded-lg bg-linear-to-br ${getAvatarColor(order.customer_name)} flex items-center justify-center text-[10px] font-bold text-white shrink-0 shadow-sm`}
            >
              {getInitials(order.customer_name)}
            </div>

            {/* Name + ID */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate group-hover:text-accent-blue transition-colors leading-tight">
                {order.customer_name || t("common.na")}
              </p>
              <p className="text-[10px] text-text-muted leading-tight mt-0.5">
                {order.order_id}
              </p>
            </div>

            {/* Price */}
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold text-text-primary tabular-nums">
                {formatPrice(order.total_price || 0)}
              </p>
            </div>

            {/* Date */}
            <div className="text-right shrink-0 w-20">
              <p className="text-[11px] text-text-muted tabular-nums">
                {order.created_at
                  ? new Date(order.created_at).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                    })
                  : ""}
              </p>
            </div>
          </div>
        ))}

        {orders.length === 0 && (
          <div className="text-center py-8 text-text-muted text-xs">
            {t("dashboard.no_recent_orders")}
          </div>
        )}
      </div>
    </div>
  );
}
