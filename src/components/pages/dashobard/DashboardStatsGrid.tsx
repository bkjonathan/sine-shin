import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DollarSign, ShoppingBag, TrendingUp, Truck, Users } from "lucide-react";
import { DashboardStats } from "../../../types/dashboard";

interface DashboardStatsGridProps {
  stats: DashboardStats | null;
  formatPrice: (value: number) => string;
}

export default function DashboardStatsGrid({
  stats,
  formatPrice,
}: DashboardStatsGridProps) {
  const { t } = useTranslation();

  const statCards = useMemo(
    () => [
      {
        label: "dashboard.total_revenue",
        value: stats ? formatPrice(stats.total_revenue) : "-",
        gradient: "from-accent-blue to-accent-cyan",
        icon: DollarSign,
      },
      {
        label: "dashboard.total_orders",
        value: stats ? stats.total_orders.toString() : "-",
        gradient: "from-accent-purple to-accent-pink",
        icon: ShoppingBag,
      },
      {
        label: "dashboard.total_customers",
        value: stats ? stats.total_customers.toString() : "-",
        gradient: "from-emerald-500 to-teal-500",
        icon: Users,
      },
      {
        label: "dashboard.total_profit",
        value: stats ? formatPrice(stats.total_profit) : "-",
        gradient: "from-amber-500 to-orange-500",
        icon: TrendingUp,
      },
      {
        label: "dashboard.total_cargo_fee",
        value: stats ? formatPrice(stats.total_cargo_fee) : "-",
        gradient: "from-sky-500 to-indigo-500",
        icon: Truck,
      },
    ],
    [formatPrice, stats],
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
      {statCards.map((stat) => (
        <div key={stat.label} className="glass-panel p-5 group hover:bg-white/8 transition-colors duration-300">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
              {t(stat.label)}
            </span>
            <div
              className={`w-8 h-8 rounded-lg bg-linear-to-br ${stat.gradient} flex items-center justify-center opacity-80`}
            >
              <stat.icon className="text-white w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-text-primary">{stat.value}</p>
        </div>
      ))}
    </div>
  );
}
