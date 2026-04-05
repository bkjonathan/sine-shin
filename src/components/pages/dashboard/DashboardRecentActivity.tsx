import { useTranslation } from "react-i18next";
import { ChevronRight, ArrowUpRight } from "lucide-react";
import { DashboardOrder } from "../../../types/dashboard";

interface DashboardRecentActivityProps {
  orders: DashboardOrder[];
  formatPrice: (value: number) => string;
  onViewAll: () => void;
  onSelectOrder: (id: string) => void;
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

const AVATAR_GRADIENTS = [
  "from-blue-500 to-cyan-500",
  "from-violet-500 to-purple-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-sky-500 to-indigo-500",
];

function getAvatarGradient(name: string | null): string {
  if (!name) return AVATAR_GRADIENTS[0];
  const hash = name
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

export default function DashboardRecentActivity({
  orders,
  formatPrice,
  onViewAll,
  onSelectOrder,
}: DashboardRecentActivityProps) {
  const { t } = useTranslation();

  return (
    <div className="glass-panel flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-glass-border">
        <div>
          <h2 className="text-sm font-semibold text-text-primary leading-tight">
            {t("dashboard.recent_activity")}
          </h2>
          {orders.length > 0 && (
            <p className="text-[10px] text-text-muted mt-0.5">
              {orders.length} {orders.length === 1 ? "order" : "orders"}
            </p>
          )}
        </div>
        <button
          onClick={onViewAll}
          className="flex items-center gap-1 text-[11px] font-medium text-accent-blue hover:text-accent-purple transition-colors group"
        >
          {t("dashboard.view_all")}
          <ArrowUpRight size={12} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-200" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 px-3 py-2">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-text-muted">
            <div className="w-10 h-10 rounded-xl bg-glass-white border border-glass-border flex items-center justify-center mb-3">
              <ChevronRight size={18} className="opacity-40" />
            </div>
            <p className="text-xs">{t("dashboard.no_recent_orders")}</p>
          </div>
        ) : (
          <div className="divide-y divide-glass-border/40">
            {orders.map((order) => (
              <div
                key={order.id}
                onClick={() => onSelectOrder(order.id)}
                className="flex items-center gap-3 py-3 px-2 rounded-xl transition-all duration-200 hover:bg-white/[0.04] cursor-pointer group -mx-2"
              >
                {/* Avatar */}
                <div
                  className={`w-9 h-9 rounded-xl bg-linear-to-br ${getAvatarGradient(order.customer_name)} flex items-center justify-center text-[10px] font-bold text-white shrink-0 shadow-sm`}
                >
                  {getInitials(order.customer_name)}
                </div>

                {/* Name + Order ID */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate group-hover:text-accent-blue transition-colors leading-tight">
                    {order.customer_name || t("common.na")}
                  </p>
                  <p className="text-[10px] text-text-muted leading-tight mt-0.5 font-mono">
                    {order.order_id}
                  </p>
                </div>

                {/* Price */}
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-text-primary tabular-nums">
                    {formatPrice(order.total_price || 0)}
                  </p>
                  <p className="text-[10px] text-text-muted tabular-nums mt-0.5">
                    {formatRelativeDate(order.created_at)}
                  </p>
                </div>

                {/* Arrow */}
                <ChevronRight
                  size={14}
                  className="text-text-muted/40 group-hover:text-accent-blue group-hover:translate-x-0.5 transition-all duration-200 shrink-0"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
