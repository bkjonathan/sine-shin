import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  DollarSign,
  ShoppingBag,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react";
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
        gradient: "from-blue-500/15 to-cyan-500/10",
        iconGradient: "from-blue-500 to-cyan-500",
        icon: DollarSign,
      },
      {
        label: "dashboard.total_orders",
        value: stats ? stats.total_orders.toString() : "-",
        gradient: "from-violet-500/15 to-purple-500/10",
        iconGradient: "from-violet-500 to-purple-500",
        icon: ShoppingBag,
      },
      {
        label: "dashboard.total_customers",
        value: stats ? stats.total_customers.toString() : "-",
        gradient: "from-emerald-500/15 to-teal-500/10",
        iconGradient: "from-emerald-500 to-teal-500",
        icon: Users,
      },
      {
        label: "dashboard.total_profit",
        value: stats ? formatPrice(stats.total_profit) : "-",
        gradient: "from-amber-500/15 to-orange-500/10",
        iconGradient: "from-amber-500 to-orange-500",
        icon: TrendingUp,
      },
      {
        label: "dashboard.total_cargo_fee",
        value: stats ? formatPrice(stats.total_cargo_fee) : "-",
        gradient: "from-sky-500/15 to-indigo-500/10",
        iconGradient: "from-sky-500 to-indigo-500",
        icon: Truck,
      },
    ],
    [formatPrice, stats],
  );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
      {statCards.map((stat) => (
        <div
          key={stat.label}
          className={`
            relative overflow-hidden rounded-2xl p-4
            bg-linear-to-br ${stat.gradient}
            border border-glass-border
            backdrop-blur-sm
            group cursor-default
            transition-all duration-300
            hover:-translate-y-0.5 hover:shadow-lg hover:shadow-accent-blue/5
            hover:border-glass-border-light
          `}
        >
          <div className="flex items-center gap-2.5 mb-2.5">
            <div
              className={`w-8 h-8 rounded-xl bg-linear-to-br ${stat.iconGradient} flex items-center justify-center shadow-lg`}
            >
              <stat.icon className="text-white w-4 h-4" />
            </div>
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider leading-tight">
              {t(stat.label)}
            </span>
          </div>
          <p className="text-xl font-bold text-text-primary tracking-tight">
            {stat.value}
          </p>
        </div>
      ))}
    </div>
  );
}
