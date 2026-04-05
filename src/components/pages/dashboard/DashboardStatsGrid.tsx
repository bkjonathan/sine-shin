import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart2,
  CheckCircle2,
  CircleMinus,
  Clock,
  DollarSign,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react";

import type {
  DashboardRecordType,
  DashboardStats,
} from "../../../types/dashboard";

type DashboardStatCardKey =
  | "revenue"
  | "orders"
  | "customers"
  | "net_revenue"
  | "avg_order"
  | DashboardRecordType;

interface DashboardStatCard {
  key: DashboardStatCardKey;
  label: string;
  value: string;
  hint?: string;
  gradient: string;
  iconGradient: string;
  icon: typeof DollarSign;
  clickable: boolean;
  progress?: number;
}

interface DashboardStatsGridProps {
  stats: DashboardStats | null;
  formatPrice: (value: number) => string;
  onCardClick?: (key: string) => void;
}

export default function DashboardStatsGrid({
  stats,
  formatPrice,
  onCardClick,
}: DashboardStatsGridProps) {
  const { t } = useTranslation();

  const cargoRate = useMemo(() => {
    if (!stats || stats.total_cargo_fee === 0) return 0;
    return Math.min(
      100,
      Math.round((stats.paid_cargo_fee / stats.total_cargo_fee) * 100),
    );
  }, [stats]);

  const financialCards = useMemo<DashboardStatCard[]>(
    () => [
      {
        key: "revenue",
        label: t("dashboard.total_revenue"),
        value: stats ? formatPrice(stats.total_revenue) : "—",
        gradient: "from-blue-500/15 to-cyan-500/5",
        iconGradient: "from-blue-500 to-cyan-400",
        icon: DollarSign,
        clickable: false,
      },
      {
        key: "profit",
        label: t("dashboard.total_profit"),
        value: stats ? formatPrice(stats.total_profit) : "—",
        gradient: "from-amber-500/15 to-orange-500/5",
        iconGradient: "from-amber-500 to-orange-400",
        icon: TrendingUp,
        clickable: true,
      },
      {
        key: "net_revenue",
        label: t("dashboard.net_revenue"),
        value: stats
          ? formatPrice(stats.total_revenue - stats.total_cargo_fee)
          : "—",
        hint: t("dashboard.net_revenue_hint"),
        gradient: "from-violet-500/15 to-purple-500/5",
        iconGradient: "from-violet-500 to-purple-400",
        icon: TrendingDown,
        clickable: false,
      },
      {
        key: "avg_order",
        label: t("dashboard.avg_order_value"),
        value:
          stats && stats.total_orders > 0
            ? formatPrice(stats.total_revenue / stats.total_orders)
            : "—",
        gradient: "from-emerald-500/15 to-teal-500/5",
        iconGradient: "from-emerald-500 to-teal-400",
        icon: BarChart2,
        clickable: false,
      },
    ],
    [formatPrice, stats, t],
  );

  const operationsCards = useMemo<DashboardStatCard[]>(
    () => [
      {
        key: "orders",
        label: t("dashboard.total_orders"),
        value: stats ? stats.total_orders.toString() : "—",
        gradient: "from-indigo-500/15 to-violet-500/5",
        iconGradient: "from-indigo-500 to-violet-400",
        icon: ShoppingBag,
        clickable: false,
      },
      {
        key: "customers",
        label: t("dashboard.total_customers"),
        value: stats ? stats.total_customers.toString() : "—",
        gradient: "from-sky-500/15 to-cyan-500/5",
        iconGradient: "from-sky-500 to-cyan-400",
        icon: Users,
        clickable: false,
      },
      {
        key: "cargo",
        label: t("dashboard.total_cargo_fee"),
        value: stats ? formatPrice(stats.total_cargo_fee) : "—",
        gradient: "from-sky-500/15 to-indigo-500/5",
        iconGradient: "from-sky-500 to-indigo-400",
        icon: Truck,
        clickable: true,
        progress: stats && stats.total_cargo_fee > 0 ? cargoRate : undefined,
      },
      {
        key: "paid_cargo",
        label: t("dashboard.paid_cargo_fee"),
        value: stats ? formatPrice(stats.paid_cargo_fee) : "—",
        gradient: "from-emerald-500/15 to-teal-500/5",
        iconGradient: "from-emerald-500 to-teal-400",
        icon: CheckCircle2,
        clickable: true,
      },
      {
        key: "unpaid_cargo",
        label: t("dashboard.unpaid_cargo_fee"),
        value: stats ? formatPrice(stats.unpaid_cargo_fee) : "—",
        gradient: "from-rose-500/15 to-red-500/5",
        iconGradient: "from-rose-500 to-red-400",
        icon: Clock,
        clickable: true,
      },
      {
        key: "excluded_cargo",
        label: t("dashboard.excluded_cargo_fee"),
        value: stats ? formatPrice(stats.excluded_cargo_total) : "—",
        hint: t("dashboard.excluded_cargo_hint"),
        gradient: "from-fuchsia-500/15 to-pink-500/5",
        iconGradient: "from-fuchsia-500 to-pink-400",
        icon: CircleMinus,
        clickable: true,
      },
    ],
    [formatPrice, stats, cargoRate, t],
  );

  const renderFinancialCard = (stat: DashboardStatCard) => (
    <div
      key={stat.key}
      onClick={
        stat.clickable && onCardClick ? () => onCardClick(stat.key) : undefined
      }
      className={`
        relative overflow-hidden rounded-2xl p-5
        bg-linear-to-br ${stat.gradient}
        border border-glass-border backdrop-blur-sm
        group transition-all duration-300
        ${
          stat.clickable && onCardClick
            ? "cursor-pointer hover:-translate-y-1 hover:shadow-xl hover:shadow-black/30 hover:border-glass-border-light"
            : ""
        }
      `}
    >
      {stat.clickable && (
        <div className="absolute inset-0 rounded-2xl bg-white/0 group-hover:bg-white/[0.02] transition-colors duration-300" />
      )}

      <div className="flex items-center gap-4">
        {/* Icon */}
        <div
          className={`w-11 h-11 rounded-xl bg-linear-to-br ${stat.iconGradient} flex items-center justify-center shadow-lg shrink-0 group-hover:scale-105 transition-transform duration-300`}
        >
          <stat.icon className="text-white w-5 h-5" />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-semibold text-text-muted uppercase tracking-[0.12em] mb-1 leading-none">
            {stat.label}
          </p>
          <p className="text-2xl font-bold text-text-primary tracking-tight leading-none">
            {stat.value}
          </p>
          {stat.hint && (
            <p className="text-[9px] text-text-muted mt-1.5 leading-tight">
              {stat.hint}
            </p>
          )}
        </div>

        {/* Clickable indicator */}
        {stat.clickable && (
          <div className="w-1.5 h-1.5 rounded-full bg-accent-blue/30 group-hover:bg-accent-blue transition-colors duration-200 shrink-0" />
        )}
      </div>
    </div>
  );

  const renderOperationCard = (stat: DashboardStatCard) => (
    <div
      key={stat.key}
      onClick={
        stat.clickable && onCardClick ? () => onCardClick(stat.key) : undefined
      }
      className={`
        relative overflow-hidden rounded-xl p-3.5
        bg-linear-to-br ${stat.gradient}
        border border-glass-border backdrop-blur-sm
        group transition-all duration-300
        ${
          stat.clickable && onCardClick
            ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 hover:border-glass-border-light"
            : ""
        }
      `}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-8 h-8 rounded-lg bg-linear-to-br ${stat.iconGradient} flex items-center justify-center shadow shrink-0`}
        >
          <stat.icon className="text-white w-3.5 h-3.5" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[8px] font-semibold text-text-muted uppercase tracking-[0.1em] leading-none mb-1">
            {stat.label}
          </p>
          <p className="text-base font-bold text-text-primary tracking-tight leading-none">
            {stat.value}
          </p>
        </div>

        {stat.clickable && (
          <div className="w-1.5 h-1.5 rounded-full bg-accent-blue/30 group-hover:bg-accent-blue transition-colors duration-200 shrink-0" />
        )}
      </div>

      {stat.progress !== undefined && (
        <div className="mt-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[8px] text-text-muted">{stat.progress}% collected</span>
          </div>
          <div className="h-0.5 w-full bg-black/20 rounded-full overflow-hidden">
            <div
              className={`h-full bg-linear-to-r ${stat.iconGradient} rounded-full transition-all duration-500`}
              style={{ width: `${stat.progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="mb-4 space-y-3">
      {/* Financial KPIs */}
      <div>
        <div className="flex items-center gap-2 mb-2.5 px-0.5">
          <span className="text-[10px] font-semibold text-text-muted/60 uppercase tracking-[0.14em] shrink-0">
            {t("dashboard.section_financials")}
          </span>
          <div className="flex-1 h-px bg-glass-border" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {financialCards.map(renderFinancialCard)}
        </div>
      </div>

      {/* Operations */}
      <div>
        <div className="flex items-center gap-2 mb-2.5 px-0.5">
          <span className="text-[10px] font-semibold text-text-muted/60 uppercase tracking-[0.14em] shrink-0">
            {t("dashboard.section_operations")}
          </span>
          <div className="flex-1 h-px bg-glass-border" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {operationsCards.map(renderOperationCard)}
        </div>
      </div>
    </div>
  );
}
